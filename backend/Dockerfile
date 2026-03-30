# ============================================================
# Candis-Kopie – Backend Dockerfile (FastAPI / Python 3.11)
# ============================================================
FROM python:3.11

WORKDIR /app

# System-Abhängigkeiten
RUN apt-get update && apt-get install -y --no-install-recommends \
    libxml2-dev \
    libxslt-dev \
    && rm -rf /var/lib/apt/lists/*

# Produktions-Abhängigkeiten (stabile Versionen, ohne Dev-Tools)
COPY requirements-prod.txt .
RUN pip install --no-cache-dir -r requirements-prod.txt

# Quellcode kopieren
COPY . .

# Port 8001 intern (wird NICHT nach außen gemappt, nur nginx sieht ihn)
EXPOSE 8001

# Produktionsstart: 2 Worker (genug für ~300 Rechnungen/Monat)
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "2"]
