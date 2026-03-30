#!/bin/bash
# ============================================================
# Autohaus Wilke – Update Script (ohne Datenverlust)
# Verwendung: bash /root/update.sh
# ============================================================

APP_DIR="/docker/wilkerechnung"
BACKUP_DIR="/root/backups"
DATE=$(date +%Y%m%d_%H%M%S)
GITHUB_TGZ="https://github.com/gusinote-max/wilkerechnung/archive/refs/heads/main.tar.gz"

echo "========================================"
echo " Autohaus Wilke Update – $(date)"
echo "========================================"

echo "[1/4] MongoDB-Backup..."
mkdir -p "$BACKUP_DIR"
docker compose -f "$APP_DIR/docker-compose.yml" exec -T mongo \
    mongodump --db invoice_management --archive \
    > "$BACKUP_DIR/backup_$DATE.archive" 2>/dev/null \
    && echo "     Gespeichert: $BACKUP_DIR/backup_$DATE.archive" \
    || echo "     Backup übersprungen"

echo "[2/4] Neuen Code herunterladen..."
cd /tmp
rm -rf wilkerechnung-main
wget -q "$GITHUB_TGZ" -O wilkerechnung.tar.gz
tar xzf wilkerechnung.tar.gz
rm wilkerechnung.tar.gz

echo "[3/4] Dateien aktualisieren..."
# Lokale Konfigurationsdateien sichern (werden nach dem Update wiederhergestellt)
cp "$APP_DIR/.env" /tmp/.env.backup 2>/dev/null || true
cp "$APP_DIR/docker-compose.yml" /tmp/compose.backup 2>/dev/null || true
cp -r /tmp/wilkerechnung-main/. "$APP_DIR/"
cp /tmp/.env.backup "$APP_DIR/.env" 2>/dev/null || true
cp /tmp/compose.backup "$APP_DIR/docker-compose.yml" 2>/dev/null || true
rm -f /tmp/.env.backup
rm -rf /tmp/wilkerechnung-main

echo "[4/4] Container neu bauen (kein Cache)..."
docker compose -f "$APP_DIR/docker-compose.yml" build --no-cache
docker compose -f "$APP_DIR/docker-compose.yml" up -d

echo ""
docker compose -f "$APP_DIR/docker-compose.yml" ps

ls -t "$BACKUP_DIR"/backup_*.archive 2>/dev/null | tail -n +11 | xargs rm -f 2>/dev/null || true

echo "========================================"
echo " Fertig! Login: admin@autohaus-wilke.de / admin123"
echo "========================================"
