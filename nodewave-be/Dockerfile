FROM oven/bun:1
WORKDIR /app
COPY package.json bun.lock* ./
COPY prisma ./prisma
RUN bun install --frozen-lockfile
COPY . .
EXPOSE 8080
# migrate + seed are idempotent, safe on every deploy
CMD ["sh", "-c", "bunx prisma migrate deploy && bun prisma/seed.ts && bun src/index.ts"]
