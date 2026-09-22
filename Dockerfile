# Claude Code Usage Dashboard — multi-stage build (Next.js standalone output)
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# BUILD_STANDALONE switches next.config.ts to `output: 'standalone'` (see CMD below)
ENV NEXT_TELEMETRY_DISABLED=1 BUILD_STANDALONE=1
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=4747 HOSTNAME=0.0.0.0
# where the transcripts are mounted, and where this app keeps its parsed cache
ENV CLAUDE_HOME=/claude RESCAN_SECONDS=30
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# the parsed-transcript cache lives here; mount a volume to keep it across restarts
RUN mkdir -p /app/cache && chown -R node:node /app/cache
USER node
EXPOSE 4747
CMD ["node", "server.js"]
