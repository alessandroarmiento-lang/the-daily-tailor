# The Daily Tailor — production image for Fly.io (always-on host).
# Local Mac LaunchAgent remains an optional fallback; this image is Linux-only.

FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080
ENV HOSTNAME=0.0.0.0
ENV TZ=Europe/Rome
ENV NEWSPAPER_TIMEZONE=Europe/Rome
ENV EDITIONS_DIR=/data/editions

RUN apk add --no-cache ca-certificates curl tzdata \
  && cp /usr/share/zoneinfo/Europe/Rome /etc/localtime \
  && echo "Europe/Rome" > /etc/timezone

# supercronic — cron that respects container TZ (06:00 Europe/Rome).
ARG TARGETARCH
ARG SUPERCRONIC_VERSION=v0.2.33
RUN set -eux; \
  case "${TARGETARCH}" in \
    amd64|arm64) arch="${TARGETARCH}" ;; \
    *) echo "unsupported TARGETARCH=${TARGETARCH}" >&2; exit 1 ;; \
  esac; \
  curl -fsSL \
    "https://github.com/aptible/supercronic/releases/download/${SUPERCRONIC_VERSION}/supercronic-linux-${arch}" \
    -o /usr/local/bin/supercronic; \
  chmod +x /usr/local/bin/supercronic

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --chown=nextjs:nodejs deploy/fly/crontab /app/deploy/fly/crontab
COPY --chown=nextjs:nodejs deploy/fly/entrypoint.sh /app/deploy/fly/entrypoint.sh
RUN chmod +x /app/deploy/fly/entrypoint.sh \
  && mkdir -p /data/editions \
  && chown -R nextjs:nodejs /data

USER nextjs
EXPOSE 8080
VOLUME ["/data/editions"]

ENTRYPOINT ["/app/deploy/fly/entrypoint.sh"]
