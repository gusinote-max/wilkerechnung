# Candis-Kopie – Docker Deployment (Hostinger VPS)

## Systemvoraussetzungen

| Ressource | Minimum | Empfohlen |
|-----------|---------|----------|
| RAM       | 2 GB    | **4 GB** |
| CPU       | 1 vCPU  | **2 vCPU** |
| Disk      | 20 GB   | **40 GB** |
| OS        | Ubuntu 22.04 / Debian 12 | Ubuntu 22.04 LTS |
| Docker    | 24.x    | 25.x |

---

## Schritt-für-Schritt Deployment

### 1. Docker installieren (Ubuntu 22.04)

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

### 2. Projekt auf Server hochladen (SFTP)

Laden Sie den gesamten App-Ordner per SFTP hoch, z.B. nach `/home/user/candis-app/`.

**Wichtig:** Diese Dateien müssen im Root-Verzeichnis liegen:
```
/home/user/candis-app/
├── docker-compose.yml   ← Hauptdatei
├── .env                 ← Ihre Konfiguration
├── .env.example         ← Vorlage
├── backend/
│   ├── Dockerfile
│   ├── server.py
│   └── requirements.txt
├── frontend/
│   ├── Dockerfile
│   ├── frontend-spa.conf
│   └── ... (alle Frontend-Dateien)
└── nginx/
    └── nginx.conf
```

### 3. Umgebungsvariablen konfigurieren

```bash
cd /home/user/candis-app/
cp .env.example .env
nano .env
```

**Pflichtfelder:**
- `JWT_SECRET` – Langen, zufälligen String eingeben:
  ```bash
  python3 -c "import secrets; print(secrets.token_hex(32))"
  ```
- `OPENROUTER_API_KEY` – Von https://openrouter.ai/keys

### 4. Starten

```bash
# Ersten Start (baut alle Images, dauert 5-15 Minuten)
docker compose up -d --build

# Logs verfolgen
docker compose logs -f

# Status prüfen
docker compose ps
```

### 5. Erreichbarkeit prüfen

```bash
# Sollte 200 OK zurückgeben
curl http://localhost/api/health

# Frontend
curl -I http://localhost/
```

---

## Ports

| Port | Dienst | Öffentlich |
|------|--------|------------|
| **80** | nginx (HTTP) | ✅ Ja |
| 443 | nginx (HTTPS) | ⚙️ Optional |
| 8001 | FastAPI Backend | ❌ Intern |
| 27017 | MongoDB | ❌ Intern |

---

## HTTPS / SSL (optional, empfohlen)

Nach dem ersten Start:

```bash
# Certbot installieren
sudo apt install certbot -y

# Zertifikat holen (Port 80 muss erreichbar sein)
sudo certbot certonly --standalone -d IhreDomain.com

# Zertifikate in nginx-Ordner kopieren
mkdir -p nginx/ssl
sudo cp /etc/letsencrypt/live/IhreDomain.com/fullchain.pem nginx/ssl/
sudo cp /etc/letsencrypt/live/IhreDomain.com/privkey.pem nginx/ssl/

# nginx.conf anpassen: HTTPS-Block auskommentieren
# Dann neu starten:
docker compose restart nginx
```

---

## Updates einspielen

```bash
cd /home/user/candis-app/

# Neue Dateien per SFTP hochladen, dann:
docker compose up -d --build

# MongoDB-Daten bleiben im Volume erhalten!
```

## Daten-Backup

```bash
# MongoDB-Backup
docker compose exec mongo mongodump --db invoice_management --out /tmp/backup
docker cp $(docker compose ps -q mongo):/tmp/backup ./mongo-backup-$(date +%Y%m%d)
```

## Troubleshooting

```bash
# Alle Logs
docker compose logs

# Nur Backend-Logs
docker compose logs backend

# Neustart eines Dienstes
docker compose restart backend

# Alles stoppen
docker compose down

# Alles stoppen + Volumes löschen (ACHTUNG: löscht MongoDB-Daten!)
docker compose down -v
```
