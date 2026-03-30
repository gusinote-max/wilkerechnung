#!/bin/bash
# ============================================================
# Candis-Kopie – Update Script (ohne Datenverlust)
# Verwendung: bash update.sh
# ============================================================

set -e

APP_DIR="/docker/wilkerechnung"
BACKUP_DIR="/docker/backups"
DATE=$(date +%Y%m%d_%H%M%S)

echo "========================================"
echo " Candis-Kopie Update – $(date)"
echo "========================================"

# 1. Sicherheitskopie der Datenbank
echo ""
echo "[1/4] Erstelle MongoDB-Backup..."
mkdir -p "$BACKUP_DIR"
docker compose -f "$APP_DIR/docker-compose.yml" exec -T mongo \
    mongodump --db invoice_management --archive \
    > "$BACKUP_DIR/backup_$DATE.archive" 2>/dev/null \
    && echo "     Backup gespeichert: $BACKUP_DIR/backup_$DATE.archive" \
    || echo "     Backup übersprungen (MongoDB nicht erreichbar)"

# 2. Neuesten Code holen
echo ""
echo "[2/4] Code-Update von GitHub..."
cd "$APP_DIR"
git pull origin main

# 3. Container neu bauen und starten (Volumes bleiben erhalten!)
echo ""
echo "[3/4] Container neu starten..."
docker compose up -d --build

# 4. Status prüfen
echo ""
echo "[4/4] Status:"
docker compose ps

# Alte Backups aufräumen (nur letzte 10 behalten)
ls -t "$BACKUP_DIR"/backup_*.archive 2>/dev/null | tail -n +11 | xargs rm -f 2>/dev/null || true

echo ""
echo "========================================"
echo " Update abgeschlossen!"
echo " Login: admin@candis-kopie.de / admin123"
echo "========================================"
