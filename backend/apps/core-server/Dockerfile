FROM node:24-alpine AS base

RUN apk add --no-cache git \
  && corepack enable \
  && corepack prepare pnpm@latest --activate

WORKDIR /app

FROM base AS builder

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./

COPY apps/core-server/package.json ./apps/core-server/package.json
COPY packages ./packages
COPY configs ./configs

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
  pnpm install --frozen-lockfile

COPY apps/core-server ./apps/core-server
COPY packages ./packages
COPY configs ./configs

RUN pnpm turbo run build --filter=core-server...

FROM node:24-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/apps/core-server/dist ./

EXPOSE 3000

CMD ["node", "./index.mjs"]