FROM node:24-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma/
RUN npm ci
RUN npx prisma generate

COPY . .
RUN npm run build

FROM node:24-alpine

WORKDIR /app

COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./
COPY --from=builder --chown=node:node /app/prisma ./prisma

USER node

EXPOSE 3000

# Liveness only: GET / answers whether or not the database is reachable, so a
# paused database does not mark the container unhealthy. /health reports the
# database separately for external monitoring.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/ || exit 1

# A failed schema sync must not keep the API down: while the database was
# paused this used to crash-loop the container thousands of times.
CMD ["sh", "-c", "npx prisma db push --skip-generate || echo '[startup] prisma db push failed; starting the API anyway'; exec node dist/src/main.js"]
