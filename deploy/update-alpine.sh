#!/bin/sh
#
# ============================================================
# Candis-Kopie - Update Script fuer Alpine Linux
# ============================================================
# Aktualisiert Backend und/oder Frontend ohne Datenverlust
#
# Verwendung:
#   sudo ./update-alpine.sh              # Komplett-Update
#   sudo ./update-alpine.sh --backend    # Nur Backend
#   sudo ./update-alpine.sh --frontend   # Nur Frontend
# ============================================================

set -e

APP_NAME="candis-kopie"
APP_DIR="/opt/${APP_NAME}"
SCRIPT_DIR="$(dirname $0)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()  { printf "${BLUE}[INFO]${NC}  %s\n" "$1"; }
log_ok()    { printf "${GREEN}[OK]${NC}    %s\n" "$1"; }
log_warn()  { printf "${YELLOW}[WARN]${NC}  %s\n" "$1"; }
log_error() { printf "${RED}[ERROR]${NC} %s\n" "$1"; }

if [ "$(id -u)" -ne 0 ]; then
    log_error "Bitte als root ausfuehren: sudo ./update-alpine.sh"
    exit 1
fi

UPDATE_BACKEND=true
UPDATE_FRONTEND=true

case "${1:-}" in
    --backend)  UPDATE_FRONTEND=false ;;
    --frontend) UPDATE_BACKEND=false ;;
esac

# Backup .env Dateien
log_info "Sichere Konfiguration..."
cp ${APP_DIR}/backend/.env /tmp/${APP_NAME}-backend.env.bak 2>/dev/null || true
cp ${APP_DIR}/frontend/.env /tmp/${APP_NAME}-frontend.env.bak 2>/dev/null || true
log_ok "Konfiguration gesichert"

if [ "$UPDATE_BACKEND" = true ]; then
    printf "\n${CYAN}=== Backend Update ===${NC}\n\n"
    
    log_info "Stoppe Backend..."
    rc-service ${APP_NAME}-backend stop 2>/dev/null || true
    
    log_info "Kopiere neuen Backend-Code..."
    # Sichern der venv und .env
    cp -r ${APP_DIR}/backend/.env /tmp/${APP_NAME}-backend.env.bak
    
    # Neuen Code kopieren (ohne venv und .env zu ueberschreiben)
    rsync -av --exclude='venv' --exclude='.env' --exclude='__pycache__' \
        "${SCRIPT_DIR}/../backend/" "${APP_DIR}/backend/"
    
    # .env wiederherstellen
    cp /tmp/${APP_NAME}-backend.env.bak ${APP_DIR}/backend/.env
    
    log_info "Aktualisiere Python-Abhaengigkeiten..."
    cd ${APP_DIR}/backend
    . venv/bin/activate
    pip install -r requirements.txt --quiet
    deactivate
    
    chown -R candis:candis ${APP_DIR}/backend
    
    log_info "Starte Backend..."
    rc-service ${APP_NAME}-backend start
    sleep 3
    
    if curl -sf http://127.0.0.1:8001/api/health >/dev/null 2>&1; then
        log_ok "Backend erfolgreich aktualisiert!"
    else
        log_error "Backend antwortet nicht - pruefe Logs!"
    fi
fi

if [ "$UPDATE_FRONTEND" = true ]; then
    printf "\n${CYAN}=== Frontend Update ===${NC}\n\n"
    
    log_info "Kopiere neuen Frontend-Code..."
    # .env sichern
    cp ${APP_DIR}/frontend/.env /tmp/${APP_NAME}-frontend.env.bak 2>/dev/null || true
    
    # Neuen Code kopieren
    rsync -av --exclude='node_modules' --exclude='.env' --exclude='dist' \
        "${SCRIPT_DIR}/../frontend/" "${APP_DIR}/frontend/"
    
    # .env wiederherstellen
    cp /tmp/${APP_NAME}-frontend.env.bak ${APP_DIR}/frontend/.env 2>/dev/null || true
    
    cd ${APP_DIR}/frontend
    
    log_info "Installiere Abhaengigkeiten..."
    yarn install --frozen-lockfile 2>/dev/null || yarn install
    
    log_info "Baue Frontend neu..."
    npx expo export --platform web 2>&1 | tail -5
    
    chown -R candis:candis ${APP_DIR}/frontend
    
    log_info "Lade Nginx neu..."
    rc-service nginx reload
    
    log_ok "Frontend erfolgreich aktualisiert!"
fi

printf "\n${GREEN}Update abgeschlossen!${NC}\n\n"
