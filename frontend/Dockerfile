# ============================================================
# Candis-Kopie – Frontend Dockerfile
# Stage 1: Expo Web Build (Node 20)
# Stage 2: nginx serving statische Dateien
# ============================================================

# ---- Stage 1: Build ----
FROM node:20-alpine AS builder

WORKDIR /app

# Nur package-Dateien zuerst (besseres Layer-Caching)
COPY package.json yarn.lock ./

# Abhängigkeiten installieren
RUN yarn install --frozen-lockfile

# Zustand v5 Patch: Entfernt import.meta.env (nur in Vite verfügbar, nicht in Metro/webpack)
# Ohne diesen Patch -> 500-Fehler bei Expo Web
RUN sed -i 's/import\.meta\.env/undefined/g' \
    node_modules/zustand/esm/middleware.mjs 2>/dev/null || true

# Quellcode kopieren (ohne node_modules, .env via .dockerignore)
COPY . .

# Expo Web exportieren (generiert statische Dateien in dist/)
# EXPO_PUBLIC_BACKEND_URL leer = API-Calls gehen als /api/... (nginx routet sie zum Backend)
ARG EXPO_PUBLIC_BACKEND_URL=""
ENV EXPO_PUBLIC_BACKEND_URL=$EXPO_PUBLIC_BACKEND_URL

RUN npx expo export --platform web --output-dir dist

# ---- Stage 2: nginx serving ----
FROM nginx:1.25-alpine

# Statische Expo-Build-Dateien
COPY --from=builder /app/dist /usr/share/nginx/html

# SPA-Konfiguration: alle Routen → index.html (für Expo Router)
COPY frontend-spa.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
