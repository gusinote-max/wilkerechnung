from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Query
from fastapi.responses import Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timedelta
import base64
import httpx
import json
from enum import Enum
from lxml import etree
import io

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'invoice_management')]

# Create the main app
app = FastAPI(title="Candis-Kopie - KI-Rechnungsmanagement")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ===================== ENUMS =====================
class InvoiceStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    ARCHIVED = "archived"

class ExportFormat(str, Enum):
    DATEV_ASCII = "datev_ascii"
    DATEV_XML = "datev_xml"
    ZUGFERD = "zugferd"
    XRECHNUNG = "xrechnung"

# ===================== MODELS =====================
class LineItem(BaseModel):
    description: str = ""
    quantity: float = 1.0
    unit_price: float = 0.0
    total: float = 0.0
    tax_rate: float = 19.0

class InvoiceData(BaseModel):
    invoice_number: str = ""
    invoice_date: str = ""
    due_date: str = ""
    vendor_name: str = ""
    vendor_address: str = ""
    vendor_vat_id: str = ""
    vendor_iban: str = ""
    vendor_bic: str = ""
    buyer_name: str = ""
    buyer_address: str = ""
    buyer_vat_id: str = ""
    net_amount: float = 0.0
    vat_amount: float = 0.0
    vat_rate: float = 19.0
    gross_amount: float = 0.0
    currency: str = "EUR"
    line_items: List[LineItem] = []
    payment_terms: str = ""
    notes: str = ""

class Invoice(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    status: InvoiceStatus = InvoiceStatus.PENDING
    data: InvoiceData = Field(default_factory=InvoiceData)
    image_base64: Optional[str] = None
    ocr_raw_response: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    archived_at: Optional[datetime] = None
    gobd_hash: Optional[str] = None

class InvoiceCreate(BaseModel):
    image_base64: str
    
class InvoiceUpdate(BaseModel):
    data: InvoiceData

class ApprovalRequest(BaseModel):
    approved_by: str
    comment: Optional[str] = None

class RejectionRequest(BaseModel):
    rejected_by: str
    reason: str

class AISettings(BaseModel):
    provider: str = "openrouter"
    api_key: str = ""
    model: str = "openai/gpt-4o"
    
class Settings(BaseModel):
    id: str = "global_settings"
    ai_settings: AISettings = Field(default_factory=AISettings)
    company_name: str = "Meine Firma GmbH"
    company_address: str = ""
    company_vat_id: str = ""
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class WebhookConfig(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    url: str
    events: List[str] = []  # invoice.created, invoice.approved, invoice.rejected
    active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)

class AuditLog(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    invoice_id: str
    action: str
    actor: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    details: Dict[str, Any] = {}

# ===================== HELPER FUNCTIONS =====================

async def get_settings() -> Settings:
    """Get global settings from database"""
    settings_doc = await db.settings.find_one({"id": "global_settings"})
    if settings_doc:
        return Settings(**settings_doc)
    # Create default settings with OpenRouter key from env
    default_settings = Settings(
        ai_settings=AISettings(
            provider="openrouter",
            api_key=os.environ.get('OPENROUTER_API_KEY', ''),
            model="openai/gpt-4o"
        )
    )
    await db.settings.insert_one(default_settings.model_dump())
    return default_settings

async def log_audit(invoice_id: str, action: str, actor: str, details: dict = {}):
    """Log an audit entry for GoBD compliance"""
    audit = AuditLog(
        invoice_id=invoice_id,
        action=action,
        actor=actor,
        details=details
    )
    await db.audit_logs.insert_one(audit.model_dump())

async def trigger_webhooks(event: str, data: dict):
    """Trigger n8n webhooks for an event"""
    webhooks = await db.webhooks.find({"events": event, "active": True}).to_list(100)
    async with httpx.AsyncClient() as client:
        for webhook in webhooks:
            try:
                await client.post(
                    webhook['url'],
                    json={"event": event, "data": data},
                    timeout=10.0
                )
                logger.info(f"Webhook triggered: {webhook['name']} for {event}")
            except Exception as e:
                logger.error(f"Webhook failed: {webhook['name']} - {str(e)}")

def generate_gobd_hash(invoice_data: dict) -> str:
    """Generate a GoBD-compliant hash for the invoice"""
    import hashlib
    content = json.dumps(invoice_data, sort_keys=True, default=str)
    return hashlib.sha256(content.encode()).hexdigest()

async def extract_invoice_with_ai(image_base64: str) -> InvoiceData:
    """Extract invoice data using OpenRouter AI"""
    settings = await get_settings()
    
    if not settings.ai_settings.api_key:
        raise HTTPException(status_code=400, detail="AI API Key nicht konfiguriert")
    
    prompt = """Analysiere diese deutsche Rechnung und extrahiere alle relevanten Daten im folgenden JSON-Format.
Antworte NUR mit dem JSON, ohne zusätzlichen Text:

{
    "invoice_number": "Rechnungsnummer",
    "invoice_date": "YYYY-MM-DD",
    "due_date": "YYYY-MM-DD (falls vorhanden)",
    "vendor_name": "Name des Lieferanten/Verkäufers",
    "vendor_address": "Vollständige Adresse",
    "vendor_vat_id": "USt-IdNr. (DE...)",
    "vendor_iban": "IBAN",
    "vendor_bic": "BIC",
    "buyer_name": "Name des Käufers/Empfängers",
    "buyer_address": "Vollständige Adresse",
    "buyer_vat_id": "USt-IdNr. des Käufers",
    "net_amount": 0.00,
    "vat_amount": 0.00,
    "vat_rate": 19.0,
    "gross_amount": 0.00,
    "currency": "EUR",
    "line_items": [
        {
            "description": "Beschreibung",
            "quantity": 1,
            "unit_price": 0.00,
            "total": 0.00,
            "tax_rate": 19.0
        }
    ],
    "payment_terms": "Zahlungsbedingungen",
    "notes": "Weitere Notizen"
}

Falls ein Feld nicht gefunden wird, verwende einen leeren String oder 0 für Zahlen."""

    # Determine media type from base64
    media_type = "image/jpeg"
    if image_base64.startswith("data:"):
        # Extract media type from data URL
        parts = image_base64.split(";base64,")
        if len(parts) == 2:
            media_type = parts[0].replace("data:", "")
            image_base64 = parts[1]
    
    try:
        async with httpx.AsyncClient() as http_client:
            response = await http_client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.ai_settings.api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://candis-kopie.app",
                    "X-Title": "Candis-Kopie Invoice OCR"
                },
                json={
                    "model": settings.ai_settings.model,
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": prompt},
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": f"data:{media_type};base64,{image_base64}"
                                    }
                                }
                            ]
                        }
                    ],
                    "max_tokens": 2000,
                    "temperature": 0.1
                },
                timeout=60.0
            )
            
            if response.status_code != 200:
                logger.error(f"OpenRouter API error: {response.text}")
                raise HTTPException(status_code=500, detail=f"AI API Fehler: {response.text}")
            
            result = response.json()
            content = result['choices'][0]['message']['content']
            
            # Parse JSON from response
            # Sometimes the AI wraps it in markdown code blocks
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]
            
            parsed_data = json.loads(content.strip())
            
            # Convert line_items
            line_items = []
            for item in parsed_data.get('line_items', []):
                line_items.append(LineItem(**item))
            
            invoice_data = InvoiceData(
                invoice_number=str(parsed_data.get('invoice_number', '')),
                invoice_date=str(parsed_data.get('invoice_date', '')),
                due_date=str(parsed_data.get('due_date', '')),
                vendor_name=str(parsed_data.get('vendor_name', '')),
                vendor_address=str(parsed_data.get('vendor_address', '')),
                vendor_vat_id=str(parsed_data.get('vendor_vat_id', '')),
                vendor_iban=str(parsed_data.get('vendor_iban', '')),
                vendor_bic=str(parsed_data.get('vendor_bic', '')),
                buyer_name=str(parsed_data.get('buyer_name', '')),
                buyer_address=str(parsed_data.get('buyer_address', '')),
                buyer_vat_id=str(parsed_data.get('buyer_vat_id', '')),
                net_amount=float(parsed_data.get('net_amount', 0)),
                vat_amount=float(parsed_data.get('vat_amount', 0)),
                vat_rate=float(parsed_data.get('vat_rate', 19)),
                gross_amount=float(parsed_data.get('gross_amount', 0)),
                currency=str(parsed_data.get('currency', 'EUR')),
                line_items=line_items,
                payment_terms=str(parsed_data.get('payment_terms', '')),
                notes=str(parsed_data.get('notes', ''))
            )
            
            return invoice_data
            
    except json.JSONDecodeError as e:
        logger.error(f"JSON parse error: {str(e)}")
        raise HTTPException(status_code=500, detail="Fehler beim Parsen der AI-Antwort")
    except Exception as e:
        logger.error(f"AI extraction error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"AI Fehler: {str(e)}")

# ===================== DATEV EXPORT FUNCTIONS =====================

def generate_datev_ascii(invoices: List[dict]) -> str:
    """Generate DATEV ASCII export format"""
    lines = []
    # Header
    lines.append('"EXTF";700;21;"Buchungsstapel";11;20250101;;"RE";"";""')
    lines.append('"Umsatz (ohne Soll/Haben-Kz)";"Soll/Haben-Kennzeichen";"WKZ Umsatz";"Kurs";"Basis-Umsatz";"WKZ Basis-Umsatz";"Konto";"Gegenkonto (ohne BU-Schlüssel)";"BU-Schlüssel";"Belegdatum";"Belegfeld 1";"Belegfeld 2";"Skonto";"Buchungstext"')
    
    for inv in invoices:
        data = inv.get('data', {})
        gross = data.get('gross_amount', 0)
        date_str = data.get('invoice_date', '').replace('-', '')
        if len(date_str) >= 8:
            date_formatted = date_str[6:8] + date_str[4:6]  # DDMM format
        else:
            date_formatted = ''
        
        # S = Soll (Debit), H = Haben (Credit)
        line = f'"{gross:.2f}";"S";"EUR";"";"";"";"1400";"70000";"";" {date_formatted}";"{data.get("invoice_number", "")}";"";"";" {data.get("vendor_name", "")}"'
        lines.append(line)
    
    return "\n".join(lines)

def generate_datev_xml(invoices: List[dict]) -> str:
    """Generate DATEV XML Online format"""
    root = etree.Element("LedgerImport", xmlns="http://xml.datev.de/DD/1.0")
    
    consolidate = etree.SubElement(root, "consolidate")
    consolidate.set("consolidatedAmount", "0")
    consolidate.set("consolidatedDate", datetime.now().strftime("%Y-%m-%d"))
    consolidate.set("consolidatedInvoiceId", "")
    
    accountsPayableLedger = etree.SubElement(root, "accountsPayableLedger")
    
    for inv in invoices:
        data = inv.get('data', {})
        
        booking = etree.SubElement(accountsPayableLedger, "bookingRow")
        
        # Amount
        amount = etree.SubElement(booking, "amount")
        amount.text = f"{data.get('gross_amount', 0):.2f}"
        
        # Account
        account = etree.SubElement(booking, "accountNo")
        account.text = "1400"
        
        # Counter account
        counterAccount = etree.SubElement(booking, "contraAccountNo")
        counterAccount.text = "70000"
        
        # Date
        date = etree.SubElement(booking, "date")
        date.text = data.get('invoice_date', '')
        
        # Invoice number
        invoiceNo = etree.SubElement(booking, "invoiceId")
        invoiceNo.text = data.get('invoice_number', '')
        
        # Description
        desc = etree.SubElement(booking, "bookingText")
        desc.text = data.get('vendor_name', '')
        
        # Currency
        currency = etree.SubElement(booking, "currencyCode")
        currency.text = data.get('currency', 'EUR')
        
        # Tax
        tax = etree.SubElement(booking, "taxAmount")
        tax.text = f"{data.get('vat_amount', 0):.2f}"
    
    return etree.tostring(root, pretty_print=True, xml_declaration=True, encoding='UTF-8').decode()

# ===================== ZUGFERD/XRECHNUNG EXPORT =====================

def generate_zugferd_xml(invoice: dict) -> str:
    """Generate ZUGFeRD 2.1 XML"""
    data = invoice.get('data', {})
    
    NSMAP = {
        'rsm': 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100',
        'ram': 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100',
        'qdt': 'urn:un:unece:uncefact:data:standard:QualifiedDataType:100',
        'udt': 'urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100'
    }
    
    root = etree.Element("{urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100}CrossIndustryInvoice", nsmap=NSMAP)
    
    # Exchange Document Context
    context = etree.SubElement(root, "{urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100}ExchangedDocumentContext")
    guideline = etree.SubElement(context, "{urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100}GuidelineSpecifiedDocumentContextParameter")
    guideline_id = etree.SubElement(guideline, "{urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100}ID")
    guideline_id.text = "urn:factur-x.eu:1p0:extended"
    
    # Exchanged Document
    doc = etree.SubElement(root, "{urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100}ExchangedDocument")
    doc_id = etree.SubElement(doc, "{urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100}ID")
    doc_id.text = data.get('invoice_number', '')
    
    type_code = etree.SubElement(doc, "{urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100}TypeCode")
    type_code.text = "380"  # Commercial Invoice
    
    issue_date = etree.SubElement(doc, "{urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100}IssueDateTime")
    date_str = etree.SubElement(issue_date, "{urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100}DateTimeString")
    date_str.set("format", "102")
    date_str.text = data.get('invoice_date', '').replace('-', '')
    
    # Supply Chain Trade Transaction
    transaction = etree.SubElement(root, "{urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100}SupplyChainTradeTransaction")
    
    # Trade Agreement
    agreement = etree.SubElement(transaction, "{urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100}ApplicableHeaderTradeAgreement")
    
    # Seller
    seller = etree.SubElement(agreement, "{urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100}SellerTradeParty")
    seller_name = etree.SubElement(seller, "{urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100}Name")
    seller_name.text = data.get('vendor_name', '')
    
    if data.get('vendor_vat_id'):
        seller_tax = etree.SubElement(seller, "{urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100}SpecifiedTaxRegistration")
        seller_tax_id = etree.SubElement(seller_tax, "{urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100}ID")
        seller_tax_id.set("schemeID", "VA")
        seller_tax_id.text = data.get('vendor_vat_id', '')
    
    # Buyer
    buyer = etree.SubElement(agreement, "{urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100}BuyerTradeParty")
    buyer_name = etree.SubElement(buyer, "{urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100}Name")
    buyer_name.text = data.get('buyer_name', '')
    
    # Trade Settlement
    settlement = etree.SubElement(transaction, "{urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100}ApplicableHeaderTradeSettlement")
    
    currency_code = etree.SubElement(settlement, "{urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100}InvoiceCurrencyCode")
    currency_code.text = data.get('currency', 'EUR')
    
    # Monetary Summation
    summation = etree.SubElement(settlement, "{urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100}SpecifiedTradeSettlementHeaderMonetarySummation")
    
    line_total = etree.SubElement(summation, "{urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100}LineTotalAmount")
    line_total.text = f"{data.get('net_amount', 0):.2f}"
    
    tax_total = etree.SubElement(summation, "{urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100}TaxTotalAmount")
    tax_total.set("currencyID", data.get('currency', 'EUR'))
    tax_total.text = f"{data.get('vat_amount', 0):.2f}"
    
    grand_total = etree.SubElement(summation, "{urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100}GrandTotalAmount")
    grand_total.text = f"{data.get('gross_amount', 0):.2f}"
    
    due_payable = etree.SubElement(summation, "{urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100}DuePayableAmount")
    due_payable.text = f"{data.get('gross_amount', 0):.2f}"
    
    return etree.tostring(root, pretty_print=True, xml_declaration=True, encoding='UTF-8').decode()

def generate_xrechnung_xml(invoice: dict) -> str:
    """Generate XRechnung (UBL) format"""
    data = invoice.get('data', {})
    
    NSMAP = {
        None: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
        'cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
        'cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2'
    }
    
    root = etree.Element("Invoice", nsmap=NSMAP)
    
    # UBL Version
    ubl_version = etree.SubElement(root, "{urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2}UBLVersionID")
    ubl_version.text = "2.1"
    
    # Customization ID for XRechnung
    custom_id = etree.SubElement(root, "{urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2}CustomizationID")
    custom_id.text = "urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_2.3"
    
    # Invoice ID
    inv_id = etree.SubElement(root, "{urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2}ID")
    inv_id.text = data.get('invoice_number', '')
    
    # Issue Date
    issue_date = etree.SubElement(root, "{urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2}IssueDate")
    issue_date.text = data.get('invoice_date', '')
    
    # Due Date
    if data.get('due_date'):
        due_date = etree.SubElement(root, "{urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2}DueDate")
        due_date.text = data.get('due_date', '')
    
    # Invoice Type Code
    type_code = etree.SubElement(root, "{urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2}InvoiceTypeCode")
    type_code.text = "380"
    
    # Currency
    currency = etree.SubElement(root, "{urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2}DocumentCurrencyCode")
    currency.text = data.get('currency', 'EUR')
    
    # Supplier (Seller)
    supplier = etree.SubElement(root, "{urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2}AccountingSupplierParty")
    supplier_party = etree.SubElement(supplier, "{urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2}Party")
    supplier_name_elem = etree.SubElement(supplier_party, "{urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2}PartyName")
    supplier_name = etree.SubElement(supplier_name_elem, "{urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2}Name")
    supplier_name.text = data.get('vendor_name', '')
    
    if data.get('vendor_vat_id'):
        supplier_tax = etree.SubElement(supplier_party, "{urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2}PartyTaxScheme")
        supplier_tax_id = etree.SubElement(supplier_tax, "{urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2}CompanyID")
        supplier_tax_id.text = data.get('vendor_vat_id', '')
        tax_scheme = etree.SubElement(supplier_tax, "{urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2}TaxScheme")
        tax_scheme_id = etree.SubElement(tax_scheme, "{urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2}ID")
        tax_scheme_id.text = "VAT"
    
    # Customer (Buyer)
    customer = etree.SubElement(root, "{urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2}AccountingCustomerParty")
    customer_party = etree.SubElement(customer, "{urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2}Party")
    customer_name_elem = etree.SubElement(customer_party, "{urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2}PartyName")
    customer_name = etree.SubElement(customer_name_elem, "{urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2}Name")
    customer_name.text = data.get('buyer_name', '')
    
    # Legal Monetary Total
    monetary = etree.SubElement(root, "{urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2}LegalMonetaryTotal")
    
    line_ext = etree.SubElement(monetary, "{urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2}LineExtensionAmount")
    line_ext.set("currencyID", data.get('currency', 'EUR'))
    line_ext.text = f"{data.get('net_amount', 0):.2f}"
    
    tax_excl = etree.SubElement(monetary, "{urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2}TaxExclusiveAmount")
    tax_excl.set("currencyID", data.get('currency', 'EUR'))
    tax_excl.text = f"{data.get('net_amount', 0):.2f}"
    
    tax_incl = etree.SubElement(monetary, "{urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2}TaxInclusiveAmount")
    tax_incl.set("currencyID", data.get('currency', 'EUR'))
    tax_incl.text = f"{data.get('gross_amount', 0):.2f}"
    
    payable = etree.SubElement(monetary, "{urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2}PayableAmount")
    payable.set("currencyID", data.get('currency', 'EUR'))
    payable.text = f"{data.get('gross_amount', 0):.2f}"
    
    return etree.tostring(root, pretty_print=True, xml_declaration=True, encoding='UTF-8').decode()

# ===================== API ROUTES =====================

@api_router.get("/")
async def root():
    return {"message": "Candis-Kopie API - KI-Rechnungsmanagement", "version": "1.0.0"}

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}

# ===== INVOICES =====

@api_router.post("/invoices", response_model=Invoice)
async def create_invoice(invoice_create: InvoiceCreate):
    """Create a new invoice with OCR extraction"""
    try:
        # Extract data using AI
        invoice_data = await extract_invoice_with_ai(invoice_create.image_base64)
        
        # Create invoice
        invoice = Invoice(
            data=invoice_data,
            image_base64=invoice_create.image_base64,
            status=InvoiceStatus.PENDING
        )
        
        # Generate GoBD hash
        invoice.gobd_hash = generate_gobd_hash(invoice.model_dump())
        
        # Save to database
        await db.invoices.insert_one(invoice.model_dump())
        
        # Log audit
        await log_audit(invoice.id, "created", "system", {"ocr": True})
        
        # Trigger webhooks
        await trigger_webhooks("invoice.created", invoice.model_dump())
        
        return invoice
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating invoice: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/invoices/manual", response_model=Invoice)
async def create_invoice_manual(data: InvoiceData, image_base64: Optional[str] = None):
    """Create invoice manually without OCR"""
    invoice = Invoice(
        data=data,
        image_base64=image_base64,
        status=InvoiceStatus.PENDING
    )
    invoice.gobd_hash = generate_gobd_hash(invoice.model_dump())
    
    await db.invoices.insert_one(invoice.model_dump())
    await log_audit(invoice.id, "created", "user", {"manual": True})
    
    return invoice

@api_router.get("/invoices", response_model=List[Invoice])
async def get_invoices(
    status: Optional[InvoiceStatus] = None,
    limit: int = Query(default=100, le=500),
    skip: int = 0
):
    """Get all invoices with optional status filter"""
    query = {}
    if status:
        query["status"] = status.value
    
    invoices = await db.invoices.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return [Invoice(**inv) for inv in invoices]

@api_router.get("/invoices/{invoice_id}", response_model=Invoice)
async def get_invoice(invoice_id: str):
    """Get a single invoice by ID"""
    invoice = await db.invoices.find_one({"id": invoice_id})
    if not invoice:
        raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")
    return Invoice(**invoice)

@api_router.put("/invoices/{invoice_id}", response_model=Invoice)
async def update_invoice(invoice_id: str, update: InvoiceUpdate):
    """Update invoice data"""
    invoice = await db.invoices.find_one({"id": invoice_id})
    if not invoice:
        raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")
    
    if invoice['status'] == InvoiceStatus.ARCHIVED.value:
        raise HTTPException(status_code=400, detail="Archivierte Rechnungen können nicht bearbeitet werden")
    
    update_data = {
        "data": update.data.model_dump(),
        "updated_at": datetime.utcnow()
    }
    
    await db.invoices.update_one({"id": invoice_id}, {"$set": update_data})
    await log_audit(invoice_id, "updated", "user", {"changes": update_data})
    
    updated = await db.invoices.find_one({"id": invoice_id})
    return Invoice(**updated)

@api_router.delete("/invoices/{invoice_id}")
async def delete_invoice(invoice_id: str):
    """Delete an invoice (only pending ones)"""
    invoice = await db.invoices.find_one({"id": invoice_id})
    if not invoice:
        raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")
    
    if invoice['status'] != InvoiceStatus.PENDING.value:
        raise HTTPException(status_code=400, detail="Nur ausstehende Rechnungen können gelöscht werden")
    
    await db.invoices.delete_one({"id": invoice_id})
    await log_audit(invoice_id, "deleted", "user", {})
    
    return {"message": "Rechnung gelöscht"}

# ===== APPROVAL WORKFLOW =====

@api_router.post("/invoices/{invoice_id}/approve", response_model=Invoice)
async def approve_invoice(invoice_id: str, approval: ApprovalRequest):
    """Approve an invoice"""
    invoice = await db.invoices.find_one({"id": invoice_id})
    if not invoice:
        raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")
    
    if invoice['status'] != InvoiceStatus.PENDING.value:
        raise HTTPException(status_code=400, detail="Nur ausstehende Rechnungen können genehmigt werden")
    
    update_data = {
        "status": InvoiceStatus.APPROVED.value,
        "approved_by": approval.approved_by,
        "approved_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    
    await db.invoices.update_one({"id": invoice_id}, {"$set": update_data})
    await log_audit(invoice_id, "approved", approval.approved_by, {"comment": approval.comment})
    await trigger_webhooks("invoice.approved", {**invoice, **update_data})
    
    updated = await db.invoices.find_one({"id": invoice_id})
    return Invoice(**updated)

@api_router.post("/invoices/{invoice_id}/reject", response_model=Invoice)
async def reject_invoice(invoice_id: str, rejection: RejectionRequest):
    """Reject an invoice"""
    invoice = await db.invoices.find_one({"id": invoice_id})
    if not invoice:
        raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")
    
    if invoice['status'] != InvoiceStatus.PENDING.value:
        raise HTTPException(status_code=400, detail="Nur ausstehende Rechnungen können abgelehnt werden")
    
    update_data = {
        "status": InvoiceStatus.REJECTED.value,
        "rejection_reason": rejection.reason,
        "updated_at": datetime.utcnow()
    }
    
    await db.invoices.update_one({"id": invoice_id}, {"$set": update_data})
    await log_audit(invoice_id, "rejected", rejection.rejected_by, {"reason": rejection.reason})
    await trigger_webhooks("invoice.rejected", {**invoice, **update_data})
    
    updated = await db.invoices.find_one({"id": invoice_id})
    return Invoice(**updated)

# ===== ARCHIVE (GoBD) =====

@api_router.post("/invoices/{invoice_id}/archive", response_model=Invoice)
async def archive_invoice(invoice_id: str):
    """Archive an approved invoice (GoBD-compliant)"""
    invoice = await db.invoices.find_one({"id": invoice_id})
    if not invoice:
        raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")
    
    if invoice['status'] != InvoiceStatus.APPROVED.value:
        raise HTTPException(status_code=400, detail="Nur genehmigte Rechnungen können archiviert werden")
    
    # Generate final GoBD hash
    gobd_hash = generate_gobd_hash(invoice)
    
    update_data = {
        "status": InvoiceStatus.ARCHIVED.value,
        "archived_at": datetime.utcnow(),
        "gobd_hash": gobd_hash,
        "updated_at": datetime.utcnow()
    }
    
    await db.invoices.update_one({"id": invoice_id}, {"$set": update_data})
    await log_audit(invoice_id, "archived", "system", {"gobd_hash": gobd_hash})
    
    # Copy to archive collection for long-term storage
    archive_doc = {**invoice, **update_data}
    await db.archive.insert_one(archive_doc)
    
    updated = await db.invoices.find_one({"id": invoice_id})
    return Invoice(**updated)

@api_router.get("/archive", response_model=List[Invoice])
async def get_archived_invoices(limit: int = Query(default=100, le=500), skip: int = 0):
    """Get archived invoices"""
    invoices = await db.archive.find().sort("archived_at", -1).skip(skip).limit(limit).to_list(limit)
    return [Invoice(**inv) for inv in invoices]

# ===== EXPORTS =====

@api_router.get("/export/datev-ascii")
async def export_datev_ascii(
    status: Optional[InvoiceStatus] = InvoiceStatus.APPROVED,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None
):
    """Export invoices in DATEV ASCII format"""
    query = {}
    if status:
        query["status"] = status.value
    
    invoices = await db.invoices.find(query).to_list(1000)
    
    csv_content = generate_datev_ascii(invoices)
    
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=datev_export.csv"}
    )

@api_router.get("/export/datev-xml")
async def export_datev_xml(status: Optional[InvoiceStatus] = InvoiceStatus.APPROVED):
    """Export invoices in DATEV XML Online format"""
    query = {}
    if status:
        query["status"] = status.value
    
    invoices = await db.invoices.find(query).to_list(1000)
    
    xml_content = generate_datev_xml(invoices)
    
    return Response(
        content=xml_content,
        media_type="application/xml",
        headers={"Content-Disposition": "attachment; filename=datev_export.xml"}
    )

@api_router.get("/export/zugferd/{invoice_id}")
async def export_zugferd(invoice_id: str):
    """Export single invoice in ZUGFeRD 2.1 format"""
    invoice = await db.invoices.find_one({"id": invoice_id})
    if not invoice:
        raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")
    
    xml_content = generate_zugferd_xml(invoice)
    
    return Response(
        content=xml_content,
        media_type="application/xml",
        headers={"Content-Disposition": f"attachment; filename=zugferd_{invoice_id}.xml"}
    )

@api_router.get("/export/xrechnung/{invoice_id}")
async def export_xrechnung(invoice_id: str):
    """Export single invoice in XRechnung format"""
    invoice = await db.invoices.find_one({"id": invoice_id})
    if not invoice:
        raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")
    
    xml_content = generate_xrechnung_xml(invoice)
    
    return Response(
        content=xml_content,
        media_type="application/xml",
        headers={"Content-Disposition": f"attachment; filename=xrechnung_{invoice_id}.xml"}
    )

# ===== STATISTICS =====

@api_router.get("/stats")
async def get_statistics():
    """Get invoice statistics for dashboard"""
    total = await db.invoices.count_documents({})
    pending = await db.invoices.count_documents({"status": InvoiceStatus.PENDING.value})
    approved = await db.invoices.count_documents({"status": InvoiceStatus.APPROVED.value})
    rejected = await db.invoices.count_documents({"status": InvoiceStatus.REJECTED.value})
    archived = await db.invoices.count_documents({"status": InvoiceStatus.ARCHIVED.value})
    
    # Calculate totals
    pipeline = [
        {"$match": {"status": {"$in": [InvoiceStatus.APPROVED.value, InvoiceStatus.ARCHIVED.value]}}},
        {"$group": {
            "_id": None,
            "total_net": {"$sum": "$data.net_amount"},
            "total_vat": {"$sum": "$data.vat_amount"},
            "total_gross": {"$sum": "$data.gross_amount"}
        }}
    ]
    
    result = await db.invoices.aggregate(pipeline).to_list(1)
    totals = result[0] if result else {"total_net": 0, "total_vat": 0, "total_gross": 0}
    
    return {
        "counts": {
            "total": total,
            "pending": pending,
            "approved": approved,
            "rejected": rejected,
            "archived": archived
        },
        "amounts": {
            "net": totals.get("total_net", 0),
            "vat": totals.get("total_vat", 0),
            "gross": totals.get("total_gross", 0)
        }
    }

# ===== SETTINGS =====

@api_router.get("/settings", response_model=Settings)
async def get_app_settings():
    """Get application settings"""
    return await get_settings()

@api_router.put("/settings", response_model=Settings)
async def update_settings(settings: Settings):
    """Update application settings"""
    settings.id = "global_settings"
    settings.updated_at = datetime.utcnow()
    
    await db.settings.replace_one(
        {"id": "global_settings"},
        settings.model_dump(),
        upsert=True
    )
    
    return settings

# ===== WEBHOOKS (n8n) =====

@api_router.get("/webhooks", response_model=List[WebhookConfig])
async def get_webhooks():
    """Get all webhook configurations"""
    webhooks = await db.webhooks.find().to_list(100)
    return [WebhookConfig(**w) for w in webhooks]

@api_router.post("/webhooks", response_model=WebhookConfig)
async def create_webhook(webhook: WebhookConfig):
    """Create a new webhook configuration"""
    await db.webhooks.insert_one(webhook.model_dump())
    return webhook

@api_router.delete("/webhooks/{webhook_id}")
async def delete_webhook(webhook_id: str):
    """Delete a webhook configuration"""
    result = await db.webhooks.delete_one({"id": webhook_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Webhook nicht gefunden")
    return {"message": "Webhook gelöscht"}

@api_router.post("/webhooks/test/{webhook_id}")
async def test_webhook(webhook_id: str):
    """Test a webhook by sending a test payload"""
    webhook = await db.webhooks.find_one({"id": webhook_id})
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook nicht gefunden")
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                webhook['url'],
                json={
                    "event": "test",
                    "data": {"message": "Dies ist ein Test-Webhook von Candis-Kopie"}
                },
                timeout=10.0
            )
            return {"status": response.status_code, "message": "Webhook erfolgreich getestet"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Webhook-Test fehlgeschlagen: {str(e)}")

# ===== AUDIT LOG =====

@api_router.get("/audit/{invoice_id}", response_model=List[AuditLog])
async def get_audit_log(invoice_id: str):
    """Get audit log for an invoice (GoBD compliance)"""
    logs = await db.audit_logs.find({"invoice_id": invoice_id}).sort("timestamp", -1).to_list(100)
    return [AuditLog(**log) for log in logs]

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    """Initialize settings on startup"""
    # Ensure settings exist with OpenRouter key
    settings = await get_settings()
    if not settings.ai_settings.api_key:
        openrouter_key = os.environ.get('OPENROUTER_API_KEY', '')
        if openrouter_key:
            settings.ai_settings.api_key = openrouter_key
            await db.settings.replace_one(
                {"id": "global_settings"},
                settings.model_dump(),
                upsert=True
            )
            logger.info("OpenRouter API key initialized from environment")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
