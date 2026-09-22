FROM node:22-alpine AS base

ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY web/package.json web/package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY web/ ./
COPY --from=deps /app/node_modules ./node_modules

# The application deliberately does not require a live database during next build.
ENV NODE_ENV=production
RUN npm run build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3456
ENV HOSTNAME=0.0.0.0

ARG SOMA_COMMIT_SHA=unknown
ENV SOMA_COMMIT_SHA=${SOMA_COMMIT_SHA}

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3456

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3456/login').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
