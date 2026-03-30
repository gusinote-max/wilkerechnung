# ============================================================
# Candis-Kopie – Backend Dockerfile (FastAPI / Python 3.11)
# ============================================================
FROM python:3.11-slim

WORKDIR /app

# System-Abhängigkeiten (für lxml, cryptography, IMAP-SSL)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libssl-dev \
    libffi-dev \
    libxml2-dev \
    libxslt-dev \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

# Python-Abhängigkeiten installieren
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Quellcode kopieren
COPY . .

# Port 8001 intern (wird NICHT nach außen gemappt, nur nginx sieht ihn)
EXPOSE 8001

# Produktionsstart: 2 Worker (genug für ~300 Rechnungen/Monat)
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "2"]
