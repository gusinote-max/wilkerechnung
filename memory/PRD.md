# Candis-Kopie – PRD (Product Requirements Document)

## Ursprüngliche Problembeschreibung
Der Benutzer baut eine "Candis-Kopie" (Candis-Klon), ein KI-gestütztes Rechnungsverwaltungssystem.

## Kernfunktionen (Anforderungen)
- OCR-Datenextraktion aus Rechnungen
- Mehrstufige Genehmigungs-Workflows
- GoBD-konforme Archivierung
- DATEV-Export
- E-Rechnungen (ZUGFeRD/XRechnung)
- SEPA-XML-Exporte
- Kontenrahmen-Zuordnung (SKR03/SKR04/SKR51)
- Rollenbasierte Zugriffskontrolle (RBAC)

## Nutzer-Personas
- **Admin**: Vollzugriff, Nutzerverwaltung, Einstellungen
- **Manager**: Genehmigungen, Archivierung
- **Buchhalter**: Rechnungen hochladen, KI-Analyse, DATEV-Export
- **Betrachter**: Nur Lesezugriff

## Technische Architektur
```
/app
├── backend/
│   ├── .env (MONGO_URL, JWT_SECRET, OPENROUTER_API_KEY)
│   ├── requirements.txt
│   └── server.py (FastAPI Monolith, ~2942 Zeilen)
├── frontend/
│   ├── app.json
│   ├── public/ (manifest.json, sw.js, icons – PWA)
│   ├── app/
│   │   ├── (tabs)/ index.tsx, settings.tsx, _layout.tsx
│   │   ├── invoice/ [id].tsx
│   │   ├── _layout.tsx, login.tsx, +html.tsx
│   └── src/
│       ├── components/ (invoice/, settings/, shared/)
│       ├── services/api.ts
│       ├── store/authStore.ts
│       └── utils/ (formatters.ts, roleHelpers.ts)
├── deploy/ (Alpine Linux Skripte)
└── memory/ (PRD.md, test_credentials.md)
```

---

## CHANGELOG

### 2026-03-30 – P0 Features: Kostenstellen & Kontierungspflicht
- **Kostenstellen CRUD**: Backend: `CostCenterUpdate` Model, `GET /api/cost-centers?include_inactive=true`, `PUT /api/cost-centers/{id}` akzeptiert JSON-Body, Auth Guards (require_admin) auf POST/PUT/DELETE. Frontend: `KostenstellenSection.tsx` in `settings.tsx` eingebunden, `apiService.updateCostCenter()` hinzugefügt.
- **Kontierungspflicht**: `POST /api/invoices/{id}/approve` gibt 422 zurück wenn kein `account_number` gesetzt. Frontend `InvoiceActions.tsx` zeigt Warnbanner und deaktivierten Button.
- **Getestet**: 100% (17/17 Backend + 4/4 Frontend flows)

### 2026-03-30 – E-Mail IMAP Rechnungsimport (Neues Feature)
- **Backend**: `ImapSettings` + `EmailInboxItem` Modelle, APScheduler für automatisches Polling
- **Endpoints**: `/api/imap-settings`, `/api/email-inbox`, `/api/email-inbox/poll`, `/api/email-inbox/{id}/ai-check`, `/api/email-inbox/{id}/import`
- **Frontend**: Neuer Tab „E-Mail" (`email-inbox.tsx`), `ImapSettingsSection` in Einstellungen
- **Import-Modi**: Manuell / Halbautomatisch (KI schlägt vor) / Automatisch
- **KI-Prüfung**: OpenRouter analysiert Anhang und klassifiziert als Eingangsrechnung/Lieferschein/Sonstiges

### 2026-03-29 – SKR51 KFZ-Branche Korrektur (P0 Fix)
- **Problem**: SKR51 enthielt 203 falsche NGO/Non-Profit-Konten
- **Lösung**: `server.py` SKR51_ACCOUNTS ersetzt durch 297 korrekte KFZ-Handel/Kfz-Handwerk-Konten
- **MongoDB**: Alte NGO-Konten aus Datenbank gelöscht, neue KFZ-Konten werden bei nächster API-Anfrage automatisch eingesät
- **Verifiziert**: `GET /api/accounts?kontenrahmen=SKR51` liefert 297 KFZ-Konten (Hebebühnen, Neufahrzeuge, Floorplan, etc.)

### Frühere Sessions – Abgeschlossene Features
- ✅ Frontend Refactoring: settings.tsx (2150→312 Zeilen), invoice/[id].tsx (1616→727 Zeilen)
- ✅ PWA-Implementierung: manifest.json, sw.js, PWA-Meta-Tags
- ✅ Zustand `import.meta` Bug Fix (Web Blank Screen)
- ✅ SKR51 Frontend-Toggle in GeneralSettingsSection.tsx
- ✅ RBAC: Viewer kann keine Rechnungen hochladen
- ✅ OCR via OpenRouter KI
- ✅ DATEV-Export (simuliert)
- ✅ SEPA-Export (simuliert)
- ✅ Mehrstufige Approval-Workflows
- ✅ GoBD-konforme Archivierung
- ✅ Alpine Linux Deployment-Skripte

---

## ROADMAP / Offene Aufgaben

### P1 (Hoch – nächste Sitzung)
- [ ] Automatische KI-basierte Dokumentenklassifizierung (Rechnung, Lieferschein, Angebot)
- [ ] Abwesenheits- und Vertretungsregelung für Workflows

### P2 (Mittel)
- [ ] Backend Refactoring: server.py (~2942 Zeilen) in /routes/, /models/, /services/ aufteilen
- [ ] Auslagen und Reisekosten (Bewirtungsbelege, Kilometerpauschale)
- [ ] Vertrags- und Fristenmanagement
- [ ] Single Sign-On (SSO)

### P3 (Niedrig / Zukunft)
- [ ] Echter DATEV API-Anschluss (DATEVconnect Online)
- [ ] Live Banking API (FinAPI/Tink/EBICS)

---

## Bekannte Einschränkungen / Mocks
- DATEV-Export: **SIMULIERT** (kein echter API-Anschluss)
- SEPA-Banking: **SIMULIERT** (kein echter API-Anschluss)
- Zustand `import.meta`: Manuell gepatcht in `node_modules/zustand/esm/middleware.mjs` – geht bei `yarn install` verloren!
