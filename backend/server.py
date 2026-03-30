from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Query, Depends, BackgroundTasks
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
import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import fitz  # PyMuPDF for PDF to image conversion
import asyncio
from concurrent.futures import ThreadPoolExecutor
from apscheduler.schedulers.asyncio import AsyncIOScheduler

# Thread pool for blocking IMAP operations
_thread_pool = ThreadPoolExecutor(max_workers=2)
_imap_scheduler: Optional[AsyncIOScheduler] = None

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

class ApprovalStageStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"

# ===================== EMAIL CONFIGURATION =====================
SMTP_HOST = os.environ.get('SMTP_HOST', '')
SMTP_PORT = int(os.environ.get('SMTP_PORT', '587'))
SMTP_USER = os.environ.get('SMTP_USER', '')
SMTP_PASSWORD = os.environ.get('SMTP_PASSWORD', '')
SMTP_FROM_EMAIL = os.environ.get('SMTP_FROM_EMAIL', 'noreply@candis-kopie.de')
SMTP_FROM_NAME = os.environ.get('SMTP_FROM_NAME', 'Candis-Kopie')

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

# SKR51 - Kontenrahmen für Kfz-Handel und Kfz-Handwerk
SKR51_ACCOUNTS = [
    # ===== Klasse 0: Anlagevermögen =====
    {"number": "0010", "name": "Immaterielle Wirtschaftsgüter", "category": "Anlagevermögen"},
    {"number": "0020", "name": "Konzessionen, Lizenzen, Schutzrechte", "category": "Anlagevermögen"},
    {"number": "0030", "name": "Händlervertrag / Servicepartnervertrag", "category": "Anlagevermögen"},
    {"number": "0040", "name": "Software (Dealer-Management-System)", "category": "Anlagevermögen"},
    {"number": "0100", "name": "Grundstücke und Bauten", "category": "Anlagevermögen"},
    {"number": "0110", "name": "Unbebaute Grundstücke", "category": "Anlagevermögen"},
    {"number": "0120", "name": "Betriebsgebäude", "category": "Anlagevermögen"},
    {"number": "0130", "name": "Showroom / Ausstellungshalle", "category": "Anlagevermögen"},
    {"number": "0140", "name": "Werkstattgebäude", "category": "Anlagevermögen"},
    {"number": "0150", "name": "Abstellplätze und Freigelände", "category": "Anlagevermögen"},
    {"number": "0160", "name": "Tankstellenanlage", "category": "Anlagevermögen"},
    {"number": "0200", "name": "Technische Anlagen und Maschinen (Werkstatt)", "category": "Anlagevermögen"},
    {"number": "0210", "name": "Hebebühnen und Gruben", "category": "Anlagevermögen"},
    {"number": "0220", "name": "Diagnose- und Messgeräte", "category": "Anlagevermögen"},
    {"number": "0230", "name": "Reifenmontier- und Auswuchtmaschinen", "category": "Anlagevermögen"},
    {"number": "0240", "name": "Lackier- und Karosserieausstattung", "category": "Anlagevermögen"},
    {"number": "0250", "name": "Kompressoren und Druckluftanlagen", "category": "Anlagevermögen"},
    {"number": "0260", "name": "Wasch- und Pflegeanlagen", "category": "Anlagevermögen"},
    {"number": "0270", "name": "Spezialwerkzeuge und Betriebsvorrichtungen", "category": "Anlagevermögen"},
    {"number": "0300", "name": "Betriebs- und Geschäftsausstattung", "category": "Anlagevermögen"},
    {"number": "0310", "name": "Büroausstattung und -möbel", "category": "Anlagevermögen"},
    {"number": "0320", "name": "EDV-Hardware (PCs, Server, Kassensysteme)", "category": "Anlagevermögen"},
    {"number": "0330", "name": "Teileausgabe und Lagereinrichtung", "category": "Anlagevermögen"},
    {"number": "0340", "name": "Telefonanlagen und Kommunikationstechnik", "category": "Anlagevermögen"},
    {"number": "0350", "name": "Werbeanlagen und Beschilderung", "category": "Anlagevermögen"},
    {"number": "0400", "name": "Fuhrpark (betrieblich genutzte Fahrzeuge)", "category": "Anlagevermögen"},
    {"number": "0410", "name": "Vorführfahrzeuge (Pkw, Kombi)", "category": "Anlagevermögen"},
    {"number": "0420", "name": "Vorführfahrzeuge (Nutzfahrzeuge)", "category": "Anlagevermögen"},
    {"number": "0430", "name": "Werkstatt-Transporter und Servicefahrzeuge", "category": "Anlagevermögen"},
    {"number": "0440", "name": "Pannenhilfe- und Abschleppfahrzeuge", "category": "Anlagevermögen"},
    {"number": "0450", "name": "Geschäftsführer-/Mitarbeiter-Dienstfahrzeuge", "category": "Anlagevermögen"},
    {"number": "0500", "name": "Finanzanlagen", "category": "Anlagevermögen"},
    {"number": "0510", "name": "Beteiligungen an verbundenen Unternehmen", "category": "Anlagevermögen"},
    {"number": "0520", "name": "Wertpapiere des Anlagevermögens", "category": "Anlagevermögen"},
    {"number": "0530", "name": "Ausleihungen", "category": "Anlagevermögen"},
    # ===== Klasse 1: Umlaufvermögen – Vorräte Fahrzeuge =====
    {"number": "1000", "name": "Neufahrzeuge auf Lager (aktiviert)", "category": "Vorräte Fahrzeuge"},
    {"number": "1010", "name": "Neufahrzeuge Pkw auf Lager", "category": "Vorräte Fahrzeuge"},
    {"number": "1020", "name": "Neufahrzeuge Nutzfahrzeuge auf Lager", "category": "Vorräte Fahrzeuge"},
    {"number": "1030", "name": "Neufahrzeuge Motorräder / Zweiräder", "category": "Vorräte Fahrzeuge"},
    {"number": "1040", "name": "Inzahlungnahme-Fahrzeuge (In-Trade)", "category": "Vorräte Fahrzeuge"},
    {"number": "1050", "name": "Gebrauchtfahrzeuge auf Lager (Pkw)", "category": "Vorräte Fahrzeuge"},
    {"number": "1060", "name": "Gebrauchtfahrzeuge auf Lager (Nutzfahrzeuge)", "category": "Vorräte Fahrzeuge"},
    {"number": "1070", "name": "Oldtimer und Sammlerstücke", "category": "Vorräte Fahrzeuge"},
    {"number": "1080", "name": "Fremdfahrzeuge (Kommission)", "category": "Vorräte Fahrzeuge"},
    {"number": "1090", "name": "Jahreswagen und Kurzzulassungen", "category": "Vorräte Fahrzeuge"},
    # ===== Klasse 1: Vorräte Teile =====
    {"number": "1100", "name": "Originalteile und Zubehör (OEM)", "category": "Vorräte Teile"},
    {"number": "1110", "name": "Hersteller-Originalteile", "category": "Vorräte Teile"},
    {"number": "1120", "name": "Zubehör und Tuning-Teile", "category": "Vorräte Teile"},
    {"number": "1130", "name": "Reifen (Sommer)", "category": "Vorräte Teile"},
    {"number": "1140", "name": "Reifen (Winter / Ganzjahres)", "category": "Vorräte Teile"},
    {"number": "1150", "name": "Räder und Felgen", "category": "Vorräte Teile"},
    {"number": "1160", "name": "Verschleißteile (Bremsbeläge, Filter, Öle)", "category": "Vorräte Teile"},
    {"number": "1170", "name": "Batterien und Elektrozubehör", "category": "Vorräte Teile"},
    {"number": "1180", "name": "Karosserie- und Lackiermaterial", "category": "Vorräte Teile"},
    {"number": "1190", "name": "Schmierstoffe und Betriebsstoffe", "category": "Vorräte Teile"},
    {"number": "1200", "name": "Merchandise / Fanshop-Artikel", "category": "Vorräte Teile"},
    # ===== Klasse 1: Vorräte Werkstatt =====
    {"number": "1300", "name": "Halbfertige Aufträge (Werkstatt)", "category": "Vorräte Werkstatt"},
    {"number": "1310", "name": "Reparaturaufträge in Arbeit", "category": "Vorräte Werkstatt"},
    {"number": "1320", "name": "Karosserieaufträge in Arbeit", "category": "Vorräte Werkstatt"},
    {"number": "1330", "name": "Lackieraufträge in Arbeit", "category": "Vorräte Werkstatt"},
    # ===== Klasse 1: Forderungen =====
    {"number": "1400", "name": "Forderungen aus Neuwagenverkauf", "category": "Forderungen"},
    {"number": "1410", "name": "Forderungen aus Gebrauchtwagenverkauf", "category": "Forderungen"},
    {"number": "1420", "name": "Forderungen aus Werkstatt- und Serviceleistungen", "category": "Forderungen"},
    {"number": "1430", "name": "Forderungen aus Teile- und Zubehörverkauf", "category": "Forderungen"},
    {"number": "1440", "name": "Forderungen aus Karosserie / Lack", "category": "Forderungen"},
    {"number": "1450", "name": "Forderungen aus Reifenservice", "category": "Forderungen"},
    {"number": "1460", "name": "Forderungen aus Finanzierungs- und Versicherungsprov.", "category": "Forderungen"},
    {"number": "1470", "name": "Herstellerforderungen (Prämien, Boni)", "category": "Forderungen"},
    {"number": "1480", "name": "Forderungen gegenüber Versicherungen", "category": "Forderungen"},
    {"number": "1490", "name": "Sonstige Forderungen", "category": "Forderungen"},
    {"number": "1500", "name": "Vorsteuer 19%", "category": "Forderungen"},
    {"number": "1501", "name": "Vorsteuer 7%", "category": "Forderungen"},
    {"number": "1510", "name": "Anzahlungen von Kunden (Neufahrzeuge)", "category": "Forderungen"},
    {"number": "1520", "name": "Anzahlungen von Kunden (Gebrauchtfahrzeuge)", "category": "Forderungen"},
    # ===== Klasse 1: Kasse / Bank =====
    {"number": "1600", "name": "Kasse", "category": "Kasse / Bank"},
    {"number": "1610", "name": "Hauptkasse", "category": "Kasse / Bank"},
    {"number": "1620", "name": "Handkasse Teileverkauf", "category": "Kasse / Bank"},
    {"number": "1630", "name": "Handkasse Werkstatt", "category": "Kasse / Bank"},
    {"number": "1700", "name": "Bank (laufendes Konto)", "category": "Kasse / Bank"},
    {"number": "1710", "name": "Girokonto (Betriebskonto)", "category": "Kasse / Bank"},
    {"number": "1720", "name": "Fahrzeugfinanzierungskonto (Floorplan)", "category": "Kasse / Bank"},
    {"number": "1730", "name": "Kontokorrent Kreditlinie", "category": "Kasse / Bank"},
    {"number": "1740", "name": "Festgeld / Tagesgeld", "category": "Kasse / Bank"},
    {"number": "1750", "name": "EC/Kreditkarten-Zahlungskonto", "category": "Kasse / Bank"},
    # ===== Klasse 2: Eigenkapital =====
    {"number": "2000", "name": "Gezeichnetes Kapital / Stammkapital", "category": "Eigenkapital"},
    {"number": "2100", "name": "Kapitalrücklage", "category": "Eigenkapital"},
    {"number": "2200", "name": "Gewinnrücklagen", "category": "Eigenkapital"},
    {"number": "2210", "name": "Gesetzliche Rücklage", "category": "Eigenkapital"},
    {"number": "2220", "name": "Satzungsmäßige Rücklage", "category": "Eigenkapital"},
    {"number": "2300", "name": "Gewinnvortrag / Verlustvortrag", "category": "Eigenkapital"},
    {"number": "2400", "name": "Jahresüberschuss / Jahresfehlbetrag", "category": "Eigenkapital"},
    {"number": "2500", "name": "Entnahmen des Inhabers", "category": "Eigenkapital"},
    {"number": "2600", "name": "Einlagen des Inhabers", "category": "Eigenkapital"},
    # ===== Klasse 3: Verbindlichkeiten Fahrzeuge =====
    {"number": "3000", "name": "Fahrzeugfinanzierung (Floorplan / Einkaufsfinanzierung)", "category": "Verbindlichkeiten Fahrzeuge"},
    {"number": "3010", "name": "Floorplan Neufahrzeuge (Hersteller/Bank)", "category": "Verbindlichkeiten Fahrzeuge"},
    {"number": "3020", "name": "Floorplan Gebrauchtfahrzeuge", "category": "Verbindlichkeiten Fahrzeuge"},
    {"number": "3030", "name": "Händlereinkaufsfinanzierung", "category": "Verbindlichkeiten Fahrzeuge"},
    # ===== Klasse 3: Verbindlichkeiten =====
    {"number": "3100", "name": "Verbindlichkeiten aus Lieferungen und Leistungen", "category": "Verbindlichkeiten"},
    {"number": "3110", "name": "Verbindlichkeiten Hersteller / Importeur", "category": "Verbindlichkeiten"},
    {"number": "3120", "name": "Verbindlichkeiten Teilelieferanten", "category": "Verbindlichkeiten"},
    {"number": "3130", "name": "Verbindlichkeiten Fremdwerkstätten / Subunternehmer", "category": "Verbindlichkeiten"},
    {"number": "3140", "name": "Verbindlichkeiten Karosserie- und Lackierbetriebe", "category": "Verbindlichkeiten"},
    {"number": "3150", "name": "Verbindlichkeiten Reifenlieferanten", "category": "Verbindlichkeiten"},
    {"number": "3200", "name": "Verbindlichkeiten gegenüber Kreditinstituten", "category": "Verbindlichkeiten"},
    {"number": "3210", "name": "Investitionsdarlehen", "category": "Verbindlichkeiten"},
    {"number": "3220", "name": "Kontokorrentkredit", "category": "Verbindlichkeiten"},
    {"number": "3300", "name": "Erhaltene Anzahlungen Kunden (Neufahrzeuge)", "category": "Verbindlichkeiten"},
    {"number": "3310", "name": "Erhaltene Anzahlungen Kunden (Gebrauchtfahrzeuge)", "category": "Verbindlichkeiten"},
    {"number": "3400", "name": "Umsatzsteuer 19%", "category": "Verbindlichkeiten"},
    {"number": "3401", "name": "Umsatzsteuer 7%", "category": "Verbindlichkeiten"},
    {"number": "3402", "name": "Differenzbesteuerung (§ 25a UStG – Gebrauchtfahrzeuge)", "category": "Verbindlichkeiten"},
    {"number": "3500", "name": "Rückstellungen", "category": "Verbindlichkeiten"},
    {"number": "3510", "name": "Rückstellung Garantiekosten / Kulanz", "category": "Verbindlichkeiten"},
    {"number": "3520", "name": "Rückstellung Urlaubsgeld und Überstunden", "category": "Verbindlichkeiten"},
    {"number": "3530", "name": "Rückstellung ausstehende Lieferantenrechnungen", "category": "Verbindlichkeiten"},
    {"number": "3540", "name": "Rückstellung Gewährleistung / Nachbesserung", "category": "Verbindlichkeiten"},
    {"number": "3600", "name": "Sonstige Verbindlichkeiten", "category": "Verbindlichkeiten"},
    {"number": "3610", "name": "Lohnsteuer und Sozialabgaben", "category": "Verbindlichkeiten"},
    {"number": "3620", "name": "Verbindlichkeiten gegenüber Mitarbeitern", "category": "Verbindlichkeiten"},
    {"number": "3700", "name": "Passive Rechnungsabgrenzungsposten", "category": "Verbindlichkeiten"},
    # ===== Klasse 4: Erlöse Neufahrzeuge =====
    {"number": "4000", "name": "Erlöse aus Neufahrzeugverkauf", "category": "Erlöse Neufahrzeuge"},
    {"number": "4010", "name": "Erlöse Neufahrzeuge Pkw 19% USt", "category": "Erlöse Neufahrzeuge"},
    {"number": "4020", "name": "Erlöse Neufahrzeuge Nutzfahrzeuge 19% USt", "category": "Erlöse Neufahrzeuge"},
    {"number": "4030", "name": "Erlöse Neufahrzeuge Motorräder 19% USt", "category": "Erlöse Neufahrzeuge"},
    {"number": "4040", "name": "Erlöse Jahreswagen / Kurzzulassungen", "category": "Erlöse Neufahrzeuge"},
    {"number": "4050", "name": "Erlöse Zubehör bei Neufahrzeugen", "category": "Erlöse Neufahrzeuge"},
    {"number": "4060", "name": "Erlöse Überführungskosten und Zulassung", "category": "Erlöse Neufahrzeuge"},
    {"number": "4070", "name": "Nachlässe / Rabatte auf Neufahrzeuge", "category": "Erlöse Neufahrzeuge"},
    # ===== Klasse 4: Erlöse Gebrauchtfahrzeuge =====
    {"number": "4100", "name": "Erlöse aus Gebrauchtfahrzeugverkauf", "category": "Erlöse Gebrauchtfahrzeuge"},
    {"number": "4110", "name": "Erlöse Gebrauchtfahrzeuge Regelbesteuerung 19%", "category": "Erlöse Gebrauchtfahrzeuge"},
    {"number": "4120", "name": "Erlöse Gebrauchtfahrzeuge Differenzbesteuerung (§ 25a)", "category": "Erlöse Gebrauchtfahrzeuge"},
    {"number": "4130", "name": "Erlöse Gebrauchtfahrzeuge steuerfreie Ausfuhr", "category": "Erlöse Gebrauchtfahrzeuge"},
    {"number": "4140", "name": "Erlöse EU-Lieferungen (Gebrauchtfahrzeuge)", "category": "Erlöse Gebrauchtfahrzeuge"},
    {"number": "4150", "name": "Erlöse Nutzfahrzeuge Gebraucht", "category": "Erlöse Gebrauchtfahrzeuge"},
    {"number": "4160", "name": "Nachlässe / Rabatte auf Gebrauchtfahrzeuge", "category": "Erlöse Gebrauchtfahrzeuge"},
    # ===== Klasse 4: Erlöse Teile & Service =====
    {"number": "4200", "name": "Erlöse Teile und Zubehör", "category": "Erlöse Teile & Service"},
    {"number": "4210", "name": "Erlöse Originalteile (OEM) 19% USt", "category": "Erlöse Teile & Service"},
    {"number": "4220", "name": "Erlöse Zubehör und Tuningteile 19% USt", "category": "Erlöse Teile & Service"},
    {"number": "4230", "name": "Erlöse Teileverkauf an Fremdwerkstätten", "category": "Erlöse Teile & Service"},
    {"number": "4240", "name": "Erlöse Motoröl und Betriebsstoffe", "category": "Erlöse Teile & Service"},
    {"number": "4300", "name": "Erlöse Werkstatt und Serviceleistungen", "category": "Erlöse Teile & Service"},
    {"number": "4310", "name": "Erlöse Inspektion und Wartungsarbeiten", "category": "Erlöse Teile & Service"},
    {"number": "4320", "name": "Erlöse Reparaturarbeiten (Unfall / Schaden)", "category": "Erlöse Teile & Service"},
    {"number": "4330", "name": "Erlöse Gewährleistungs- und Kulanzarbeiten", "category": "Erlöse Teile & Service"},
    {"number": "4340", "name": "Erlöse HU/AU-Vorbereitung und Hauptuntersuchung", "category": "Erlöse Teile & Service"},
    {"number": "4350", "name": "Erlöse Umrüstarbeiten und Zubehöreinbau", "category": "Erlöse Teile & Service"},
    {"number": "4360", "name": "Erlöse Service-Flatrate / Wartungspakete", "category": "Erlöse Teile & Service"},
    # ===== Klasse 4: Erlöse Karosserie / Lack =====
    {"number": "4400", "name": "Erlöse Karosserie und Lackierung", "category": "Erlöse Karosserie / Lack"},
    {"number": "4410", "name": "Erlöse Karosseriearbeiten", "category": "Erlöse Karosserie / Lack"},
    {"number": "4420", "name": "Erlöse Lackierarbeiten", "category": "Erlöse Karosserie / Lack"},
    {"number": "4430", "name": "Erlöse Smart-Repair (Delle, Kratzer)", "category": "Erlöse Karosserie / Lack"},
    {"number": "4440", "name": "Erlöse Versicherungsschäden (Abrechnung)", "category": "Erlöse Karosserie / Lack"},
    # ===== Klasse 4: Erlöse Reifenservice =====
    {"number": "4500", "name": "Erlöse Reifen und Räder", "category": "Erlöse Reifenservice"},
    {"number": "4510", "name": "Erlöse Reifenmontage und Wuchten", "category": "Erlöse Reifenservice"},
    {"number": "4520", "name": "Erlöse Reifenverkauf Sommerreifen", "category": "Erlöse Reifenservice"},
    {"number": "4530", "name": "Erlöse Reifenverkauf Winterreifen", "category": "Erlöse Reifenservice"},
    {"number": "4540", "name": "Erlöse Räder und Kompletträder", "category": "Erlöse Reifenservice"},
    {"number": "4550", "name": "Erlöse Reifeneinlagerung", "category": "Erlöse Reifenservice"},
    # ===== Klasse 4: Erlöse Provisionen & Prämien =====
    {"number": "4600", "name": "Prämien und Boni vom Hersteller / Importeur", "category": "Erlöse Provisionen & Prämien"},
    {"number": "4610", "name": "Volumenprämie Neufahrzeuge", "category": "Erlöse Provisionen & Prämien"},
    {"number": "4620", "name": "Qualitätsboni (CSI / SSI)", "category": "Erlöse Provisionen & Prämien"},
    {"number": "4630", "name": "Marketingzuschüsse vom Hersteller", "category": "Erlöse Provisionen & Prämien"},
    {"number": "4640", "name": "Händlernachlasserstattungen", "category": "Erlöse Provisionen & Prämien"},
    {"number": "4700", "name": "Erlöse Finanzierungs- und Versicherungsvermittlung", "category": "Erlöse Provisionen & Prämien"},
    {"number": "4710", "name": "Provisionen Fahrzeugfinanzierung (Bank)", "category": "Erlöse Provisionen & Prämien"},
    {"number": "4720", "name": "Provisionen Leasingvermittlung", "category": "Erlöse Provisionen & Prämien"},
    {"number": "4730", "name": "Provisionen Kfz-Versicherung", "category": "Erlöse Provisionen & Prämien"},
    {"number": "4740", "name": "Provisionen GAP- und Restschuldversicherung", "category": "Erlöse Provisionen & Prämien"},
    {"number": "4750", "name": "Provisionen Garantieverlängerung", "category": "Erlöse Provisionen & Prämien"},
    # ===== Klasse 4: Erlöse Sonstiges =====
    {"number": "4800", "name": "Sonstige Erlöse", "category": "Erlöse Sonstiges"},
    {"number": "4810", "name": "Erlöse Fahrzeugaufbereitung / Politur", "category": "Erlöse Sonstiges"},
    {"number": "4820", "name": "Erlöse Fahrzeugvermietung / Loaner Cars", "category": "Erlöse Sonstiges"},
    {"number": "4830", "name": "Erlöse Pannenhilfe und Abschleppen", "category": "Erlöse Sonstiges"},
    {"number": "4840", "name": "Erlöse Tankstelle / Autowäsche", "category": "Erlöse Sonstiges"},
    {"number": "4850", "name": "Erlöse Merchandise / Fanshop", "category": "Erlöse Sonstiges"},
    {"number": "4860", "name": "Erlöse Altmetall und Schrottverkauf", "category": "Erlöse Sonstiges"},
    {"number": "4870", "name": "Erlöse Altölannahme und Entsorgung", "category": "Erlöse Sonstiges"},
    {"number": "4900", "name": "Periodenverschiebungen und Ertragsabgrenzungen", "category": "Erlöse Sonstiges"},
    # ===== Klasse 5: Wareneinsatz Fahrzeuge =====
    {"number": "5000", "name": "Einkauf Neufahrzeuge", "category": "Wareneinsatz Fahrzeuge"},
    {"number": "5010", "name": "Einkauf Neufahrzeuge Pkw (Hersteller)", "category": "Wareneinsatz Fahrzeuge"},
    {"number": "5020", "name": "Einkauf Neufahrzeuge Nutzfahrzeuge", "category": "Wareneinsatz Fahrzeuge"},
    {"number": "5030", "name": "Einkauf Jahreswagen und Kurzzulassungen", "category": "Wareneinsatz Fahrzeuge"},
    {"number": "5040", "name": "Einkaufsnebenkosten Neufahrzeuge (Transport, Zoll)", "category": "Wareneinsatz Fahrzeuge"},
    {"number": "5100", "name": "Einkauf Gebrauchtfahrzeuge", "category": "Wareneinsatz Fahrzeuge"},
    {"number": "5110", "name": "Ankauf Gebrauchtfahrzeuge (In-Trade)", "category": "Wareneinsatz Fahrzeuge"},
    {"number": "5120", "name": "Ankauf über Auktionen (BCA, Autorola u.a.)", "category": "Wareneinsatz Fahrzeuge"},
    {"number": "5130", "name": "Aufbereitungskosten Gebrauchtfahrzeuge", "category": "Wareneinsatz Fahrzeuge"},
    {"number": "5140", "name": "Standkosten Gebrauchtfahrzeuge", "category": "Wareneinsatz Fahrzeuge"},
    {"number": "5400", "name": "Nachlässe und Preisreduzierungen (Einkauf)", "category": "Wareneinsatz Fahrzeuge"},
    {"number": "5410", "name": "Händlernachlass vom Hersteller", "category": "Wareneinsatz Fahrzeuge"},
    # ===== Klasse 5: Wareneinsatz Teile =====
    {"number": "5200", "name": "Einkauf Teile und Zubehör", "category": "Wareneinsatz Teile"},
    {"number": "5210", "name": "Einkauf Originalteile (Hersteller/Importeur)", "category": "Wareneinsatz Teile"},
    {"number": "5220", "name": "Einkauf Fremdmarken-Teile (Aftermarket)", "category": "Wareneinsatz Teile"},
    {"number": "5230", "name": "Einkauf Reifen und Räder", "category": "Wareneinsatz Teile"},
    {"number": "5240", "name": "Einkauf Zubehör und Tuningteile", "category": "Wareneinsatz Teile"},
    {"number": "5250", "name": "Einkauf Betriebsstoffe und Motoröl", "category": "Wareneinsatz Teile"},
    {"number": "5260", "name": "Einkauf Karosserie- und Lackmaterial", "category": "Wareneinsatz Teile"},
    {"number": "5420", "name": "Skonti auf Teile-Einkauf", "category": "Wareneinsatz Teile"},
    # ===== Klasse 5: Wareneinsatz Fremdleistungen =====
    {"number": "5300", "name": "Fremdleistungen und Subunternehmer", "category": "Wareneinsatz Fremdleistungen"},
    {"number": "5310", "name": "Fremdwerkstatt (Spezialreparaturen)", "category": "Wareneinsatz Fremdleistungen"},
    {"number": "5320", "name": "Externe Lackierer und Karosseriebetriebe", "category": "Wareneinsatz Fremdleistungen"},
    {"number": "5330", "name": "Gutachter und Sachverständige", "category": "Wareneinsatz Fremdleistungen"},
    {"number": "5340", "name": "Fahrzeugaufbereiter (extern)", "category": "Wareneinsatz Fremdleistungen"},
    {"number": "5350", "name": "TÜV / DEKRA / GTÜ Kosten", "category": "Wareneinsatz Fremdleistungen"},
    # ===== Klasse 6: Personalaufwand =====
    {"number": "6000", "name": "Löhne und Gehälter (Werkstatt)", "category": "Personalaufwand"},
    {"number": "6010", "name": "Löhne Kfz-Mechaniker / Mechatroniker", "category": "Personalaufwand"},
    {"number": "6020", "name": "Löhne Karosseriebauer / Spengler", "category": "Personalaufwand"},
    {"number": "6030", "name": "Löhne Lackierer", "category": "Personalaufwand"},
    {"number": "6040", "name": "Löhne Reifenmonteure", "category": "Personalaufwand"},
    {"number": "6050", "name": "Löhne Lehrlinge / Auszubildende (Werkstatt)", "category": "Personalaufwand"},
    {"number": "6100", "name": "Gehälter Verkauf (Neufahrzeuge)", "category": "Personalaufwand"},
    {"number": "6110", "name": "Gehälter Verkaufsberater Neufahrzeuge", "category": "Personalaufwand"},
    {"number": "6120", "name": "Gehälter Verkaufsberater Gebrauchtfahrzeuge", "category": "Personalaufwand"},
    {"number": "6130", "name": "Provisionen Verkäufer", "category": "Personalaufwand"},
    {"number": "6140", "name": "Gehälter Teileverkauf und Service-Annahme", "category": "Personalaufwand"},
    {"number": "6200", "name": "Gehälter Verwaltung und Geschäftsführung", "category": "Personalaufwand"},
    {"number": "6210", "name": "Gehalt Geschäftsführer / Inhaber", "category": "Personalaufwand"},
    {"number": "6220", "name": "Gehälter Buchhaltung / Controlling", "category": "Personalaufwand"},
    {"number": "6230", "name": "Gehälter Empfang / Sekretariat", "category": "Personalaufwand"},
    {"number": "6300", "name": "Soziale Abgaben", "category": "Personalaufwand"},
    {"number": "6310", "name": "Arbeitgeberanteil Kranken- und Rentenversicherung", "category": "Personalaufwand"},
    {"number": "6320", "name": "Berufsgenossenschaft Beiträge (BG Metall)", "category": "Personalaufwand"},
    {"number": "6330", "name": "Betriebliche Altersvorsorge (bAV)", "category": "Personalaufwand"},
    {"number": "6400", "name": "Sonstiger Personalaufwand", "category": "Personalaufwand"},
    {"number": "6410", "name": "Überstundenvergütungen", "category": "Personalaufwand"},
    {"number": "6420", "name": "Weihnachtsgeld / Urlaubsgeld", "category": "Personalaufwand"},
    {"number": "6430", "name": "Leistungsprämien und Boni", "category": "Personalaufwand"},
    {"number": "6440", "name": "Reisekosten Mitarbeiter", "category": "Personalaufwand"},
    {"number": "6450", "name": "Kosten Weiterbildung / Schulungen", "category": "Personalaufwand"},
    {"number": "6460", "name": "Arbeitskleidung und Schutzausrüstung", "category": "Personalaufwand"},
    # ===== Klasse 7: Betriebskosten =====
    {"number": "7000", "name": "Raumkosten", "category": "Betriebskosten"},
    {"number": "7010", "name": "Miete Betriebsgebäude", "category": "Betriebskosten"},
    {"number": "7020", "name": "Nebenkosten (Heizung, Strom, Wasser)", "category": "Betriebskosten"},
    {"number": "7030", "name": "Grundsteuer und Grundbesitzabgaben", "category": "Betriebskosten"},
    {"number": "7040", "name": "Instandhaltung Gebäude und Einrichtung", "category": "Betriebskosten"},
    {"number": "7050", "name": "Reinigung und Entsorgung", "category": "Betriebskosten"},
    {"number": "7060", "name": "Bewachung und Sicherheitsdienst", "category": "Betriebskosten"},
    {"number": "7100", "name": "Kfz-Kosten (betriebliche Fahrzeuge)", "category": "Betriebskosten"},
    {"number": "7110", "name": "Kraftstoff und Schmierstoffe (Fuhrpark)", "category": "Betriebskosten"},
    {"number": "7120", "name": "Kfz-Versicherung (Fuhrpark)", "category": "Betriebskosten"},
    {"number": "7130", "name": "Kfz-Steuer (Fuhrpark)", "category": "Betriebskosten"},
    {"number": "7140", "name": "Reparaturen und Inspektionen (Fuhrpark)", "category": "Betriebskosten"},
    {"number": "7150", "name": "Leasingraten Vorführwagen", "category": "Betriebskosten"},
    # ===== Klasse 7: Vertriebskosten =====
    {"number": "7200", "name": "Werbung und Marketing", "category": "Vertriebskosten"},
    {"number": "7210", "name": "Online-Werbung (AutoScout24, Mobile.de u.a.)", "category": "Vertriebskosten"},
    {"number": "7220", "name": "Printanzeigen und Prospektmaterial", "category": "Vertriebskosten"},
    {"number": "7230", "name": "Hersteller-CI / Corporate Design Kosten", "category": "Vertriebskosten"},
    {"number": "7240", "name": "Messen und Events (Automobilmessen)", "category": "Vertriebskosten"},
    {"number": "7250", "name": "Social-Media-Marketing", "category": "Vertriebskosten"},
    {"number": "7260", "name": "Kundenbindungsprogramme / CRM", "category": "Vertriebskosten"},
    {"number": "7270", "name": "Probefahrtkosten", "category": "Vertriebskosten"},
    # ===== Klasse 7: Verwaltungskosten =====
    {"number": "7300", "name": "Allgemeine Verwaltungskosten", "category": "Verwaltungskosten"},
    {"number": "7310", "name": "Büromaterial und Drucksachen", "category": "Verwaltungskosten"},
    {"number": "7320", "name": "Porto und Versandkosten", "category": "Verwaltungskosten"},
    {"number": "7330", "name": "Telefon, Fax und Internet", "category": "Verwaltungskosten"},
    {"number": "7340", "name": "EDV / Software (DMS – Dealer Management System)", "category": "Verwaltungskosten"},
    {"number": "7350", "name": "Buchhaltung und Steuerberatung", "category": "Verwaltungskosten"},
    {"number": "7360", "name": "Rechtsberatung und Gerichtskosten", "category": "Verwaltungskosten"},
    {"number": "7370", "name": "Wirtschaftsprüfung und Jahresabschluss", "category": "Verwaltungskosten"},
    {"number": "7380", "name": "Bankgebühren und Kontoführungskosten", "category": "Verwaltungskosten"},
    {"number": "7390", "name": "Sonstige Verwaltungskosten", "category": "Verwaltungskosten"},
    # ===== Klasse 7: Versicherungen =====
    {"number": "7400", "name": "Versicherungen (Betrieb)", "category": "Betriebskosten"},
    {"number": "7410", "name": "Betriebshaftpflichtversicherung", "category": "Betriebskosten"},
    {"number": "7420", "name": "Inhaltsversicherung / Inventarversicherung", "category": "Betriebskosten"},
    {"number": "7430", "name": "Kfz-Ausstellungsfahrzeuge-Versicherung", "category": "Betriebskosten"},
    {"number": "7440", "name": "Kreditausfallversicherung", "category": "Betriebskosten"},
    {"number": "7450", "name": "Unfallversicherung Mitarbeiter", "category": "Betriebskosten"},
    # ===== Klasse 7: Abschreibungen =====
    {"number": "7500", "name": "Abschreibungen", "category": "Abschreibungen"},
    {"number": "7510", "name": "Abschreibungen auf Gebäude und Einrichtungen", "category": "Abschreibungen"},
    {"number": "7520", "name": "Abschreibungen auf Werkstattausstattung", "category": "Abschreibungen"},
    {"number": "7530", "name": "Abschreibungen auf Vorführfahrzeuge", "category": "Abschreibungen"},
    {"number": "7540", "name": "Abschreibungen auf EDV und Software", "category": "Abschreibungen"},
    {"number": "7550", "name": "Abschreibungen auf GWG (bis 800 EUR netto)", "category": "Abschreibungen"},
    {"number": "7560", "name": "Wertberichtigung Gebrauchtfahrzeuge", "category": "Abschreibungen"},
    # ===== Klasse 7: Sonstige Betriebskosten =====
    {"number": "7600", "name": "Sonstige betriebliche Aufwendungen", "category": "Betriebskosten"},
    {"number": "7610", "name": "Beiträge Kfz-Innungen und Verbände (ZDK)", "category": "Betriebskosten"},
    {"number": "7620", "name": "Gewerbesteuer", "category": "Betriebskosten"},
    {"number": "7630", "name": "Kfz-Steuer Vorführfahrzeuge", "category": "Betriebskosten"},
    {"number": "7640", "name": "Verluste aus Fahrzeugverkäufen", "category": "Betriebskosten"},
    {"number": "7650", "name": "Garantiekosten und Kulanzleistungen", "category": "Betriebskosten"},
    {"number": "7660", "name": "Ersatzwagenkosten (Leihfahrzeuge)", "category": "Betriebskosten"},
    {"number": "7670", "name": "Unfallkosten betriebliche Fahrzeuge", "category": "Betriebskosten"},
    # ===== Klasse 8: Finanzergebnis =====
    {"number": "8000", "name": "Zinserträge", "category": "Finanzergebnis"},
    {"number": "8010", "name": "Zinserträge aus Kapitalanlagen", "category": "Finanzergebnis"},
    {"number": "8020", "name": "Zinserträge aus Kundenforderungen", "category": "Finanzergebnis"},
    {"number": "8100", "name": "Zinsaufwand", "category": "Finanzergebnis"},
    {"number": "8110", "name": "Zinsen Floorplan-Finanzierung", "category": "Finanzergebnis"},
    {"number": "8120", "name": "Zinsen Investitionsdarlehen", "category": "Finanzergebnis"},
    {"number": "8130", "name": "Zinsen Kontokorrentkredit", "category": "Finanzergebnis"},
    {"number": "8200", "name": "Außerordentliche Erträge", "category": "Finanzergebnis"},
    {"number": "8210", "name": "Erträge aus Fahrzeugverkauf (Anlagevermögen)", "category": "Finanzergebnis"},
    {"number": "8220", "name": "Erträge aus Auflösung von Rückstellungen", "category": "Finanzergebnis"},
    {"number": "8300", "name": "Außerordentliche Aufwendungen", "category": "Finanzergebnis"},
    {"number": "8310", "name": "Aufwendungen aus Fahrzeugverkauf (Buchwert)", "category": "Finanzergebnis"},
    # ===== Klasse 9: Abschlusskonten =====
    {"number": "9000", "name": "Eröffnungsbilanzkonto", "category": "Abschluss"},
    {"number": "9800", "name": "Gewinn- und Verlustrechnung", "category": "Abschluss"},
    {"number": "9900", "name": "Schlussbilanzkonto", "category": "Abschluss"},
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
    default_kontenrahmen: str = "SKR03"  # SKR03, SKR04, or SKR51
    updated_at: datetime = Field(default_factory=datetime.utcnow)

# DATEV Unternehmen Online Configuration
class DatevConfig(BaseModel):
    id: str = "datev_config"
    enabled: bool = False
    simulation_mode: bool = True
    client_id: str = ""
    client_secret: str = ""
    berater_nr: str = ""
    mandant_nr: str = ""
    oauth_token: str = ""
    oauth_refresh_token: str = ""
    oauth_expires_at: Optional[datetime] = None
    auto_upload_on_approval: bool = False
    auto_upload_on_archive: bool = True
    last_sync: Optional[datetime] = None
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class DatevUploadStatus(str, Enum):
    PENDING = "pending"
    UPLOADING = "uploading"
    SUCCESS = "success"
    FAILED = "failed"
    SIMULATED = "simulated"

class DatevUploadLog(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    invoice_id: str
    invoice_number: str = ""
    status: DatevUploadStatus = DatevUploadStatus.PENDING
    datev_document_id: str = ""
    error_message: str = ""
    xml_content: str = ""
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None

# Banking / Payment Configuration
class BankingProvider(str, Enum):
    SIMULATION = "simulation"
    FINAPI = "finapi"
    TINK = "tink"
    EBICS = "ebics"

class BankingConfig(BaseModel):
    id: str = "banking_config"
    enabled: bool = False
    simulation_mode: bool = True
    provider: BankingProvider = BankingProvider.SIMULATION
    api_key: str = ""
    api_secret: str = ""
    company_iban: str = ""
    company_bic: str = ""
    company_name: str = ""
    auto_payment_on_approval: bool = False
    require_4_eyes: bool = True
    max_auto_amount: float = 10000.0
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class PaymentStatus(str, Enum):
    PENDING = "pending"
    INITIATED = "initiated"
    AWAITING_APPROVAL = "awaiting_approval"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    SIMULATED = "simulated"

class PaymentLog(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    invoice_id: str
    invoice_number: str = ""
    amount: float = 0.0
    currency: str = "EUR"
    creditor_name: str = ""
    creditor_iban: str = ""
    reference: str = ""
    status: PaymentStatus = PaymentStatus.PENDING
    provider: BankingProvider = BankingProvider.SIMULATION
    provider_transaction_id: str = ""
    sepa_xml: str = ""
    error_message: str = ""
    initiated_at: datetime = Field(default_factory=datetime.utcnow)
    initiated_by: str = ""
    approved_by: str = ""
    completed_at: Optional[datetime] = None

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
    kontenrahmen: str  # SKR03, SKR04, or SKR51
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

# NEW: Multi-Stage Approval Workflow Models
class ApprovalStage(BaseModel):
    stage_number: int
    stage_name: str
    required_role: UserRole
    approver_id: Optional[str] = None
    approver_name: Optional[str] = None
    status: ApprovalStageStatus = ApprovalStageStatus.PENDING
    approved_at: Optional[datetime] = None
    comment: Optional[str] = None

class ApprovalWorkflow(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str = ""
    stages: List[ApprovalStage] = []
    min_amount: float = 0  # Minimum invoice amount to trigger this workflow
    max_amount: Optional[float] = None  # Maximum amount (None = unlimited)
    active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)

class WorkflowCreate(BaseModel):
    name: str
    description: str = ""
    stages: List[dict]  # List of {stage_name, required_role}
    min_amount: float = 0
    max_amount: Optional[float] = None

# NEW: Email Settings Model
class EmailSettings(BaseModel):
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    from_email: str = "noreply@candis-kopie.de"
    from_name: str = "Candis-Kopie"
    enabled: bool = False

class EmailNotification(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    recipient_email: str
    recipient_name: str
    subject: str
    body: str
    sent: bool = False
    sent_at: Optional[datetime] = None
    error: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class ImapSettings(BaseModel):
    imap_host: str = ""
    imap_port: int = 993
    imap_user: str = ""
    imap_password: str = ""
    imap_folder: str = "INBOX"
    imap_ssl: bool = True
    imap_enabled: bool = False
    auto_import_mode: str = "semi"  # manual, semi, auto
    poll_interval_minutes: int = 15
    ai_confidence_threshold: float = 0.85

class EmailAttachmentInfo(BaseModel):
    filename: str
    content_type: str
    size_bytes: int

class EmailInboxItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    uid: str
    message_id: str = ""
    subject: str = ""
    sender: str = ""
    date: datetime = Field(default_factory=datetime.utcnow)
    attachments: List[dict] = []
    ai_status: str = "pending"  # pending, invoice, not_invoice, uncertain, checking
    ai_confidence: float = 0.0
    ai_details: Optional[dict] = None
    ai_checked_at: Optional[datetime] = None
    imported: bool = False
    invoice_id: Optional[str] = None
    imported_at: Optional[datetime] = None
    fetched_at: datetime = Field(default_factory=datetime.utcnow)

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

# Role-based dependency shortcuts
def require_admin():
    async def check(credentials: HTTPAuthorizationCredentials = Depends(security)):
        return await require_role([UserRole.ADMIN], credentials)
    return check

def require_manager_or_above():
    async def check(credentials: HTTPAuthorizationCredentials = Depends(security)):
        return await require_role([UserRole.ADMIN, UserRole.MANAGER], credentials)
    return check

def require_accountant_or_above():
    async def check(credentials: HTTPAuthorizationCredentials = Depends(security)):
        return await require_role([UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT], credentials)
    return check

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

# ===================== EMAIL FUNCTIONS =====================
async def get_email_settings() -> EmailSettings:
    """Get email settings from database"""
    settings_doc = await db.email_settings.find_one({"id": "email_settings"})
    if settings_doc:
        return EmailSettings(**{k: v for k, v in settings_doc.items() if k != '_id'})
    # Return default (disabled) settings
    return EmailSettings()

async def send_email(to_email: str, to_name: str, subject: str, body_html: str, body_text: str = None):
    """Send email using SMTP"""
    email_settings = await get_email_settings()
    
    if not email_settings.enabled or not email_settings.smtp_host:
        logger.info(f"Email not sent (disabled): {subject} to {to_email}")
        # Store notification for later
        notification = EmailNotification(
            recipient_email=to_email,
            recipient_name=to_name,
            subject=subject,
            body=body_html,
            sent=False,
            error="E-Mail-Versand deaktiviert"
        )
        await db.email_notifications.insert_one(notification.model_dump())
        return False
    
    try:
        message = MIMEMultipart("alternative")
        message["From"] = f"{email_settings.from_name} <{email_settings.from_email}>"
        message["To"] = f"{to_name} <{to_email}>"
        message["Subject"] = subject
        
        if body_text:
            message.attach(MIMEText(body_text, "plain", "utf-8"))
        message.attach(MIMEText(body_html, "html", "utf-8"))
        
        await aiosmtplib.send(
            message,
            hostname=email_settings.smtp_host,
            port=email_settings.smtp_port,
            username=email_settings.smtp_user,
            password=email_settings.smtp_password,
            start_tls=True,
        )
        
        # Log successful send
        notification = EmailNotification(
            recipient_email=to_email,
            recipient_name=to_name,
            subject=subject,
            body=body_html,
            sent=True,
            sent_at=datetime.utcnow()
        )
        await db.email_notifications.insert_one(notification.model_dump())
        
        logger.info(f"Email sent: {subject} to {to_email}")
        return True
        
    except Exception as e:
        logger.error(f"Email send error: {str(e)}")
        # Store failed notification
        notification = EmailNotification(
            recipient_email=to_email,
            recipient_name=to_name,
            subject=subject,
            body=body_html,
            sent=False,
            error=str(e)
        )
        await db.email_notifications.insert_one(notification.model_dump())
        return False

async def send_approval_request_email(invoice: dict, approver_email: str, approver_name: str, stage_name: str):
    """Send email to request approval"""
    data = invoice.get('data', {})
    subject = f"Freigabe erforderlich: Rechnung {data.get('invoice_number', 'N/A')} - {data.get('vendor_name', 'Unbekannt')}"
    
    body_html = f"""
    <html>
    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #6c5ce7;">Freigabe erforderlich</h2>
        <p>Hallo {approver_name},</p>
        <p>Eine Rechnung wartet auf Ihre Freigabe:</p>
        
        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Rechnungsnummer:</strong> {data.get('invoice_number', 'N/A')}</p>
            <p><strong>Lieferant:</strong> {data.get('vendor_name', 'Unbekannt')}</p>
            <p><strong>Betrag:</strong> {data.get('gross_amount', 0):.2f} €</p>
            <p><strong>Freigabestufe:</strong> {stage_name}</p>
        </div>
        
        <p>Bitte melden Sie sich in Candis-Kopie an, um die Rechnung zu prüfen und freizugeben.</p>
        
        <p style="color: #888; font-size: 12px; margin-top: 30px;">
            Diese E-Mail wurde automatisch von Candis-Kopie generiert.
        </p>
    </body>
    </html>
    """
    
    await send_email(approver_email, approver_name, subject, body_html)

async def send_approval_notification_email(invoice: dict, user_email: str, user_name: str, approved: bool, reason: str = None):
    """Send email notification about approval/rejection"""
    data = invoice.get('data', {})
    status = "genehmigt" if approved else "abgelehnt"
    subject = f"Rechnung {data.get('invoice_number', 'N/A')} wurde {status}"
    
    reason_text = f"<p><strong>Grund:</strong> {reason}</p>" if reason else ""
    
    body_html = f"""
    <html>
    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: {'#55efc4' if approved else '#ff7675'};">Rechnung {status}</h2>
        <p>Hallo {user_name},</p>
        <p>Die folgende Rechnung wurde {status}:</p>
        
        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Rechnungsnummer:</strong> {data.get('invoice_number', 'N/A')}</p>
            <p><strong>Lieferant:</strong> {data.get('vendor_name', 'Unbekannt')}</p>
            <p><strong>Betrag:</strong> {data.get('gross_amount', 0):.2f} €</p>
            {reason_text}
        </div>
        
        <p style="color: #888; font-size: 12px; margin-top: 30px;">
            Diese E-Mail wurde automatisch von Candis-Kopie generiert.
        </p>
    </body>
    </html>
    """
    
    await send_email(user_email, user_name, subject, body_html)

async def send_reminder_email(invoice: dict, user_email: str, user_name: str, reminder_message: str):
    """Send reminder email"""
    data = invoice.get('data', {})
    subject = f"Erinnerung: Rechnung {data.get('invoice_number', 'N/A')}"
    
    body_html = f"""
    <html>
    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #fd79a8;">Erinnerung</h2>
        <p>Hallo {user_name},</p>
        <p>{reminder_message}</p>
        
        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Rechnungsnummer:</strong> {data.get('invoice_number', 'N/A')}</p>
            <p><strong>Lieferant:</strong> {data.get('vendor_name', 'Unbekannt')}</p>
            <p><strong>Betrag:</strong> {data.get('gross_amount', 0):.2f} €</p>
        </div>
        
        <p>Bitte melden Sie sich in Candis-Kopie an, um die Aktion auszuführen.</p>
        
        <p style="color: #888; font-size: 12px; margin-top: 30px;">
            Diese E-Mail wurde automatisch von Candis-Kopie generiert.
        </p>
    </body>
    </html>
    """
    
    await send_email(user_email, user_name, subject, body_html)

# ===================== WORKFLOW FUNCTIONS =====================
async def get_applicable_workflow(amount: float) -> Optional[ApprovalWorkflow]:
    """Find the applicable workflow based on invoice amount"""
    workflows = await db.workflows.find({"active": True}).to_list(100)
    
    for workflow_doc in workflows:
        workflow = ApprovalWorkflow(**{k: v for k, v in workflow_doc.items() if k != '_id'})
        if amount >= workflow.min_amount:
            if workflow.max_amount is None or amount <= workflow.max_amount:
                return workflow
    
    return None

async def create_invoice_workflow(invoice_id: str, workflow: ApprovalWorkflow):
    """Create workflow instance for an invoice"""
    workflow_instance = {
        "id": str(uuid.uuid4()),
        "invoice_id": invoice_id,
        "workflow_id": workflow.id,
        "workflow_name": workflow.name,
        "stages": [stage.model_dump() for stage in workflow.stages],
        "current_stage": 0,
        "completed": False,
        "created_at": datetime.utcnow()
    }
    await db.invoice_workflows.insert_one(workflow_instance)
    return workflow_instance

async def get_invoice_workflow(invoice_id: str) -> Optional[dict]:
    """Get workflow instance for an invoice"""
    workflow = await db.invoice_workflows.find_one({"invoice_id": invoice_id})
    if workflow:
        return {k: v for k, v in workflow.items() if k != '_id'}
    return None

async def advance_workflow_stage(invoice_id: str, approver_id: str, approver_name: str, comment: str = None) -> bool:
    """Advance to next workflow stage or complete workflow"""
    workflow = await get_invoice_workflow(invoice_id)
    if not workflow or workflow.get('completed'):
        return True  # No workflow or already completed
    
    current_stage_idx = workflow.get('current_stage', 0)
    stages = workflow.get('stages', [])
    
    if current_stage_idx >= len(stages):
        return True  # All stages complete
    
    # Update current stage
    stages[current_stage_idx]['status'] = ApprovalStageStatus.APPROVED.value
    stages[current_stage_idx]['approver_id'] = approver_id
    stages[current_stage_idx]['approver_name'] = approver_name
    stages[current_stage_idx]['approved_at'] = datetime.utcnow()
    stages[current_stage_idx]['comment'] = comment
    
    # Check if more stages
    next_stage_idx = current_stage_idx + 1
    if next_stage_idx >= len(stages):
        # Workflow complete
        await db.invoice_workflows.update_one(
            {"invoice_id": invoice_id},
            {"$set": {"stages": stages, "current_stage": next_stage_idx, "completed": True}}
        )
        return True
    else:
        # Move to next stage
        await db.invoice_workflows.update_one(
            {"invoice_id": invoice_id},
            {"$set": {"stages": stages, "current_stage": next_stage_idx}}
        )
        
        # Send email to next approver
        next_stage = stages[next_stage_idx]
        required_role = next_stage.get('required_role')
        
        # Find users with required role
        approvers = await db.users.find({"role": required_role, "active": True}).to_list(10)
        invoice = await db.invoices.find_one({"id": invoice_id})
        
        for approver in approvers:
            await send_approval_request_email(
                invoice,
                approver['email'],
                approver['name'],
                next_stage.get('stage_name', f'Stufe {next_stage_idx + 1}')
            )
        
        return False

def _is_pdf_base64(b64_string: str) -> bool:
    """Check if base64 data is a PDF by examining the magic bytes"""
    try:
        raw = base64.b64decode(b64_string[:20])
        return raw[:4] == b'%PDF'
    except Exception:
        return False

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
    raw_base64 = image_base64
    
    if image_base64.startswith("data:"):
        parts = image_base64.split(";base64,")
        if len(parts) == 2:
            media_type = parts[0].replace("data:", "")
            raw_base64 = parts[1]
    
    # If the file is a PDF, convert to image using PyMuPDF
    if media_type == "application/pdf" or _is_pdf_base64(raw_base64):
        logger.info("PDF detected, converting to image...")
        try:
            pdf_bytes = base64.b64decode(raw_base64)
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            
            # Render all pages (up to 5) and combine into images
            image_contents = []
            for page_num in range(min(len(doc), 5)):
                page = doc.load_page(page_num)
                # Render at 2x zoom for better OCR quality
                mat = fitz.Matrix(2.0, 2.0)
                pix = page.get_pixmap(matrix=mat)
                img_bytes = pix.tobytes("png")
                img_b64 = base64.b64encode(img_bytes).decode()
                image_contents.append({
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/png;base64,{img_b64}"
                    }
                })
            doc.close()
            
            logger.info(f"PDF converted: {len(image_contents)} pages rendered as images")
            
            # Build message with all page images
            message_content = [{"type": "text", "text": prompt}] + image_contents
            
        except Exception as e:
            logger.error(f"PDF conversion error: {str(e)}")
            raise HTTPException(status_code=400, detail=f"PDF-Konvertierung fehlgeschlagen: {str(e)}")
    else:
        # Regular image
        message_content = [
            {"type": "text", "text": prompt},
            {
                "type": "image_url",
                "image_url": {
                    "url": f"data:{media_type};base64,{raw_base64}"
                }
            }
        ]
    
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
                            "content": message_content
                        }
                    ],
                    "max_tokens": 2000,
                    "temperature": 0.1
                },
                timeout=120.0
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
async def update_user(user_id: str, update: UserUpdate, current_user: dict = Depends(require_admin())):
    """Update user (Admin only)"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Benutzer nicht gefunden")
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if update_data:
        await db.users.update_one({"id": user_id}, {"$set": update_data})
    
    updated = await db.users.find_one({"id": user_id})
    return UserResponse(**updated)

@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, current_user: dict = Depends(require_admin())):
    """Delete user (Admin only)"""
    result = await db.users.delete_one({"id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Benutzer nicht gefunden")
    return {"message": "Benutzer gelöscht"}

# ===== KONTENRAHMEN =====

@api_router.get("/accounts")
async def get_accounts(kontenrahmen: str = Query(default="SKR03")):
    """Get accounts from Kontenrahmen (SKR03, SKR04, or SKR51)"""
    # Check if accounts exist in DB
    count = await db.accounts.count_documents({"kontenrahmen": kontenrahmen})
    
    if count == 0:
        # Seed accounts based on selected framework
        if kontenrahmen == "SKR51":
            accounts_data = SKR51_ACCOUNTS
        elif kontenrahmen == "SKR04":
            accounts_data = SKR04_ACCOUNTS
        else:
            accounts_data = SKR03_ACCOUNTS
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
async def create_invoice(invoice_create: InvoiceCreate, current_user: dict = Depends(require_accountant_or_above())):
    """Create a new invoice with OCR extraction (Admin/Manager/Accountant)"""
    try:
        invoice_data = await extract_invoice_with_ai(invoice_create.image_base64)
        
        # For PDFs: store the rendered first page image instead of raw PDF data
        stored_image = invoice_create.image_base64
        raw_base64 = invoice_create.image_base64
        if raw_base64.startswith("data:"):
            parts = raw_base64.split(";base64,")
            if len(parts) == 2:
                raw_base64 = parts[1]
        
        if _is_pdf_base64(raw_base64):
            try:
                pdf_bytes = base64.b64decode(raw_base64)
                doc = fitz.open(stream=pdf_bytes, filetype="pdf")
                page = doc.load_page(0)
                mat = fitz.Matrix(2.0, 2.0)
                pix = page.get_pixmap(matrix=mat)
                img_bytes = pix.tobytes("png")
                stored_image = f"data:image/png;base64,{base64.b64encode(img_bytes).decode()}"
                doc.close()
                logger.info("PDF first page stored as PNG preview image")
            except Exception as e:
                logger.warning(f"Could not convert PDF to preview image: {e}")
        
        invoice = Invoice(
            data=invoice_data,
            image_base64=stored_image,
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
async def delete_invoice(invoice_id: str, current_user: dict = Depends(require_admin())):
    """Delete an invoice (Admin only)"""
    invoice = await db.invoices.find_one({"id": invoice_id})
    if not invoice:
        raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")
    
    await db.invoices.delete_one({"id": invoice_id})
    # Also clean up related data
    await db.audit_logs.delete_many({"invoice_id": invoice_id})
    await db.invoice_workflows.delete_many({"invoice_id": invoice_id})
    await log_audit(invoice_id, "deleted", "user", {"previous_status": invoice.get('status', 'unknown')})
    
    return {"message": "Rechnung gelöscht"}

# ===== APPROVAL WORKFLOW =====

@api_router.post("/invoices/{invoice_id}/approve", response_model=Invoice)
async def approve_invoice(invoice_id: str, approval: ApprovalRequest, current_user: dict = Depends(require_manager_or_above())):
    """Approve an invoice (Admin/Manager only)"""
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
async def reject_invoice(invoice_id: str, rejection: RejectionRequest, current_user: dict = Depends(require_manager_or_above())):
    """Reject an invoice (Admin/Manager only)"""
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
async def archive_invoice(invoice_id: str, current_user: dict = Depends(require_manager_or_above())):
    """Archive an invoice (Admin/Manager only)"""
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
async def update_settings(settings: Settings, current_user: dict = Depends(require_admin())):
    """Update application settings (Admin only)"""
    settings.id = "global_settings"
    settings.updated_at = datetime.utcnow()
    
    await db.settings.replace_one(
        {"id": "global_settings"},
        settings.model_dump(),
        upsert=True
    )
    
    return settings

# ===== OPENROUTER AI MODELS =====

@api_router.get("/ai-models")
async def get_ai_models():
    """Fetch available models from OpenRouter API"""
    settings = await get_settings()
    
    if not settings.ai_settings.api_key:
        # Return popular default models if no API key
        return _get_default_models()
    
    try:
        async with httpx.AsyncClient() as http_client:
            response = await http_client.get(
                "https://openrouter.ai/api/v1/models",
                headers={
                    "Authorization": f"Bearer {settings.ai_settings.api_key}",
                },
                timeout=15.0
            )
            
            if response.status_code == 200:
                data = response.json()
                models = data.get("data", [])
                
                # Filter to vision-capable models and format
                vision_models = []
                for m in models:
                    model_id = m.get("id", "")
                    name = m.get("name", model_id)
                    pricing = m.get("pricing", {})
                    arch = m.get("architecture", {})
                    modality = arch.get("modality", "")
                    
                    # Only include models that support image input
                    if "image" in modality or any(kw in model_id.lower() for kw in ["gpt-4o", "claude-3", "claude-sonnet", "claude-opus", "gemini", "llama-3.2", "llama-4", "qwen2-vl", "pixtral"]):
                        vision_models.append({
                            "id": model_id,
                            "name": name,
                            "pricing_prompt": pricing.get("prompt", "0"),
                            "pricing_completion": pricing.get("completion", "0"),
                            "context_length": m.get("context_length", 0),
                        })
                
                # Sort by name
                vision_models.sort(key=lambda x: x["name"])
                
                if vision_models:
                    return vision_models
                    
            # Fallback to defaults
            return _get_default_models()
            
    except Exception as e:
        logger.error(f"Error fetching OpenRouter models: {str(e)}")
        return _get_default_models()

def _get_default_models():
    """Return a curated list of popular vision models"""
    return [
        {"id": "openai/gpt-4o", "name": "GPT-4o (OpenAI)", "pricing_prompt": "0.0025", "pricing_completion": "0.01", "context_length": 128000},
        {"id": "openai/gpt-4o-mini", "name": "GPT-4o Mini (OpenAI)", "pricing_prompt": "0.00015", "pricing_completion": "0.0006", "context_length": 128000},
        {"id": "anthropic/claude-sonnet-4", "name": "Claude Sonnet 4 (Anthropic)", "pricing_prompt": "0.003", "pricing_completion": "0.015", "context_length": 200000},
        {"id": "anthropic/claude-3.5-sonnet", "name": "Claude 3.5 Sonnet (Anthropic)", "pricing_prompt": "0.003", "pricing_completion": "0.015", "context_length": 200000},
        {"id": "google/gemini-2.5-flash-preview", "name": "Gemini 2.5 Flash (Google)", "pricing_prompt": "0.00015", "pricing_completion": "0.001", "context_length": 1000000},
        {"id": "google/gemini-2.0-flash-001", "name": "Gemini 2.0 Flash (Google)", "pricing_prompt": "0.0001", "pricing_completion": "0.0004", "context_length": 1000000},
        {"id": "meta-llama/llama-4-maverick", "name": "Llama 4 Maverick (Meta)", "pricing_prompt": "0.0002", "pricing_completion": "0.0008", "context_length": 131072},
        {"id": "qwen/qwen2.5-vl-72b-instruct", "name": "Qwen 2.5 VL 72B (Alibaba)", "pricing_prompt": "0.0004", "pricing_completion": "0.0016", "context_length": 32768},
    ]

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

# ===== WORKFLOWS =====

@api_router.get("/workflows")
async def get_workflows():
    """Get all approval workflows"""
    workflows = await db.workflows.find().to_list(100)
    return [{k: v for k, v in w.items() if k != '_id'} for w in workflows]

@api_router.post("/workflows")
async def create_workflow(workflow_create: WorkflowCreate):
    """Create a new approval workflow"""
    stages = []
    for i, stage_data in enumerate(workflow_create.stages):
        stages.append(ApprovalStage(
            stage_number=i + 1,
            stage_name=stage_data.get('stage_name', f'Stufe {i + 1}'),
            required_role=UserRole(stage_data.get('required_role', 'manager'))
        ))
    
    workflow = ApprovalWorkflow(
        name=workflow_create.name,
        description=workflow_create.description,
        stages=stages,
        min_amount=workflow_create.min_amount,
        max_amount=workflow_create.max_amount
    )
    
    await db.workflows.insert_one(workflow.model_dump())
    return workflow.model_dump()

@api_router.put("/workflows/{workflow_id}")
async def update_workflow(workflow_id: str, active: bool):
    """Enable/disable a workflow"""
    result = await db.workflows.update_one(
        {"id": workflow_id},
        {"$set": {"active": active}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Workflow nicht gefunden")
    return {"message": "Workflow aktualisiert"}

@api_router.delete("/workflows/{workflow_id}")
async def delete_workflow(workflow_id: str):
    """Delete a workflow"""
    result = await db.workflows.delete_one({"id": workflow_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Workflow nicht gefunden")
    return {"message": "Workflow gelöscht"}

@api_router.get("/invoices/{invoice_id}/workflow")
async def get_invoice_workflow_status(invoice_id: str):
    """Get workflow status for an invoice"""
    workflow = await get_invoice_workflow(invoice_id)
    if not workflow:
        return {"has_workflow": False}
    return {"has_workflow": True, "workflow": workflow}

@api_router.post("/invoices/{invoice_id}/workflow/approve")
async def approve_workflow_stage(invoice_id: str, approval: ApprovalRequest, background_tasks: BackgroundTasks):
    """Approve current workflow stage"""
    invoice = await db.invoices.find_one({"id": invoice_id})
    if not invoice:
        raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")
    
    workflow = await get_invoice_workflow(invoice_id)
    if not workflow:
        # No multi-stage workflow, use simple approval
        return await approve_invoice(invoice_id, approval)
    
    if workflow.get('completed'):
        raise HTTPException(status_code=400, detail="Workflow bereits abgeschlossen")
    
    # Get current user info
    approver_id = approval.approved_by
    user = await db.users.find_one({"name": approver_id})
    approver_name = user['name'] if user else approval.approved_by
    
    # Advance workflow
    workflow_complete = await advance_workflow_stage(invoice_id, approver_id, approver_name, approval.comment)
    
    await log_audit(invoice_id, "workflow_stage_approved", approver_name, {
        "stage": workflow.get('current_stage', 0) + 1,
        "comment": approval.comment
    })
    
    if workflow_complete:
        # All stages approved, update invoice status
        await db.invoices.update_one(
            {"id": invoice_id},
            {"$set": {
                "status": InvoiceStatus.APPROVED.value,
                "approved_by": approver_name,
                "approved_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }}
        )
        await log_audit(invoice_id, "approved", approver_name, {"workflow_complete": True})
        await trigger_webhooks("invoice.approved", invoice)
    
    updated_workflow = await get_invoice_workflow(invoice_id)
    return {
        "workflow_complete": workflow_complete,
        "workflow": updated_workflow
    }

# ===== EMAIL SETTINGS =====

@api_router.get("/email-settings")
async def get_email_settings_route():
    """Get email settings"""
    settings = await get_email_settings()
    # Don't expose password in response
    return {
        "smtp_host": settings.smtp_host,
        "smtp_port": settings.smtp_port,
        "smtp_user": settings.smtp_user,
        "from_email": settings.from_email,
        "from_name": settings.from_name,
        "enabled": settings.enabled,
        "has_password": bool(settings.smtp_password)
    }

@api_router.put("/email-settings")
async def update_email_settings_route(
    smtp_host: str = "",
    smtp_port: int = 587,
    smtp_user: str = "",
    smtp_password: Optional[str] = None,
    from_email: str = "noreply@candis-kopie.de",
    from_name: str = "Candis-Kopie",
    enabled: bool = False
):
    """Update email settings"""
    # Get existing settings
    existing = await get_email_settings()
    
    # Keep existing password if not provided
    password = smtp_password if smtp_password is not None else existing.smtp_password
    
    settings = EmailSettings(
        smtp_host=smtp_host,
        smtp_port=smtp_port,
        smtp_user=smtp_user,
        smtp_password=password,
        from_email=from_email,
        from_name=from_name,
        enabled=enabled
    )
    
    await db.email_settings.replace_one(
        {"id": "email_settings"},
        {"id": "email_settings", **settings.model_dump()},
        upsert=True
    )
    
    return {"message": "E-Mail-Einstellungen aktualisiert"}

@api_router.post("/email-settings/test")
async def test_email_settings(test_email: str):
    """Send a test email"""
    success = await send_email(
        test_email,
        "Test Empfänger",
        "Candis-Kopie - Test E-Mail",
        "<h1>Test erfolgreich!</h1><p>E-Mail-Konfiguration funktioniert.</p>",
        "Test erfolgreich! E-Mail-Konfiguration funktioniert."
    )
    
    if success:
        return {"message": "Test-E-Mail gesendet"}
    else:
        return {"message": "E-Mail konnte nicht gesendet werden (siehe Logs)"}

@api_router.get("/email-notifications")
async def get_email_notifications(limit: int = 50):
    """Get email notification history"""
    notifications = await db.email_notifications.find().sort("created_at", -1).limit(limit).to_list(limit)
    return [{k: v for k, v in n.items() if k != '_id'} for n in notifications]

@api_router.post("/reminders/{reminder_id}/send-email")
async def send_reminder_email_route(reminder_id: str, background_tasks: BackgroundTasks):
    """Send reminder email for a specific reminder"""
    reminder = await db.reminders.find_one({"id": reminder_id})
    if not reminder:
        raise HTTPException(status_code=404, detail="Erinnerung nicht gefunden")
    
    invoice = await db.invoices.find_one({"id": reminder['invoice_id']})
    if not invoice:
        raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")
    
    # Find users to notify (e.g., managers for approval reminders)
    users = await db.users.find({"role": {"$in": ["admin", "manager"]}, "active": True}).to_list(10)
    
    for user in users:
        await send_reminder_email(
            invoice,
            user['email'],
            user['name'],
            reminder.get('message', 'Bitte überprüfen Sie diese Rechnung.')
        )
    
    # Mark reminder as sent
    await db.reminders.update_one(
        {"id": reminder_id},
        {"$set": {"sent": True, "sent_at": datetime.utcnow()}}
    )
    
    return {"message": f"Erinnerung an {len(users)} Benutzer gesendet"}

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ===================== IMAP EMAIL IMPORT =====================

async def get_imap_settings() -> ImapSettings:
    """Get IMAP settings from database"""
    doc = await db.imap_settings.find_one({"id": "imap_settings"})
    if doc:
        return ImapSettings(**{k: v for k, v in doc.items() if k not in ('_id', 'id')})
    return ImapSettings()

def _fetch_emails_from_imap(host: str, port: int, user: str, password: str, folder: str, ssl: bool, limit: int = 50) -> List[dict]:
    """Blocking IMAP fetch – runs in thread pool"""
    from imap_tools import MailBox, MailBoxTls, AND
    result = []
    try:
        mb_class = MailBox if ssl else MailBoxTls
        with MailBox(host, port=port).login(user, password, folder) as mailbox:
            msgs = list(mailbox.fetch(limit=limit, reverse=True))
            for msg in msgs:
                attachments = []
                for att in msg.attachments:
                    ct = att.content_type.lower()
                    if any(ct.startswith(t) for t in ['application/pdf', 'image/jpeg', 'image/png', 'image/tiff']):
                        attachments.append({
                            "filename": att.filename or "anhang.pdf",
                            "content_type": att.content_type,
                            "size_bytes": len(att.payload),
                            "content_base64": base64.b64encode(att.payload).decode()
                        })
                if attachments:
                    result.append({
                        "uid": str(msg.uid),
                        "message_id": str(msg.uid),
                        "subject": msg.subject or "(Kein Betreff)",
                        "sender": msg.from_ or "",
                        "date": msg.date or datetime.utcnow(),
                        "attachments": attachments
                    })
    except Exception as e:
        raise Exception(f"IMAP-Verbindungsfehler: {str(e)}")
    return result

async def run_ai_classification_for_email(item_id: str):
    """Run AI classification on first PDF attachment of an email"""
    item_doc = await db.email_inbox.find_one({"id": item_id})
    if not item_doc:
        return
    attachments = item_doc.get("attachments", [])
    if not attachments:
        await db.email_inbox.update_one({"id": item_id}, {"$set": {"ai_status": "not_invoice", "ai_confidence": 0.0, "ai_checked_at": datetime.utcnow()}})
        return

    await db.email_inbox.update_one({"id": item_id}, {"$set": {"ai_status": "checking"}})

    settings = await get_settings()
    if not settings.ai_settings.api_key:
        await db.email_inbox.update_one({"id": item_id}, {"$set": {"ai_status": "pending", "ai_checked_at": datetime.utcnow()}})
        return

    # Use first PDF attachment
    att = next((a for a in attachments if 'pdf' in a.get('content_type','').lower() or a['filename'].lower().endswith('.pdf')), attachments[0])
    raw_b64 = att.get("content_base64", "")
    
    # Convert PDF page 1 to image for AI
    image_contents = []
    try:
        import fitz
        pdf_bytes = base64.b64decode(raw_b64)
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        page = doc.load_page(0)
        mat = fitz.Matrix(1.5, 1.5)
        pix = page.get_pixmap(matrix=mat)
        img_b64 = base64.b64encode(pix.tobytes("png")).decode()
        doc.close()
        image_contents = [{"type": "image_url", "image_url": {"url": f"data:image/png;base64,{img_b64}"}}]
    except Exception:
        # Fallback: use raw base64 as image
        image_contents = [{"type": "image_url", "image_url": {"url": f"data:application/pdf;base64,{raw_b64}"}}]

    prompt = """Analysiere dieses Dokument und bestimme ob es sich um eine EINGANGSRECHNUNG handelt.
Antworte NUR mit diesem JSON (keine weiteren Zeichen):
{
  "is_invoice": true,
  "confidence": 0.95,
  "document_type": "Eingangsrechnung",
  "vendor_name": "Lieferantenname",
  "invoice_number": "Rechnungsnummer falls erkannt",
  "gross_amount": 0.00,
  "reason": "Kurze Begründung auf Deutsch"
}
Mögliche Dokumenttypen: Eingangsrechnung, Lieferschein, Angebot, Auftragsbestätigung, Mahnung, Sonstiges"""

    try:
        async with httpx.AsyncClient() as client_http:
            response = await client_http.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={"Authorization": f"Bearer {settings.ai_settings.api_key}", "Content-Type": "application/json"},
                json={
                    "model": settings.ai_settings.model or "anthropic/claude-3-haiku",
                    "messages": [{"role": "user", "content": [{"type": "text", "text": prompt}] + image_contents}],
                    "max_tokens": 300
                },
                timeout=30.0
            )
        result = response.json()
        content = result["choices"][0]["message"]["content"].strip()
        # Extract JSON
        if "```" in content:
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        ai_data = json.loads(content)
        confidence = float(ai_data.get("confidence", 0.5))
        is_inv = bool(ai_data.get("is_invoice", False))
        if is_inv and confidence >= 0.8:
            status = "invoice"
        elif confidence < 0.6:
            status = "not_invoice"
        else:
            status = "uncertain"
        await db.email_inbox.update_one(
            {"id": item_id},
            {"$set": {
                "ai_status": status,
                "ai_confidence": confidence,
                "ai_details": ai_data,
                "ai_checked_at": datetime.utcnow()
            }}
        )
    except Exception as e:
        logger.error(f"AI classification error for email {item_id}: {e}")
        await db.email_inbox.update_one({"id": item_id}, {"$set": {"ai_status": "uncertain", "ai_confidence": 0.5, "ai_checked_at": datetime.utcnow()}})

async def poll_imap_and_store():
    """Fetch new emails from IMAP and store in DB"""
    imap_cfg = await get_imap_settings()
    if not imap_cfg.imap_enabled or not imap_cfg.imap_host:
        return 0

    loop = asyncio.get_event_loop()
    try:
        emails = await loop.run_in_executor(
            _thread_pool,
            _fetch_emails_from_imap,
            imap_cfg.imap_host, imap_cfg.imap_port,
            imap_cfg.imap_user, imap_cfg.imap_password,
            imap_cfg.imap_folder, imap_cfg.imap_ssl, 30
        )
    except Exception as e:
        logger.error(f"IMAP poll failed: {e}")
        return 0

    new_count = 0
    for email_data in emails:
        existing = await db.email_inbox.find_one({"uid": email_data["uid"]})
        if not existing:
            item = EmailInboxItem(**email_data)
            await db.email_inbox.insert_one(item.model_dump())
            new_count += 1
            if imap_cfg.auto_import_mode in ["semi", "auto"]:
                asyncio.create_task(run_ai_classification_for_email(item.id))

    logger.info(f"IMAP poll: {new_count} neue Mails gespeichert")
    return new_count

@api_router.get("/imap-settings")
async def get_imap_settings_route(current_user: dict = Depends(require_admin())):
    cfg = await get_imap_settings()
    return {
        "imap_host": cfg.imap_host,
        "imap_port": cfg.imap_port,
        "imap_user": cfg.imap_user,
        "imap_folder": cfg.imap_folder,
        "imap_ssl": cfg.imap_ssl,
        "imap_enabled": cfg.imap_enabled,
        "auto_import_mode": cfg.auto_import_mode,
        "poll_interval_minutes": cfg.poll_interval_minutes,
        "ai_confidence_threshold": cfg.ai_confidence_threshold,
        "has_password": bool(cfg.imap_password)
    }

@api_router.put("/imap-settings")
async def update_imap_settings_route(
    imap_host: str = "",
    imap_port: int = 993,
    imap_user: str = "",
    imap_password: Optional[str] = None,
    imap_folder: str = "INBOX",
    imap_ssl: bool = True,
    imap_enabled: bool = False,
    auto_import_mode: str = "semi",
    poll_interval_minutes: int = 15,
    ai_confidence_threshold: float = 0.85,
    current_user: dict = Depends(require_admin())
):
    existing = await get_imap_settings()
    password = imap_password if imap_password is not None else existing.imap_password
    cfg = ImapSettings(
        imap_host=imap_host, imap_port=imap_port, imap_user=imap_user,
        imap_password=password, imap_folder=imap_folder, imap_ssl=imap_ssl,
        imap_enabled=imap_enabled, auto_import_mode=auto_import_mode,
        poll_interval_minutes=poll_interval_minutes,
        ai_confidence_threshold=ai_confidence_threshold
    )
    await db.imap_settings.replace_one({"id": "imap_settings"}, {"id": "imap_settings", **cfg.model_dump()}, upsert=True)

    # Reschedule the polling job with new interval
    global _imap_scheduler
    if _imap_scheduler and _imap_scheduler.running:
        try:
            _imap_scheduler.reschedule_job("imap_poll", trigger="interval", minutes=poll_interval_minutes)
        except Exception:
            pass

    return {"message": "IMAP-Einstellungen gespeichert"}

@api_router.post("/imap-settings/test")
async def test_imap_connection(current_user: dict = Depends(require_admin())):
    """Test IMAP connection with current settings"""
    cfg = await get_imap_settings()
    if not cfg.imap_host or not cfg.imap_user:
        raise HTTPException(status_code=400, detail="IMAP-Einstellungen unvollständig")
    loop = asyncio.get_event_loop()
    try:
        def _test():
            from imap_tools import MailBox
            with MailBox(cfg.imap_host, port=cfg.imap_port).login(cfg.imap_user, cfg.imap_password, cfg.imap_folder) as mb:
                count = mb.folder.status(cfg.imap_folder).get('MESSAGES', 0)
                return count
        count = await loop.run_in_executor(_thread_pool, _test)
        return {"success": True, "message": f"Verbindung erfolgreich. {count} E-Mails im Ordner '{cfg.imap_folder}'."}
    except Exception as e:
        return {"success": False, "message": f"Verbindungsfehler: {str(e)}"}

@api_router.get("/email-inbox")
async def get_email_inbox(
    limit: int = 50,
    status_filter: Optional[str] = None,
    current_user: dict = Depends(require_accountant_or_above())
):
    """Get emails from inbox cache"""
    query: dict = {}
    if status_filter and status_filter != "all":
        query["ai_status"] = status_filter
    items = await db.email_inbox.find(query).sort("date", -1).limit(limit).to_list(limit)
    result = []
    for item in items:
        item.pop("_id", None)
        # Don't send attachment content in list view
        for att in item.get("attachments", []):
            att.pop("content_base64", None)
        result.append(item)
    return result

@api_router.post("/email-inbox/poll")
async def manual_poll_inbox(current_user: dict = Depends(require_accountant_or_above())):
    """Manually trigger IMAP poll"""
    new_count = await poll_imap_and_store()
    return {"message": f"{new_count} neue E-Mail(s) abgerufen", "new_count": new_count}

@api_router.post("/email-inbox/{item_id}/ai-check")
async def trigger_ai_check(item_id: str, current_user: dict = Depends(require_accountant_or_above())):
    """Trigger AI classification for a specific email"""
    item = await db.email_inbox.find_one({"id": item_id})
    if not item:
        raise HTTPException(status_code=404, detail="E-Mail nicht gefunden")
    asyncio.create_task(run_ai_classification_for_email(item_id))
    return {"message": "KI-Prüfung gestartet"}

@api_router.post("/email-inbox/{item_id}/import")
async def import_email_attachment(item_id: str, attachment_index: int = 0, current_user: dict = Depends(require_accountant_or_above())):
    """Import email attachment as invoice via OCR pipeline"""
    item = await db.email_inbox.find_one({"id": item_id})
    if not item:
        raise HTTPException(status_code=404, detail="E-Mail nicht gefunden")
    if item.get("imported"):
        raise HTTPException(status_code=400, detail="Anhang wurde bereits importiert")

    attachments = item.get("attachments", [])
    if not attachments or attachment_index >= len(attachments):
        raise HTTPException(status_code=400, detail="Kein Anhang vorhanden")

    # Re-fetch with content_base64 (stored in DB)
    att = attachments[attachment_index]
    raw_b64 = att.get("content_base64")
    if not raw_b64:
        # Fetch full doc to get base64 content
        full_doc = await db.email_inbox.find_one({"id": item_id})
        att = full_doc.get("attachments", [])[attachment_index]
        raw_b64 = att.get("content_base64", "")

    if not raw_b64:
        raise HTTPException(status_code=400, detail="Anhangsdaten nicht verfügbar")

    content_type = att.get("content_type", "application/pdf")
    image_base64 = f"data:{content_type};base64,{raw_b64}"

    try:
        invoice_data = await extract_invoice_with_ai(image_base64)
        # Convert PDF first page to preview image
        stored_image = image_base64
        if 'pdf' in content_type.lower() or _is_pdf_base64(raw_b64):
            try:
                pdf_bytes = base64.b64decode(raw_b64)
                doc = fitz.open(stream=pdf_bytes, filetype="pdf")
                page = doc.load_page(0)
                pix = page.get_pixmap(matrix=fitz.Matrix(2.0, 2.0))
                stored_image = f"data:image/png;base64,{base64.b64encode(pix.tobytes('png')).decode()}"
                doc.close()
            except Exception:
                pass

        invoice = Invoice(data=invoice_data, image_base64=stored_image, status=InvoiceStatus.PENDING)
        invoice.search_text = generate_search_text(invoice_data.model_dump())
        invoice.gobd_hash = generate_gobd_hash(invoice.model_dump())
        await db.invoices.insert_one(invoice.model_dump())
        await log_audit(invoice.id, "created", current_user.get("email", "system"), {"source": "email_import", "email_subject": item.get("subject", "")})

        await db.email_inbox.update_one(
            {"id": item_id},
            {"$set": {"imported": True, "invoice_id": invoice.id, "imported_at": datetime.utcnow()}}
        )
        return {"message": "Rechnung erfolgreich importiert", "invoice_id": invoice.id}
    except Exception as e:
        logger.error(f"Email import error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/email-inbox/{item_id}")
async def delete_inbox_item(item_id: str, current_user: dict = Depends(require_accountant_or_above())):
    """Remove email from inbox cache"""
    await db.email_inbox.delete_one({"id": item_id})
    return {"message": "E-Mail aus Posteingangsliste entfernt"}

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

    # Start IMAP scheduler
    global _imap_scheduler
    imap_cfg = await get_imap_settings()
    interval = max(1, imap_cfg.poll_interval_minutes)
    _imap_scheduler = AsyncIOScheduler()
    _imap_scheduler.add_job(
        poll_imap_and_store,
        trigger="interval",
        minutes=interval,
        id="imap_poll",
        replace_existing=True,
        misfire_grace_time=60
    )
    _imap_scheduler.start()
    logger.info(f"IMAP scheduler started (interval: {interval} min)")

# ===================== DATEV UNTERNEHMEN ONLINE INTEGRATION =====================

@api_router.get("/settings/datev")
async def get_datev_config():
    """Get DATEV configuration"""
    config = await db.datev_config.find_one({"id": "datev_config"})
    if not config:
        config = DatevConfig().model_dump()
    # Don't expose sensitive fields
    config.pop('_id', None)
    config.pop('oauth_token', None)
    config.pop('oauth_refresh_token', None)
    config['client_secret_set'] = bool(config.get('client_secret', ''))
    config['client_secret'] = '••••••••' if config.get('client_secret') else ''
    return config

@api_router.put("/settings/datev")
async def update_datev_config(config: dict, current_user: dict = Depends(require_admin())):
    """Update DATEV configuration (Admin only)"""
    existing = await db.datev_config.find_one({"id": "datev_config"})
    if not existing:
        existing = DatevConfig().model_dump()
    
    for key, value in config.items():
        if key in ['client_secret'] and value == '••••••••':
            continue  # Don't overwrite masked secrets
        if key not in ['_id', 'id']:
            existing[key] = value
    
    existing['updated_at'] = datetime.utcnow()
    await db.datev_config.update_one(
        {"id": "datev_config"}, {"$set": existing}, upsert=True
    )
    return {"message": "DATEV-Konfiguration gespeichert"}

@api_router.post("/datev/test-connection")
async def test_datev_connection():
    """Test DATEV connection (simulation mode always succeeds)"""
    config = await db.datev_config.find_one({"id": "datev_config"})
    if not config:
        return {"success": False, "message": "Keine DATEV-Konfiguration vorhanden"}
    
    if config.get('simulation_mode', True):
        return {
            "success": True,
            "mode": "simulation",
            "message": "Simulationsmodus: Verbindung erfolgreich simuliert. Für echte Verbindung deaktivieren Sie den Simulationsmodus und hinterlegen Sie gültige DATEV-Credentials."
        }
    
    # Real connection test would go here
    if not config.get('client_id') or not config.get('client_secret'):
        return {"success": False, "message": "Client-ID und Client-Secret erforderlich"}
    
    # TODO: Implement real DATEVconnect Online OAuth flow
    return {"success": False, "message": "Echte DATEV-Verbindung noch nicht implementiert. Bitte Simulationsmodus nutzen."}

@api_router.post("/datev/upload/{invoice_id}")
async def upload_to_datev(invoice_id: str, current_user: dict = Depends(require_accountant_or_above())):
    """Upload an invoice to DATEV (Admin/Manager/Accountant)"""
    invoice = await db.invoices.find_one({"id": invoice_id})
    if not invoice:
        raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")
    
    config = await db.datev_config.find_one({"id": "datev_config"})
    if not config:
        config = DatevConfig().model_dump()
    
    if not config.get('enabled', False):
        raise HTTPException(status_code=400, detail="DATEV-Integration ist nicht aktiviert")
    
    # Check if already uploaded
    existing_upload = await db.datev_uploads.find_one({
        "invoice_id": invoice_id, "status": {"$in": ["success", "simulated"]}
    })
    if existing_upload:
        raise HTTPException(status_code=400, detail="Rechnung wurde bereits an DATEV übermittelt")
    
    # Generate DATEV XML for this invoice
    xml_content = generate_datev_xml([invoice])
    
    inv_number = invoice.get('data', {}).get('invoice_number', invoice.get('number', ''))
    
    if config.get('simulation_mode', True):
        # Simulation mode - log and mark as simulated
        upload_log = DatevUploadLog(
            invoice_id=invoice_id,
            invoice_number=inv_number,
            status=DatevUploadStatus.SIMULATED,
            datev_document_id=f"SIM-DATEV-{uuid.uuid4().hex[:12].upper()}",
            xml_content=xml_content,
            completed_at=datetime.utcnow()
        )
        await db.datev_uploads.insert_one(upload_log.model_dump())
        
        # Update invoice with DATEV status
        await db.invoices.update_one(
            {"id": invoice_id},
            {"$set": {"datev_status": "simulated", "datev_upload_id": upload_log.id, "datev_uploaded_at": datetime.utcnow()}}
        )
        
        await log_audit(invoice_id, "datev_uploaded", "system", {"mode": "simulation", "document_id": upload_log.datev_document_id})
        
        return {
            "success": True,
            "mode": "simulation",
            "document_id": upload_log.datev_document_id,
            "message": f"Rechnung {inv_number} erfolgreich an DATEV übermittelt (Simulation)"
        }
    else:
        # Real DATEV upload would go here
        # TODO: Implement real DATEVconnect Online API call
        raise HTTPException(status_code=501, detail="Echte DATEV-Übertragung noch nicht implementiert")

@api_router.get("/datev/status/{invoice_id}")
async def get_datev_status(invoice_id: str):
    """Get DATEV upload status for an invoice"""
    upload = await db.datev_uploads.find_one(
        {"invoice_id": invoice_id},
        sort=[("uploaded_at", -1)]
    )
    if not upload:
        return {"status": "not_uploaded", "message": "Noch nicht an DATEV übermittelt"}
    upload.pop('_id', None)
    upload.pop('xml_content', None)
    return upload

@api_router.get("/datev/uploads")
async def list_datev_uploads(limit: int = 50):
    """List recent DATEV uploads"""
    uploads = await db.datev_uploads.find(
        {}, {"xml_content": 0}
    ).sort("uploaded_at", -1).limit(limit).to_list(limit)
    for u in uploads:
        u.pop('_id', None)
    return uploads

# ===================== BANKING / PAYMENT INTEGRATION =====================

@api_router.get("/settings/banking")
async def get_banking_config():
    """Get banking configuration"""
    config = await db.banking_config.find_one({"id": "banking_config"})
    if not config:
        config = BankingConfig().model_dump()
    config.pop('_id', None)
    config['api_secret_set'] = bool(config.get('api_secret', ''))
    config['api_secret'] = '••••••••' if config.get('api_secret') else ''
    config['api_key'] = '••••••••' if config.get('api_key') else ''
    return config

@api_router.put("/settings/banking")
async def update_banking_config(config: dict, current_user: dict = Depends(require_admin())):
    """Update banking configuration (Admin only)"""
    existing = await db.banking_config.find_one({"id": "banking_config"})
    if not existing:
        existing = BankingConfig().model_dump()
    
    for key, value in config.items():
        if key in ['api_key', 'api_secret'] and value == '••••••••':
            continue
        if key not in ['_id', 'id']:
            existing[key] = value
    
    existing['updated_at'] = datetime.utcnow()
    await db.banking_config.update_one(
        {"id": "banking_config"}, {"$set": existing}, upsert=True
    )
    return {"message": "Banking-Konfiguration gespeichert"}

@api_router.post("/payments/initiate/{invoice_id}")
async def initiate_payment(invoice_id: str, background_tasks: BackgroundTasks, current_user: dict = Depends(require_accountant_or_above())):
    """Initiate payment (Admin/Manager/Accountant)"""
    invoice = await db.invoices.find_one({"id": invoice_id})
    if not invoice:
        raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")
    
    if invoice['status'] not in ['approved', 'archived']:
        raise HTTPException(status_code=400, detail="Nur genehmigte oder archivierte Rechnungen können bezahlt werden")
    
    banking_config = await db.banking_config.find_one({"id": "banking_config"})
    if not banking_config:
        banking_config = BankingConfig().model_dump()
    
    if not banking_config.get('enabled', False):
        raise HTTPException(status_code=400, detail="Banking-Integration ist nicht aktiviert")
    
    # Check if already paid
    existing_payment = await db.payments.find_one({
        "invoice_id": invoice_id, "status": {"$in": ["completed", "simulated", "processing"]}
    })
    if existing_payment:
        raise HTTPException(status_code=400, detail="Zahlung wurde bereits initiiert")
    
    data = invoice.get('data', {})
    amount = data.get('gross_amount', 0) or invoice.get('amount', 0)
    inv_number = data.get('invoice_number', invoice.get('number', ''))
    creditor_name = data.get('vendor', {}).get('name', '') or invoice.get('vendor', 'Unbekannt')
    creditor_iban = data.get('vendor', {}).get('iban', '') or data.get('payment', {}).get('iban', '')
    
    # Generate SEPA XML for single invoice
    settings_doc = await db.settings.find_one({"id": "global_settings"})
    settings = Settings(**settings_doc) if settings_doc else Settings()
    sepa_xml = generate_sepa_xml([invoice], settings)
    
    if banking_config.get('simulation_mode', True):
        payment_log = PaymentLog(
            invoice_id=invoice_id,
            invoice_number=inv_number,
            amount=amount,
            creditor_name=creditor_name,
            creditor_iban=creditor_iban or "DE00000000000000000000",
            reference=f"RE {inv_number}",
            status=PaymentStatus.SIMULATED,
            provider=BankingProvider.SIMULATION,
            provider_transaction_id=f"SIM-PAY-{uuid.uuid4().hex[:12].upper()}",
            sepa_xml=sepa_xml,
            initiated_by="admin",
            completed_at=datetime.utcnow()
        )
        await db.payments.insert_one(payment_log.model_dump())
        
        # Update invoice payment status
        await db.invoices.update_one(
            {"id": invoice_id},
            {"$set": {"payment_status": "simulated", "payment_id": payment_log.id, "paid_at": datetime.utcnow()}}
        )
        
        await log_audit(invoice_id, "payment_initiated", "system", {
            "mode": "simulation",
            "amount": amount,
            "transaction_id": payment_log.provider_transaction_id
        })
        
        return {
            "success": True,
            "mode": "simulation",
            "payment_id": payment_log.id,
            "transaction_id": payment_log.provider_transaction_id,
            "amount": amount,
            "message": f"Zahlung über {amount:.2f} EUR erfolgreich simuliert"
        }
    else:
        # Real payment would go here via FinAPI/Tink/EBICS
        raise HTTPException(status_code=501, detail="Echte Banküberweisung noch nicht implementiert")

@api_router.get("/payments/status/{invoice_id}")
async def get_payment_status(invoice_id: str):
    """Get payment status for an invoice"""
    payment = await db.payments.find_one(
        {"invoice_id": invoice_id},
        sort=[("initiated_at", -1)]
    )
    if not payment:
        return {"status": "not_paid", "message": "Keine Zahlung vorhanden"}
    payment.pop('_id', None)
    payment.pop('sepa_xml', None)
    return payment

@api_router.get("/payments")
async def list_payments(limit: int = 50):
    """List all payments"""
    payments = await db.payments.find(
        {}, {"sepa_xml": 0}
    ).sort("initiated_at", -1).limit(limit).to_list(limit)
    for p in payments:
        p.pop('_id', None)
    return payments

# Include the router in the main app
app.include_router(api_router)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
