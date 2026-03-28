#!/bin/sh
#
# ============================================================
# Candis-Kopie - Alpine Linux Installation Script
# ============================================================
# Vollautomatische Installation auf Alpine Linux
# Komponenten: FastAPI Backend, Expo Web Frontend, MongoDB, Nginx, SSL
#
# Verwendung:
#   chmod +x install-alpine.sh
#   sudo ./install-alpine.sh
#
# Nach der Installation:
#   sudo ./install-alpine.sh --status     # Status pruefen
#   sudo ./install-alpine.sh --uninstall  # Deinstallieren
# ============================================================

set -e

# ===================== KONFIGURATION =====================
# Diese Werte VOR der Installation anpassen!

APP_NAME="candis-kopie"
APP_DIR="/opt/${APP_NAME}"
APP_USER="candis"
DOMAIN=""                              # z.B. candis.meinefirma.de (leer = kein SSL)
BACKEND_PORT=8001
FRONTEND_PORT=3000                     # Nur fuer Dev, Nginx uebernimmt in Prod
MONGO_PORT=27017

# MongoDB Konfiguration
MONGO_MODE="docker"                    # "docker" oder "external"
MONGO_EXTERNAL_URL=""                  # Nur bei MONGO_MODE=external

# API Keys (werden interaktiv abgefragt falls leer)
JWT_SECRET=""
OPENROUTER_API_KEY=""

# ===================== FARBEN & LOGGING =====================
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
log_step()  { printf "\n${CYAN}=== Schritt %s ===${NC}\n\n" "$1"; }

# ===================== HILFSFUNKTIONEN =====================
check_root() {
    if [ "$(id -u)" -ne 0 ]; then
        log_error "Dieses Script muss als root ausgefuehrt werden"
        log_info  "Verwendung: sudo ./install-alpine.sh"
        exit 1
    fi
}

ask_value() {
    local prompt="$1"
    local default="$2"
    local var_name="$3"
    local is_secret="$4"
    
    if [ -n "$default" ]; then
        printf "${CYAN}%s${NC} [%s]: " "$prompt" "$default"
    else
        printf "${CYAN}%s${NC}: " "$prompt"
    fi
    
    if [ "$is_secret" = "true" ]; then
        stty -echo 2>/dev/null || true
        read input
        stty echo 2>/dev/null || true
        printf "\n"
    else
        read input
    fi
    
    if [ -z "$input" ] && [ -n "$default" ]; then
        eval "$var_name=\"$default\""
    elif [ -n "$input" ]; then
        eval "$var_name=\"$input\""
    fi
}

generate_secret() {
    head -c 32 /dev/urandom | base64 | tr -d '=+/' | head -c 40
}

# ===================== STATUS CHECK =====================
show_status() {
    printf "\n${CYAN}=== Candis-Kopie Status ===${NC}\n\n"
    
    # Backend
    if rc-service ${APP_NAME}-backend status >/dev/null 2>&1; then
        log_ok "Backend:  Laeuft auf Port ${BACKEND_PORT}"
    else
        log_error "Backend:  Gestoppt"
    fi
    
    # MongoDB
    if [ "$MONGO_MODE" = "docker" ]; then
        if docker ps --format '{{.Names}}' | grep -q "${APP_NAME}-mongo"; then
            log_ok "MongoDB:  Laeuft (Docker) auf Port ${MONGO_PORT}"
        else
            log_error "MongoDB:  Gestoppt"
        fi
    else
        log_info "MongoDB:  Extern (${MONGO_EXTERNAL_URL})"
    fi
    
    # Nginx
    if rc-service nginx status >/dev/null 2>&1; then
        log_ok "Nginx:    Laeuft"
    else
        log_error "Nginx:    Gestoppt"
    fi
    
    # Domain/URL
    if [ -n "$DOMAIN" ]; then
        log_info "URL:      https://${DOMAIN}"
    else
        log_info "URL:      http://$(hostname -i 2>/dev/null || echo 'SERVER_IP')"
    fi
    
    printf "\n"
    exit 0
}

# ===================== DEINSTALLATION =====================
uninstall() {
    printf "\n${RED}=== Candis-Kopie Deinstallation ===${NC}\n\n"
    log_warn "ACHTUNG: Dies entfernt die gesamte Installation!"
    log_warn "Die Datenbank bleibt erhalten (manuell loeschen mit: docker volume rm ${APP_NAME}-mongo-data)"
    printf "\nFortfahren? (ja/nein): "
    read confirm
    [ "$confirm" != "ja" ] && exit 0
    
    log_info "Stoppe Services..."
    rc-service ${APP_NAME}-backend stop 2>/dev/null || true
    rc-update del ${APP_NAME}-backend 2>/dev/null || true
    rm -f /etc/init.d/${APP_NAME}-backend
    
    docker stop ${APP_NAME}-mongo 2>/dev/null || true
    docker rm ${APP_NAME}-mongo 2>/dev/null || true
    
    rm -f /etc/nginx/http.d/${APP_NAME}.conf
    rc-service nginx reload 2>/dev/null || true
    
    log_info "Entferne App-Verzeichnis..."
    rm -rf ${APP_DIR}
    
    deluser ${APP_USER} 2>/dev/null || true
    
    log_ok "Deinstallation abgeschlossen"
    exit 0
}

# ===================== ARGUMENT HANDLING =====================
case "${1:-}" in
    --status)    show_status ;;
    --uninstall) uninstall ;;
esac

# ===================== HAUPTINSTALLATION =====================
check_root

printf "\n${CYAN}╔══════════════════════════════════════════════════╗${NC}\n"
printf "${CYAN}║       Candis-Kopie - Alpine Linux Installer       ║${NC}\n"
printf "${CYAN}║   KI-Rechnungsmanagement mit OCR & DATEV-Export   ║${NC}\n"
printf "${CYAN}╚══════════════════════════════════════════════════╝${NC}\n\n"

# ===================== INTERAKTIVE KONFIGURATION =====================
log_step "1/8: Konfiguration"

ask_value "Domain (leer fuer IP-Zugriff ohne SSL)" "$DOMAIN" "DOMAIN"
ask_value "MongoDB Modus (docker/external)" "$MONGO_MODE" "MONGO_MODE"

if [ "$MONGO_MODE" = "external" ]; then
    ask_value "MongoDB URL" "$MONGO_EXTERNAL_URL" "MONGO_EXTERNAL_URL"
fi

if [ -z "$JWT_SECRET" ]; then
    JWT_SECRET=$(generate_secret)
    log_info "JWT Secret automatisch generiert"
fi

ask_value "OpenRouter API Key (fuer KI-OCR, optional)" "$OPENROUTER_API_KEY" "OPENROUTER_API_KEY" "true"

# Zusammenfassung
printf "\n${CYAN}--- Konfiguration ---${NC}\n"
log_info "Domain:         ${DOMAIN:-<keine - IP-Zugriff>}"
log_info "MongoDB:        ${MONGO_MODE}"
log_info "App-Verzeichnis: ${APP_DIR}"
log_info "Backend-Port:   ${BACKEND_PORT}"
printf "\nInstallation starten? (ja/nein): "
read confirm
[ "$confirm" != "ja" ] && { log_warn "Abgebrochen"; exit 0; }

# ===================== PAKETE INSTALLIEREN =====================
log_step "2/8: System-Pakete installieren"

log_info "Aktualisiere Paketquellen..."
apk update
apk upgrade

log_info "Installiere Basis-Pakete..."
apk add --no-cache \
    python3 \
    py3-pip \
    py3-virtualenv \
    nodejs \
    npm \
    yarn \
    nginx \
    openssl \
    curl \
    git \
    gcc \
    musl-dev \
    python3-dev \
    libffi-dev \
    openssl-dev \
    jpeg-dev \
    zlib-dev \
    freetype-dev \
    libxml2-dev \
    libxslt-dev \
    mupdf-dev \
    docker \
    docker-cli-compose \
    certbot \
    certbot-nginx \
    shadow  # fuer useradd

# Docker starten
if [ "$MONGO_MODE" = "docker" ]; then
    rc-update add docker default
    rc-service docker start 2>/dev/null || true
    sleep 3
    log_ok "Docker gestartet"
fi

log_ok "Alle Pakete installiert"

# ===================== BENUTZER ERSTELLEN =====================
log_step "3/8: App-Benutzer einrichten"

if ! id "$APP_USER" >/dev/null 2>&1; then
    adduser -D -h "$APP_DIR" -s /bin/sh "$APP_USER"
    log_ok "Benutzer '${APP_USER}' erstellt"
else
    log_info "Benutzer '${APP_USER}' existiert bereits"
fi

mkdir -p "$APP_DIR"

# ===================== MONGODB STARTEN =====================
log_step "4/8: MongoDB einrichten"

if [ "$MONGO_MODE" = "docker" ]; then
    MONGO_URL="mongodb://localhost:${MONGO_PORT}/invoice_management"
    
    # Pruefen ob Container schon laeuft
    if docker ps --format '{{.Names}}' | grep -q "${APP_NAME}-mongo"; then
        log_info "MongoDB Container laeuft bereits"
    else
        # Alten Container entfernen falls vorhanden
        docker rm -f ${APP_NAME}-mongo 2>/dev/null || true
        
        log_info "Starte MongoDB via Docker..."
        docker run -d \
            --name ${APP_NAME}-mongo \
            --restart always \
            -p ${MONGO_PORT}:27017 \
            -v ${APP_NAME}-mongo-data:/data/db \
            -e MONGO_INITDB_DATABASE=invoice_management \
            mongo:7
        
        # Warten bis MongoDB bereit ist
        log_info "Warte auf MongoDB..."
        for i in $(seq 1 30); do
            if docker exec ${APP_NAME}-mongo mongosh --eval "db.runCommand({ping:1})" >/dev/null 2>&1; then
                break
            fi
            sleep 1
        done
        log_ok "MongoDB laeuft auf Port ${MONGO_PORT}"
    fi
else
    MONGO_URL="$MONGO_EXTERNAL_URL"
    log_info "Verwende externe MongoDB: ${MONGO_URL}"
fi

# ===================== BACKEND EINRICHTEN =====================
log_step "5/8: Backend einrichten"

mkdir -p ${APP_DIR}/backend

# Falls Quellcode noch nicht vorhanden, kopieren
if [ ! -f "${APP_DIR}/backend/server.py" ]; then
    if [ -f "$(dirname $0)/../backend/server.py" ]; then
        log_info "Kopiere Backend-Code..."
        cp -r "$(dirname $0)/../backend/"* "${APP_DIR}/backend/"
    else
        log_error "Backend-Quellcode nicht gefunden!"
        log_info  "Bitte kopiere den /backend/ Ordner nach ${APP_DIR}/backend/"
        exit 1
    fi
fi

# Virtual Environment
log_info "Erstelle Python Virtual Environment..."
cd ${APP_DIR}/backend
python3 -m venv venv
. venv/bin/activate

# Spezielle Alpine-Pakete die kompiliert werden muessen
log_info "Installiere Python-Abhaengigkeiten (kann einige Minuten dauern)..."
pip install --upgrade pip setuptools wheel
pip install -r requirements.txt

deactivate

# .env erstellen
log_info "Erstelle Backend .env Datei..."
cat > ${APP_DIR}/backend/.env << ENVEOF
# Candis-Kopie Backend Konfiguration
# Generiert am: $(date '+%Y-%m-%d %H:%M:%S')

MONGO_URL=${MONGO_URL}
JWT_SECRET=${JWT_SECRET}
OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
DB_NAME=invoice_management

# SMTP (optional - fuer E-Mail-Benachrichtigungen)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM_EMAIL=noreply@${DOMAIN:-localhost}
SMTP_FROM_NAME=Candis-Kopie
ENVEOF

chown -R ${APP_USER}:${APP_USER} ${APP_DIR}/backend
log_ok "Backend eingerichtet"

# ===================== FRONTEND BAUEN =====================
log_step "6/8: Frontend bauen"

mkdir -p ${APP_DIR}/frontend

# Falls Quellcode noch nicht vorhanden, kopieren
if [ ! -f "${APP_DIR}/frontend/package.json" ]; then
    if [ -f "$(dirname $0)/../frontend/package.json" ]; then
        log_info "Kopiere Frontend-Code..."
        cp -r "$(dirname $0)/../frontend/"* "${APP_DIR}/frontend/"
        # node_modules nicht kopieren
        rm -rf "${APP_DIR}/frontend/node_modules"
    else
        log_error "Frontend-Quellcode nicht gefunden!"
        log_info  "Bitte kopiere den /frontend/ Ordner nach ${APP_DIR}/frontend/"
        exit 1
    fi
fi

cd ${APP_DIR}/frontend

# Backend-URL konfigurieren
if [ -n "$DOMAIN" ]; then
    BACKEND_URL="https://${DOMAIN}"
else
    BACKEND_URL="http://$(hostname -i 2>/dev/null || echo 'localhost')"
fi

cat > .env << ENVEOF
EXPO_PUBLIC_BACKEND_URL=${BACKEND_URL}
ENVEOF

log_info "Installiere Node.js Abhaengigkeiten..."
yarn install --frozen-lockfile 2>/dev/null || yarn install

log_info "Baue Web-Frontend (kann 2-5 Minuten dauern)..."
npx expo export --platform web 2>&1 | tail -5

if [ -d "dist" ]; then
    log_ok "Frontend gebaut ($(du -sh dist | cut -f1))"
else
    log_error "Frontend-Build fehlgeschlagen!"
    log_info  "Versuche: cd ${APP_DIR}/frontend && npx expo export --platform web"
    exit 1
fi

chown -R ${APP_USER}:${APP_USER} ${APP_DIR}/frontend

# ===================== SERVICES EINRICHTEN =====================
log_step "7/8: OpenRC Services einrichten"

# Backend Service (OpenRC)
cat > /etc/init.d/${APP_NAME}-backend << 'SERVICEEOF'
#!/sbin/openrc-run

name="Candis-Kopie Backend"
description="FastAPI Backend fuer Candis-Kopie Rechnungsmanagement"

command="/opt/candis-kopie/backend/venv/bin/uvicorn"
command_args="server:app --host 127.0.0.1 --port 8001 --workers 2 --log-level info"
command_user="candis"
command_background=true
directory="/opt/candis-kopie/backend"
pidfile="/var/run/${RC_SVCNAME}.pid"
output_log="/var/log/${RC_SVCNAME}.log"
error_log="/var/log/${RC_SVCNAME}.err"

depend() {
    need net
    after docker
}

start_pre() {
    checkpath -f -o candis:candis "$output_log" "$error_log"
}
SERVICEEOF

chmod +x /etc/init.d/${APP_NAME}-backend
rc-update add ${APP_NAME}-backend default

# MongoDB Docker-Neustart Service
if [ "$MONGO_MODE" = "docker" ]; then
    cat > /etc/init.d/${APP_NAME}-mongo << MONGOEOF
#!/sbin/openrc-run

name="Candis-Kopie MongoDB"
description="MongoDB Container fuer Candis-Kopie"

depend() {
    need docker
}

start() {
    ebegin "Starting MongoDB Container"
    docker start ${APP_NAME}-mongo 2>/dev/null || \
    docker run -d \\
        --name ${APP_NAME}-mongo \\
        --restart always \\
        -p ${MONGO_PORT}:27017 \\
        -v ${APP_NAME}-mongo-data:/data/db \\
        mongo:7
    eend \$?
}

stop() {
    ebegin "Stopping MongoDB Container"
    docker stop ${APP_NAME}-mongo
    eend \$?
}

status() {
    if docker ps --format '{{.Names}}' | grep -q "${APP_NAME}-mongo"; then
        einfo "MongoDB is running"
        return 0
    else
        einfo "MongoDB is stopped"
        return 3
    fi
}
MONGOEOF
    chmod +x /etc/init.d/${APP_NAME}-mongo
    rc-update add ${APP_NAME}-mongo default
fi

# ===================== NGINX KONFIGURIEREN =====================
log_info "Konfiguriere Nginx..."

mkdir -p /etc/nginx/http.d

if [ -n "$DOMAIN" ]; then
    # Mit Domain - SSL wird spaeter per certbot hinzugefuegt
    cat > /etc/nginx/http.d/${APP_NAME}.conf << NGINXEOF
server {
    listen 80;
    server_name ${DOMAIN};

    # Frontend - Statische Dateien
    location / {
        root ${APP_DIR}/frontend/dist;
        try_files \$uri \$uri/ /index.html;
        
        # Cache fuer Assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
            expires 30d;
            add_header Cache-Control "public, immutable";
        }
    }

    # Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:${BACKEND_PORT}/api/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        # Fuer grosse Rechnungs-Uploads
        client_max_body_size 50M;
        proxy_read_timeout 120s;
    }
}
NGINXEOF
else
    # Ohne Domain - Direkter IP-Zugriff
    cat > /etc/nginx/http.d/${APP_NAME}.conf << NGINXEOF
server {
    listen 80 default_server;
    server_name _;

    location / {
        root ${APP_DIR}/frontend/dist;
        try_files \$uri \$uri/ /index.html;
        
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
            expires 30d;
            add_header Cache-Control "public, immutable";
        }
    }

    location /api/ {
        proxy_pass http://127.0.0.1:${BACKEND_PORT}/api/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        client_max_body_size 50M;
        proxy_read_timeout 120s;
    }
}
NGINXEOF
fi

# Default Nginx Config entfernen falls vorhanden
rm -f /etc/nginx/http.d/default.conf

# Nginx testen und starten
nginx -t 2>/dev/null
rc-update add nginx default
rc-service nginx start 2>/dev/null || rc-service nginx restart

log_ok "Nginx konfiguriert"

# ===================== SSL EINRICHTEN =====================
if [ -n "$DOMAIN" ]; then
    log_step "7b: SSL-Zertifikat einrichten"
    
    log_info "Hole Let's Encrypt Zertifikat fuer ${DOMAIN}..."
    printf "E-Mail fuer SSL-Benachrichtigungen: "
    read SSL_EMAIL
    
    if [ -n "$SSL_EMAIL" ]; then
        certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$SSL_EMAIL" && \
            log_ok "SSL-Zertifikat installiert" || \
            log_warn "SSL konnte nicht eingerichtet werden (DNS noch nicht konfiguriert?)"
    else
        log_warn "SSL uebersprungen (keine E-Mail angegeben)"
        log_info "Spaeter nachholen mit: certbot --nginx -d ${DOMAIN}"
    fi
fi

# ===================== SERVICES STARTEN =====================
log_step "8/8: Services starten"

if [ "$MONGO_MODE" = "docker" ]; then
    rc-service ${APP_NAME}-mongo start 2>/dev/null || true
    sleep 3
fi

rc-service ${APP_NAME}-backend start
sleep 2

# Health Check
log_info "Pruefe Backend..."
for i in $(seq 1 15); do
    if curl -sf http://127.0.0.1:${BACKEND_PORT}/api/health >/dev/null 2>&1; then
        log_ok "Backend antwortet!"
        break
    fi
    sleep 1
    [ "$i" = "15" ] && log_warn "Backend antwortet noch nicht - pruefe Logs: /var/log/${APP_NAME}-backend.err"
done

# Admin-Benutzer erstellen
log_info "Erstelle Admin-Benutzer..."
ADMIN_RESULT=$(curl -sf -X POST http://127.0.0.1:${BACKEND_PORT}/api/auth/register \
    -H "Content-Type: application/json" \
    -d '{"name":"Administrator","email":"admin@candis-kopie.de","password":"admin123","role":"admin"}' 2>/dev/null || echo "exists")

if echo "$ADMIN_RESULT" | grep -q "email"; then
    log_ok "Admin erstellt: admin@candis-kopie.de / admin123"
    log_warn "WICHTIG: Passwort nach erstem Login aendern!"
else
    log_info "Admin-Benutzer existiert bereits"
fi

# ===================== FERTIG =====================
if [ -n "$DOMAIN" ]; then
    APP_URL="https://${DOMAIN}"
else
    APP_URL="http://$(hostname -i 2>/dev/null || echo '<SERVER_IP>')"
fi

printf "\n${GREEN}╔══════════════════════════════════════════════════╗${NC}\n"
printf "${GREEN}║         Installation abgeschlossen!               ║${NC}\n"
printf "${GREEN}╚══════════════════════════════════════════════════╝${NC}\n\n"

printf "${CYAN}App-URL:${NC}      %s\n" "$APP_URL"
printf "${CYAN}Admin-Login:${NC}  admin@candis-kopie.de / admin123\n"
printf "${CYAN}API Health:${NC}   %s/api/health\n" "$APP_URL"
printf "\n"
printf "${CYAN}Nuetzliche Befehle:${NC}\n"
printf "  %-45s %s\n" "rc-service ${APP_NAME}-backend status"  "# Backend Status"
printf "  %-45s %s\n" "rc-service ${APP_NAME}-backend restart" "# Backend neustarten"
printf "  %-45s %s\n" "tail -f /var/log/${APP_NAME}-backend.log" "# Backend Logs"
printf "  %-45s %s\n" "tail -f /var/log/${APP_NAME}-backend.err" "# Backend Fehler"
printf "  %-45s %s\n" "docker logs ${APP_NAME}-mongo"          "# MongoDB Logs"
printf "  %-45s %s\n" "rc-service nginx restart"               "# Nginx neustarten"
printf "  %-45s %s\n" "./install-alpine.sh --status"            "# Status aller Services"
printf "\n"

if [ -n "$DOMAIN" ]; then
    printf "${CYAN}SSL erneuern (automatisch via Cron):${NC}\n"
    printf "  echo '0 3 * * * certbot renew --quiet' | crontab -\n"
fi

printf "\n${YELLOW}WICHTIG: Aendere das Admin-Passwort nach dem ersten Login!${NC}\n\n"
