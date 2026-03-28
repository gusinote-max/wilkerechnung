# Candis-Kopie - Deployment Guide

## Alpine Linux Installation

### Voraussetzungen
- Alpine Linux 3.18+ (Standard oder Extended)
- Mindestens 2 GB RAM, 20 GB SSD
- Root-Zugang
- Internetverbindung

### Schnellstart

```bash
# 1. Repository auf den Server kopieren
scp -r ./deploy ./backend ./frontend user@server:/tmp/candis-kopie/

# 2. Auf dem Server einloggen
ssh user@server

# 3. Installation starten
cd /tmp/candis-kopie/deploy
chmod +x install-alpine.sh
sudo ./install-alpine.sh
```

Das Script fragt interaktiv nach:
- **Domain** (optional, fuer SSL)
- **MongoDB-Modus** (Docker oder externe URL)
- **OpenRouter API Key** (fuer KI-OCR)

### Nach der Installation

| Befehl | Beschreibung |
|---|---|
| `sudo ./install-alpine.sh --status` | Status aller Services |
| `rc-service candis-kopie-backend restart` | Backend neustarten |
| `rc-service nginx restart` | Nginx neustarten |
| `tail -f /var/log/candis-kopie-backend.log` | Backend Logs |
| `docker logs candis-kopie-mongo` | MongoDB Logs |

### Updates einspielen

```bash
# Neuen Code auf Server kopieren, dann:
cd /tmp/candis-kopie/deploy
sudo ./update-alpine.sh              # Komplett
sudo ./update-alpine.sh --backend    # Nur Backend
sudo ./update-alpine.sh --frontend   # Nur Frontend
```

### Backup

```bash
# Datenbank sichern
docker exec candis-kopie-mongo mongodump --out /data/backup
docker cp candis-kopie-mongo:/data/backup ./backup-$(date +%Y%m%d)

# Konfiguration sichern
cp /opt/candis-kopie/backend/.env ./backup-backend.env
cp /opt/candis-kopie/frontend/.env ./backup-frontend.env
```

### Deinstallation

```bash
sudo ./install-alpine.sh --uninstall
# MongoDB-Daten manuell loeschen:
# docker volume rm candis-kopie-mongo-data
```

## Architektur

```
Internet --> Nginx (Port 80/443)
                |
                +-- /       --> Statische Dateien (Expo Web Build)
                +-- /api/*  --> FastAPI Backend (Port 8001)
                                    |
                                    +-- MongoDB (Docker, Port 27017)
```

## Mobile App bauen

Siehe `install-alpine.sh` Header oder frage im Chat nach dem EAS Build Guide.
