FROM node:26-bookworm-slim AS native-base
RUN apt-get update \
  && apt-get install -y --no-install-recommends g++ make python3 \
  && rm -rf /var/lib/apt/lists/*

FROM native-base AS build
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

FROM native-base AS production-dependencies
WORKDIR /app

COPY package.json package-lock.json* ./
COPY shared/package.json shared/package.json
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --omit=dev -w backend

FROM node:26-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
COPY shared/package.json shared/package.json
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY --from=production-dependencies /app/node_modules node_modules

COPY --from=build /app/shared/dist shared/dist
COPY --from=build /app/backend/dist backend/dist
COPY --from=build /app/frontend/dist frontend-dist
COPY --chmod=755 backend/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

WORKDIR /app/backend
EXPOSE 4000

# Vérifie toutes les 30 secondes que le serveur répond, sur le port configuré.
# Le conteneur est signalé « unhealthy » après 3 contrôles consécutifs en échec.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 4000) + '/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# L'entrypoint rend le volume de données au compte `node` puis lance le serveur sous ce compte.
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
