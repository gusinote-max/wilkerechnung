from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Query, Depends
from fastapi.responses import Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timedelta
import base64
import httpx
import json
from enum import Enum
from lxml import etree
import io
import hashlib
import jwt
import bcrypt
import re

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

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'candis-kopie-secret-key-2024')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

security = HTTPBearer(auto_error=False)

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

class UserRole(str, Enum):
    ADMIN = "admin"
    MANAGER = "manager"
    ACCOUNTANT = "accountant"
    VIEWER = "viewer"

class ReminderType(str, Enum):
    APPROVAL_PENDING = "approval_pending"
    PAYMENT_DUE = "payment_due"
    CUSTOM = "custom"

# ===================== KONTENRAHMEN DATA =====================
# SKR03 - Hauptkonten (verkürzt für MVP)
SKR03_ACCOUNTS = [
    {"number": "1000", "name": "Kasse", "category": "Umlaufvermögen"},
    {"number": "1200", "name": "Bank", "category": "Umlaufvermögen"},
    {"number": "1400", "name": "Forderungen aus Lieferungen", "category": "Umlaufvermögen"},
    {"number": "1600", "name": "Verbindlichkeiten aus Lieferungen", "category": "Verbindlichkeiten"},
    {"number": "3300", "name": "Wareneingang 19% VSt", "category": "Wareneinkauf"},
    {"number": "3400", "name": "Wareneingang 7% VSt", "category": "Wareneinkauf"},
    {"number": "4000", "name": "Umsatzerlöse", "category": "Erlöse"},
    {"number": "4120", "name": "Steuerfreie Umsätze", "category": "Erlöse"},
    {"number": "4200", "name": "Erlöse Leistungen", "category": "Erlöse"},
    {"number": "4400", "name": "Erlöse 7%", "category": "Erlöse"},
    {"number": "4520", "name": "Mieterträge", "category": "Erlöse"},
    {"number": "4600", "name": "Erlöse Vermögensgegenstände", "category": "Erlöse"},
    {"number": "4700", "name": "Sonstige betriebliche Erträge", "category": "Erlöse"},
    {"number": "4800", "name": "Provisionserlöse", "category": "Erlöse"},
    {"number": "4900", "name": "Eigenverbrauch", "category": "Erlöse"},
    {"number": "5000", "name": "Materialaufwand", "category": "Aufwand"},
    {"number": "6000", "name": "Aufwand für Roh-, Hilfs- und Betriebsstoffe", "category": "Aufwand"},
    {"number": "6100", "name": "Fremdleistungen", "category": "Aufwand"},
    {"number": "6200", "name": "Löhne", "category": "Personalaufwand"},
    {"number": "6300", "name": "Gehälter", "category": "Personalaufwand"},
    {"number": "6400", "name": "Sozialabgaben", "category": "Personalaufwand"},
    {"number": "6500", "name": "Abschreibungen", "category": "Aufwand"},
    {"number": "6800", "name": "Raumkosten", "category": "Aufwand"},
    {"number": "6805", "name": "Miete", "category": "Aufwand"},
    {"number": "6810", "name": "Nebenkosten", "category": "Aufwand"},
    {"number": "6820", "name": "Gas/Strom/Wasser", "category": "Aufwand"},
    {"number": "6830", "name": "Reinigung", "category": "Aufwand"},
    {"number": "7000", "name": "Bürobedarf", "category": "Aufwand"},
    {"number": "7100", "name": "Porto", "category": "Aufwand"},
    {"number": "7200", "name": "Telefon", "category": "Aufwand"},
    {"number": "7300", "name": "Reisekosten", "category": "Aufwand"},
    {"number": "7400", "name": "Werbekosten", "category": "Aufwand"},
    {"number": "7500", "name": "Repräsentationskosten", "category": "Aufwand"},
    {"number": "7600", "name": "Versicherungen", "category": "Aufwand"},
    {"number": "7700", "name": "Rechts- und Beratungskosten", "category": "Aufwand"},
    {"number": "7800", "name": "Sonstige Aufwendungen", "category": "Aufwand"},
    {"number": "8400", "name": "Erlöse 19% USt", "category": "Erlöse"},
    {"number": "8300", "name": "Erlöse 7% USt", "category": "Erlöse"},
]

# SKR04 - Hauptkonten (verkürzt für MVP)
SKR04_ACCOUNTS = [
    {"number": "1000", "name": "Grundstücke und Bauten", "category": "Anlagevermögen"},
    {"number": "1200", "name": "Technische Anlagen", "category": "Anlagevermögen"},
    {"number": "1400", "name": "Fuhrpark", "category": "Anlagevermögen"},
    {"number": "1600", "name": "Betriebs- und Geschäftsausstattung", "category": "Anlagevermögen"},
    {"number": "1800", "name": "Kasse", "category": "Umlaufvermögen"},
    {"number": "1810", "name": "Bank", "category": "Umlaufvermögen"},
    {"number": "1200", "name": "Forderungen aus Lieferungen", "category": "Umlaufvermögen"},
    {"number": "3000", "name": "Verbindlichkeiten aus Lieferungen", "category": "Verbindlichkeiten"},
    {"number": "4000", "name": "Umsatzerlöse", "category": "Erlöse"},
    {"number": "4100", "name": "Erlöse aus Leistungen", "category": "Erlöse"},
    {"number": "4400", "name": "Erlöse 19% USt", "category": "Erlöse"},
    {"number": "4300", "name": "Erlöse 7% USt", "category": "Erlöse"},
    {"number": "5000", "name": "Materialaufwand", "category": "Aufwand"},
    {"number": "5100", "name": "Einkauf Roh-, Hilfs-, Betriebsstoffe", "category": "Aufwand"},
    {"number": "5200", "name": "Bezugsnebenkosten", "category": "Aufwand"},
    {"number": "5800", "name": "Fremdleistungen", "category": "Aufwand"},
    {"number": "6000", "name": "Löhne und Gehälter", "category": "Personalaufwand"},
    {"number": "6100", "name": "Löhne", "category": "Personalaufwand"},
    {"number": "6200", "name": "Gehälter", "category": "Personalaufwand"},
    {"number": "6300", "name": "Soziale Abgaben", "category": "Personalaufwand"},
    {"number": "6400", "name": "Abschreibungen", "category": "Aufwand"},
    {"number": "6500", "name": "Miete und Raumkosten", "category": "Aufwand"},
    {"number": "6600", "name": "Versicherungen", "category": "Aufwand"},
    {"number": "6700", "name": "Reparaturen und Instandhaltung", "category": "Aufwand"},
    {"number": "6800", "name": "Fahrzeugkosten", "category": "Aufwand"},
    {"number": "6900", "name": "Werbekosten", "category": "Aufwand"},
    {"number": "7000", "name": "Reisekosten", "category": "Aufwand"},
    {"number": "7100", "name": "Porto und Telefon", "category": "Aufwand"},
    {"number": "7200", "name": "Bürobedarf", "category": "Aufwand"},
    {"number": "7300", "name": "Rechts- und Beratungskosten", "category": "Aufwand"},
    {"number": "7400", "name": "Sonstige betriebliche Aufwendungen", "category": "Aufwand"},
]

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
    # NEW: Accounting fields
    account_number: Optional[str] = None  # Sachkonto
    account_name: Optional[str] = None
    cost_center: Optional[str] = None  # Kostenstelle
    cost_center_name: Optional[str] = None
    booking_text: Optional[str] = None  # Buchungstext

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
    # NEW: For search indexing
    search_text: Optional[str] = None

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
    company_iban: str = ""
    company_bic: str = ""
    default_kontenrahmen: str = "SKR03"  # SKR03 or SKR04
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class WebhookConfig(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    url: str
    events: List[str] = []
    active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)

class AuditLog(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    invoice_id: str
    action: str
    actor: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    details: Dict[str, Any] = {}

# NEW: User Management Models
class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    password_hash: str = ""
    name: str
    role: UserRole = UserRole.VIEWER
    active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_login: Optional[datetime] = None

class UserCreate(BaseModel):
    email: str
    password: str
    name: str
    role: UserRole = UserRole.VIEWER

class UserLogin(BaseModel):
    email: str
    password: str

class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[UserRole] = None
    active: Optional[bool] = None

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: UserRole
    active: bool
    created_at: datetime
    last_login: Optional[datetime] = None

# NEW: Cost Center Model
class CostCenter(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    number: str
    name: str
    description: str = ""
    active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)

# NEW: Account Model (from Kontenrahmen)
class Account(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    number: str
    name: str
    category: str
    kontenrahmen: str  # SKR03 or SKR04
    active: bool = True

# NEW: Reminder Model
class Reminder(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    invoice_id: str
    reminder_type: ReminderType
    message: str
    due_date: datetime
    sent: bool = False
    sent_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class ReminderCreate(BaseModel):
    invoice_id: str
    reminder_type: ReminderType
    message: str
    due_date: datetime

# NEW: SEPA Payment Model
class SepaPayment(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    invoice_ids: List[str]
    total_amount: float
    execution_date: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: str

# ===================== AUTH HELPERS =====================
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def create_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "user_id": user_id,
        "email": email,
        "role": role,
        "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token abgelaufen")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Ungültiger Token")

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Optional[dict]:
    if not credentials:
        return None
    try:
        return decode_token(credentials.credentials)
    except:
        return None

async def require_auth(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentifizierung erforderlich")
    return decode_token(credentials.credentials)

async def require_role(roles: List[UserRole], credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    user = await require_auth(credentials)
    if user.get("role") not in [r.value for r in roles]:
        raise HTTPException(status_code=403, detail="Keine Berechtigung")
    return user

# ===================== HELPER FUNCTIONS =====================
async def get_settings() -> Settings:
    """Get global settings from database"""
    settings_doc = await db.settings.find_one({"id": "global_settings"})
    if settings_doc:
        return Settings(**settings_doc)
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
    async with httpx.AsyncClient() as http_client:
        for webhook in webhooks:
            try:
                await http_client.post(
                    webhook['url'],
                    json={"event": event, "data": data},
                    timeout=10.0
                )
                logger.info(f"Webhook triggered: {webhook['name']} for {event}")
            except Exception as e:
                logger.error(f"Webhook failed: {webhook['name']} - {str(e)}")

def generate_gobd_hash(invoice_data: dict) -> str:
    """Generate a GoBD-compliant hash for the invoice"""
    content = json.dumps(invoice_data, sort_keys=True, default=str)
    return hashlib.sha256(content.encode()).hexdigest()

def generate_search_text(invoice_data: dict) -> str:
    """Generate searchable text from invoice data"""
    parts = [
        invoice_data.get('invoice_number', ''),
        invoice_data.get('vendor_name', ''),
        invoice_data.get('vendor_address', ''),
        invoice_data.get('buyer_name', ''),
        invoice_data.get('notes', ''),
        invoice_data.get('booking_text', ''),
    ]
    for item in invoice_data.get('line_items', []):
        if isinstance(item, dict):
            parts.append(item.get('description', ''))
    return ' '.join(filter(None, parts)).lower()

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
    "notes": "Weitere Notizen",
    "booking_text": "Vorgeschlagener Buchungstext basierend auf dem Inhalt"
}

Falls ein Feld nicht gefunden wird, verwende einen leeren String oder 0 für Zahlen."""

    media_type = "image/jpeg"
    if image_base64.startswith("data:"):
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
            
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]
            
            parsed_data = json.loads(content.strip())
            
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
                notes=str(parsed_data.get('notes', '')),
                booking_text=str(parsed_data.get('booking_text', ''))
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
    lines.append('"EXTF";700;21;"Buchungsstapel";11;20250101;;"RE";"";""')
    lines.append('"Umsatz (ohne Soll/Haben-Kz)";"Soll/Haben-Kennzeichen";"WKZ Umsatz";"Kurs";"Basis-Umsatz";"WKZ Basis-Umsatz";"Konto";"Gegenkonto (ohne BU-Schlüssel)";"BU-Schlüssel";"Belegdatum";"Belegfeld 1";"Belegfeld 2";"Skonto";"Buchungstext";"Kostenstelle"')
    
    for inv in invoices:
        data = inv.get('data', {})
        gross = data.get('gross_amount', 0)
        date_str = data.get('invoice_date', '').replace('-', '')
        if len(date_str) >= 8:
            date_formatted = date_str[6:8] + date_str[4:6]
        else:
            date_formatted = ''
        
        account = data.get('account_number', '1400')
        cost_center = data.get('cost_center', '')
        booking_text = data.get('booking_text', data.get('vendor_name', ''))
        
        line = f'"{gross:.2f}";"S";"EUR";"";"";"";" {account}";"70000";"";" {date_formatted}";"{data.get("invoice_number", "")}";"";"";" {booking_text}";"{cost_center}"'
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
        
        amount = etree.SubElement(booking, "amount")
        amount.text = f"{data.get('gross_amount', 0):.2f}"
        
        account = etree.SubElement(booking, "accountNo")
        account.text = data.get('account_number', '1400')
        
        counterAccount = etree.SubElement(booking, "contraAccountNo")
        counterAccount.text = "70000"
        
        date = etree.SubElement(booking, "date")
        date.text = data.get('invoice_date', '')
        
        invoiceNo = etree.SubElement(booking, "invoiceId")
        invoiceNo.text = data.get('invoice_number', '')
        
        desc = etree.SubElement(booking, "bookingText")
        desc.text = data.get('booking_text', data.get('vendor_name', ''))
        
        currency = etree.SubElement(booking, "currencyCode")
        currency.text = data.get('currency', 'EUR')
        
        tax = etree.SubElement(booking, "taxAmount")
        tax.text = f"{data.get('vat_amount', 0):.2f}"
        
        if data.get('cost_center'):
            costCenter = etree.SubElement(booking, "costCenter")
            costCenter.text = data.get('cost_center', '')
    
    return etree.tostring(root, pretty_print=True, xml_declaration=True, encoding='UTF-8').decode()

# ===================== SEPA XML EXPORT =====================
def generate_sepa_xml(invoices: List[dict], settings: Settings) -> str:
    """Generate SEPA pain.001 XML for payments"""
    NSMAP = {
        None: 'urn:iso:std:iso:20022:tech:xsd:pain.001.001.03',
        'xsi': 'http://www.w3.org/2001/XMLSchema-instance'
    }
    
    root = etree.Element("Document", nsmap=NSMAP)
    cstmrCdtTrfInitn = etree.SubElement(root, "CstmrCdtTrfInitn")
    
    # Group Header
    grpHdr = etree.SubElement(cstmrCdtTrfInitn, "GrpHdr")
    msgId = etree.SubElement(grpHdr, "MsgId")
    msgId.text = f"SEPA-{datetime.now().strftime('%Y%m%d%H%M%S')}"
    creDtTm = etree.SubElement(grpHdr, "CreDtTm")
    creDtTm.text = datetime.now().isoformat()
    nbOfTxs = etree.SubElement(grpHdr, "NbOfTxs")
    nbOfTxs.text = str(len(invoices))
    ctrlSum = etree.SubElement(grpHdr, "CtrlSum")
    total = sum(inv.get('data', {}).get('gross_amount', 0) for inv in invoices)
    ctrlSum.text = f"{total:.2f}"
    
    initgPty = etree.SubElement(grpHdr, "InitgPty")
    nm = etree.SubElement(initgPty, "Nm")
    nm.text = settings.company_name
    
    # Payment Information
    pmtInf = etree.SubElement(cstmrCdtTrfInitn, "PmtInf")
    pmtInfId = etree.SubElement(pmtInf, "PmtInfId")
    pmtInfId.text = f"PMT-{datetime.now().strftime('%Y%m%d')}"
    pmtMtd = etree.SubElement(pmtInf, "PmtMtd")
    pmtMtd.text = "TRF"
    btchBookg = etree.SubElement(pmtInf, "BtchBookg")
    btchBookg.text = "true"
    nbOfTxs2 = etree.SubElement(pmtInf, "NbOfTxs")
    nbOfTxs2.text = str(len(invoices))
    ctrlSum2 = etree.SubElement(pmtInf, "CtrlSum")
    ctrlSum2.text = f"{total:.2f}"
    
    pmtTpInf = etree.SubElement(pmtInf, "PmtTpInf")
    svcLvl = etree.SubElement(pmtTpInf, "SvcLvl")
    cd = etree.SubElement(svcLvl, "Cd")
    cd.text = "SEPA"
    
    reqdExctnDt = etree.SubElement(pmtInf, "ReqdExctnDt")
    reqdExctnDt.text = datetime.now().strftime("%Y-%m-%d")
    
    # Debtor (Company paying)
    dbtr = etree.SubElement(pmtInf, "Dbtr")
    dbtrNm = etree.SubElement(dbtr, "Nm")
    dbtrNm.text = settings.company_name
    
    dbtrAcct = etree.SubElement(pmtInf, "DbtrAcct")
    dbtrId = etree.SubElement(dbtrAcct, "Id")
    dbtrIBAN = etree.SubElement(dbtrId, "IBAN")
    dbtrIBAN.text = settings.company_iban or "DE89370400440532013000"
    
    dbtrAgt = etree.SubElement(pmtInf, "DbtrAgt")
    finInstnId = etree.SubElement(dbtrAgt, "FinInstnId")
    bic = etree.SubElement(finInstnId, "BIC")
    bic.text = settings.company_bic or "COBADEFFXXX"
    
    chrgBr = etree.SubElement(pmtInf, "ChrgBr")
    chrgBr.text = "SLEV"
    
    # Credit Transfer Transactions
    for inv in invoices:
        data = inv.get('data', {})
        
        cdtTrfTxInf = etree.SubElement(pmtInf, "CdtTrfTxInf")
        
        pmtId = etree.SubElement(cdtTrfTxInf, "PmtId")
        endToEndId = etree.SubElement(pmtId, "EndToEndId")
        endToEndId.text = data.get('invoice_number', inv.get('id', ''))[:35]
        
        amt = etree.SubElement(cdtTrfTxInf, "Amt")
        instdAmt = etree.SubElement(amt, "InstdAmt")
        instdAmt.set("Ccy", data.get('currency', 'EUR'))
        instdAmt.text = f"{data.get('gross_amount', 0):.2f}"
        
        if data.get('vendor_bic'):
            cdtrAgt = etree.SubElement(cdtTrfTxInf, "CdtrAgt")
            cdtrFinInstnId = etree.SubElement(cdtrAgt, "FinInstnId")
            cdtrBic = etree.SubElement(cdtrFinInstnId, "BIC")
            cdtrBic.text = data.get('vendor_bic', '')
        
        cdtr = etree.SubElement(cdtTrfTxInf, "Cdtr")
        cdtrNm = etree.SubElement(cdtr, "Nm")
        cdtrNm.text = data.get('vendor_name', 'Unbekannt')[:70]
        
        cdtrAcct = etree.SubElement(cdtTrfTxInf, "CdtrAcct")
        cdtrAcctId = etree.SubElement(cdtrAcct, "Id")
        cdtrIBAN = etree.SubElement(cdtrAcctId, "IBAN")
        cdtrIBAN.text = data.get('vendor_iban', '')
        
        rmtInf = etree.SubElement(cdtTrfTxInf, "RmtInf")
        ustrd = etree.SubElement(rmtInf, "Ustrd")
        ustrd.text = f"Rechnung {data.get('invoice_number', '')}"[:140]
    
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
    
    context = etree.SubElement(root, "{urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100}ExchangedDocumentContext")
    guideline = etree.SubElement(context, "{urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100}GuidelineSpecifiedDocumentContextParameter")
    guideline_id = etree.SubElement(guideline, "{urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100}ID")
    guideline_id.text = "urn:factur-x.eu:1p0:extended"
    
    doc = etree.SubElement(root, "{urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100}ExchangedDocument")
    doc_id = etree.SubElement(doc, "{urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100}ID")
    doc_id.text = data.get('invoice_number', '')
    
    type_code = etree.SubElement(doc, "{urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100}TypeCode")
    type_code.text = "380"
    
    issue_date = etree.SubElement(doc, "{urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100}IssueDateTime")
    date_str = etree.SubElement(issue_date, "{urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100}DateTimeString")
    date_str.set("format", "102")
    date_str.text = data.get('invoice_date', '').replace('-', '')
    
    transaction = etree.SubElement(root, "{urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100}SupplyChainTradeTransaction")
    
    agreement = etree.SubElement(transaction, "{urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100}ApplicableHeaderTradeAgreement")
    
    seller = etree.SubElement(agreement, "{urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100}SellerTradeParty")
    seller_name = etree.SubElement(seller, "{urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100}Name")
    seller_name.text = data.get('vendor_name', '')
    
    if data.get('vendor_vat_id'):
        seller_tax = etree.SubElement(seller, "{urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100}SpecifiedTaxRegistration")
        seller_tax_id = etree.SubElement(seller_tax, "{urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100}ID")
        seller_tax_id.set("schemeID", "VA")
        seller_tax_id.text = data.get('vendor_vat_id', '')
    
    buyer = etree.SubElement(agreement, "{urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100}BuyerTradeParty")
    buyer_name = etree.SubElement(buyer, "{urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100}Name")
    buyer_name.text = data.get('buyer_name', '')
    
    settlement = etree.SubElement(transaction, "{urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100}ApplicableHeaderTradeSettlement")
    
    currency_code = etree.SubElement(settlement, "{urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100}InvoiceCurrencyCode")
    currency_code.text = data.get('currency', 'EUR')
    
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
    
    ubl_version = etree.SubElement(root, "{urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2}UBLVersionID")
    ubl_version.text = "2.1"
    
    custom_id = etree.SubElement(root, "{urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2}CustomizationID")
    custom_id.text = "urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_2.3"
    
    inv_id = etree.SubElement(root, "{urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2}ID")
    inv_id.text = data.get('invoice_number', '')
    
    issue_date = etree.SubElement(root, "{urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2}IssueDate")
    issue_date.text = data.get('invoice_date', '')
    
    if data.get('due_date'):
        due_date = etree.SubElement(root, "{urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2}DueDate")
        due_date.text = data.get('due_date', '')
    
    type_code = etree.SubElement(root, "{urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2}InvoiceTypeCode")
    type_code.text = "380"
    
    currency = etree.SubElement(root, "{urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2}DocumentCurrencyCode")
    currency.text = data.get('currency', 'EUR')
    
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
    
    customer = etree.SubElement(root, "{urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2}AccountingCustomerParty")
    customer_party = etree.SubElement(customer, "{urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2}Party")
    customer_name_elem = etree.SubElement(customer_party, "{urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2}PartyName")
    customer_name = etree.SubElement(customer_name_elem, "{urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2}Name")
    customer_name.text = data.get('buyer_name', '')
    
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
    return {"message": "Candis-Kopie API - KI-Rechnungsmanagement", "version": "2.0.0"}

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}

# ===== AUTH =====

@api_router.post("/auth/register", response_model=UserResponse)
async def register_user(user_create: UserCreate):
    """Register a new user"""
    existing = await db.users.find_one({"email": user_create.email})
    if existing:
        raise HTTPException(status_code=400, detail="E-Mail bereits registriert")
    
    user = User(
        email=user_create.email,
        password_hash=hash_password(user_create.password),
        name=user_create.name,
        role=user_create.role
    )
    
    await db.users.insert_one(user.model_dump())
    return UserResponse(**user.model_dump())

@api_router.post("/auth/login")
async def login(credentials: UserLogin):
    """Login and get JWT token"""
    user = await db.users.find_one({"email": credentials.email})
    if not user or not verify_password(credentials.password, user['password_hash']):
        raise HTTPException(status_code=401, detail="Ungültige Anmeldedaten")
    
    if not user.get('active', True):
        raise HTTPException(status_code=403, detail="Benutzer deaktiviert")
    
    # Update last login
    await db.users.update_one(
        {"id": user['id']},
        {"$set": {"last_login": datetime.utcnow()}}
    )
    
    token = create_token(user['id'], user['email'], user['role'])
    return {
        "token": token,
        "user": UserResponse(**user).model_dump()
    }

@api_router.get("/auth/me", response_model=UserResponse)
async def get_current_user_info(user: dict = Depends(require_auth)):
    """Get current user info"""
    user_doc = await db.users.find_one({"id": user['user_id']})
    if not user_doc:
        raise HTTPException(status_code=404, detail="Benutzer nicht gefunden")
    return UserResponse(**user_doc)

# ===== USERS =====

@api_router.get("/users", response_model=List[UserResponse])
async def get_users():
    """Get all users (admin only in production)"""
    users = await db.users.find().to_list(1000)
    return [UserResponse(**u) for u in users]

@api_router.get("/users/{user_id}", response_model=UserResponse)
async def get_user(user_id: str):
    """Get user by ID"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Benutzer nicht gefunden")
    return UserResponse(**user)

@api_router.put("/users/{user_id}", response_model=UserResponse)
async def update_user(user_id: str, update: UserUpdate):
    """Update user"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Benutzer nicht gefunden")
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if update_data:
        await db.users.update_one({"id": user_id}, {"$set": update_data})
    
    updated = await db.users.find_one({"id": user_id})
    return UserResponse(**updated)

@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str):
    """Delete user"""
    result = await db.users.delete_one({"id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Benutzer nicht gefunden")
    return {"message": "Benutzer gelöscht"}

# ===== KONTENRAHMEN =====

@api_router.get("/accounts")
async def get_accounts(kontenrahmen: str = Query(default="SKR03")):
    """Get accounts from Kontenrahmen (SKR03 or SKR04)"""
    # Check if accounts exist in DB
    count = await db.accounts.count_documents({"kontenrahmen": kontenrahmen})
    
    if count == 0:
        # Seed accounts
        accounts_data = SKR03_ACCOUNTS if kontenrahmen == "SKR03" else SKR04_ACCOUNTS
        for acc in accounts_data:
            account = Account(
                number=acc['number'],
                name=acc['name'],
                category=acc['category'],
                kontenrahmen=kontenrahmen
            )
            await db.accounts.insert_one(account.model_dump())
    
    accounts = await db.accounts.find({"kontenrahmen": kontenrahmen, "active": True}).to_list(1000)
    # Remove MongoDB _id field
    return [{k: v for k, v in acc.items() if k != '_id'} for acc in accounts]

@api_router.post("/accounts", response_model=Account)
async def create_account(account: Account):
    """Create custom account"""
    await db.accounts.insert_one(account.model_dump())
    return account

# ===== COST CENTERS =====

@api_router.get("/cost-centers", response_model=List[CostCenter])
async def get_cost_centers():
    """Get all cost centers"""
    centers = await db.cost_centers.find({"active": True}).to_list(1000)
    return [CostCenter(**c) for c in centers]

@api_router.post("/cost-centers", response_model=CostCenter)
async def create_cost_center(center: CostCenter):
    """Create cost center"""
    await db.cost_centers.insert_one(center.model_dump())
    return center

@api_router.put("/cost-centers/{center_id}", response_model=CostCenter)
async def update_cost_center(center_id: str, name: str = None, description: str = None, active: bool = None):
    """Update cost center"""
    update_data = {}
    if name is not None:
        update_data["name"] = name
    if description is not None:
        update_data["description"] = description
    if active is not None:
        update_data["active"] = active
    
    if update_data:
        await db.cost_centers.update_one({"id": center_id}, {"$set": update_data})
    
    updated = await db.cost_centers.find_one({"id": center_id})
    if not updated:
        raise HTTPException(status_code=404, detail="Kostenstelle nicht gefunden")
    return CostCenter(**updated)

@api_router.delete("/cost-centers/{center_id}")
async def delete_cost_center(center_id: str):
    """Delete cost center"""
    result = await db.cost_centers.delete_one({"id": center_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Kostenstelle nicht gefunden")
    return {"message": "Kostenstelle gelöscht"}

# ===== INVOICES =====

@api_router.post("/invoices", response_model=Invoice)
async def create_invoice(invoice_create: InvoiceCreate):
    """Create a new invoice with OCR extraction"""
    try:
        invoice_data = await extract_invoice_with_ai(invoice_create.image_base64)
        
        invoice = Invoice(
            data=invoice_data,
            image_base64=invoice_create.image_base64,
            status=InvoiceStatus.PENDING
        )
        
        invoice.search_text = generate_search_text(invoice_data.model_dump())
        invoice.gobd_hash = generate_gobd_hash(invoice.model_dump())
        
        await db.invoices.insert_one(invoice.model_dump())
        await log_audit(invoice.id, "created", "system", {"ocr": True})
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
    invoice.search_text = generate_search_text(data.model_dump())
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

@api_router.get("/invoices/search")
async def search_invoices(
    q: str = Query(..., min_length=1),
    limit: int = Query(default=50, le=200)
):
    """Full-text search in invoices"""
    # Create text index if not exists
    try:
        await db.invoices.create_index([("search_text", "text")])
    except:
        pass
    
    # Search using regex for broader matching
    regex_pattern = re.compile(q, re.IGNORECASE)
    
    query = {
        "$or": [
            {"search_text": {"$regex": regex_pattern}},
            {"data.invoice_number": {"$regex": regex_pattern}},
            {"data.vendor_name": {"$regex": regex_pattern}},
            {"data.booking_text": {"$regex": regex_pattern}}
        ]
    }
    
    invoices = await db.invoices.find(query).limit(limit).to_list(limit)
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
        "search_text": generate_search_text(update.data.model_dump()),
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
    
    gobd_hash = generate_gobd_hash(invoice)
    
    update_data = {
        "status": InvoiceStatus.ARCHIVED.value,
        "archived_at": datetime.utcnow(),
        "gobd_hash": gobd_hash,
        "updated_at": datetime.utcnow()
    }
    
    await db.invoices.update_one({"id": invoice_id}, {"$set": update_data})
    await log_audit(invoice_id, "archived", "system", {"gobd_hash": gobd_hash})
    
    archive_doc = {**invoice, **update_data}
    await db.archive.insert_one(archive_doc)
    
    updated = await db.invoices.find_one({"id": invoice_id})
    return Invoice(**updated)

@api_router.get("/archive", response_model=List[Invoice])
async def get_archived_invoices(limit: int = Query(default=100, le=500), skip: int = 0):
    """Get archived invoices"""
    invoices = await db.archive.find().sort("archived_at", -1).skip(skip).limit(limit).to_list(limit)
    return [Invoice(**inv) for inv in invoices]

@api_router.get("/archive/search")
async def search_archive(
    q: str = Query(..., min_length=1),
    limit: int = Query(default=50, le=200)
):
    """Full-text search in archive"""
    regex_pattern = re.compile(q, re.IGNORECASE)
    
    query = {
        "$or": [
            {"search_text": {"$regex": regex_pattern}},
            {"data.invoice_number": {"$regex": regex_pattern}},
            {"data.vendor_name": {"$regex": regex_pattern}}
        ]
    }
    
    invoices = await db.archive.find(query).limit(limit).to_list(limit)
    return [Invoice(**inv) for inv in invoices]

# ===== REMINDERS =====

@api_router.get("/reminders", response_model=List[Reminder])
async def get_reminders(pending_only: bool = True):
    """Get reminders"""
    query = {"sent": False} if pending_only else {}
    reminders = await db.reminders.find(query).sort("due_date", 1).to_list(1000)
    return [Reminder(**r) for r in reminders]

@api_router.post("/reminders", response_model=Reminder)
async def create_reminder(reminder: ReminderCreate):
    """Create a reminder"""
    r = Reminder(**reminder.model_dump())
    await db.reminders.insert_one(r.model_dump())
    return r

@api_router.post("/reminders/{reminder_id}/send")
async def send_reminder(reminder_id: str):
    """Mark reminder as sent"""
    result = await db.reminders.update_one(
        {"id": reminder_id},
        {"$set": {"sent": True, "sent_at": datetime.utcnow()}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Erinnerung nicht gefunden")
    return {"message": "Erinnerung gesendet"}

@api_router.delete("/reminders/{reminder_id}")
async def delete_reminder(reminder_id: str):
    """Delete reminder"""
    result = await db.reminders.delete_one({"id": reminder_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Erinnerung nicht gefunden")
    return {"message": "Erinnerung gelöscht"}

@api_router.get("/reminders/pending")
async def get_pending_reminders():
    """Get reminders that are due and not yet sent"""
    now = datetime.utcnow()
    reminders = await db.reminders.find({
        "sent": False,
        "due_date": {"$lte": now}
    }).to_list(100)
    return [Reminder(**r) for r in reminders]

# ===== EXPORTS =====

@api_router.get("/export/datev-ascii")
async def export_datev_ascii(status: Optional[InvoiceStatus] = InvoiceStatus.APPROVED):
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

@api_router.get("/export/sepa")
async def export_sepa(invoice_ids: str = Query(..., description="Comma-separated invoice IDs")):
    """Export SEPA XML for payment"""
    ids = [id.strip() for id in invoice_ids.split(",")]
    invoices = await db.invoices.find({"id": {"$in": ids}}).to_list(len(ids))
    
    if not invoices:
        raise HTTPException(status_code=404, detail="Keine Rechnungen gefunden")
    
    settings = await get_settings()
    xml_content = generate_sepa_xml(invoices, settings)
    
    return Response(
        content=xml_content,
        media_type="application/xml",
        headers={"Content-Disposition": "attachment; filename=sepa_payment.xml"}
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
    
    # Pending reminders count
    pending_reminders = await db.reminders.count_documents({"sent": False})
    
    return {
        "counts": {
            "total": total,
            "pending": pending,
            "approved": approved,
            "rejected": rejected,
            "archived": archived,
            "pending_reminders": pending_reminders
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
        async with httpx.AsyncClient() as http_client:
            response = await http_client.post(
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
    """Initialize settings and indexes on startup"""
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
    
    # Create text indexes for search
    try:
        await db.invoices.create_index([("search_text", "text")])
        await db.archive.create_index([("search_text", "text")])
        logger.info("Text indexes created")
    except Exception as e:
        logger.warning(f"Index creation warning: {e}")
    
    # Seed default admin user if none exists
    admin_exists = await db.users.find_one({"role": "admin"})
    if not admin_exists:
        admin = User(
            email="admin@candis-kopie.de",
            password_hash=hash_password("admin123"),
            name="Administrator",
            role=UserRole.ADMIN
        )
        await db.users.insert_one(admin.model_dump())
        logger.info("Default admin user created: admin@candis-kopie.de / admin123")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
