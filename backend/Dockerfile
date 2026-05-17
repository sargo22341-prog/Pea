FROM node:25-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json* ./
COPY shared/package.json shared/package.json
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci

COPY shared shared
COPY backend backend
COPY frontend frontend
RUN npm run build

FROM node:25-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
COPY shared/package.json shared/package.json
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --omit=dev -w backend

COPY --from=build /app/shared/dist shared/dist
COPY --from=build /app/backend/dist backend/dist
COPY --from=build /app/frontend/dist data/frontend-dist

WORKDIR /app/backend
EXPOSE 4000

# Vérifie que le serveur répond correctement toutes les 30 secondes.
# Docker arrête et redémarre le conteneur si 3 contrôles consécutifs échouent.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:4000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "dist/server.js"]
