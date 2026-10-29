FROM node:20-slim

# Prisma's query engine needs OpenSSL.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

# Create/upgrade the DB tables, then serve. Safe to repeat on every start.
CMD ["sh", "-c", "npx prisma db push --skip-generate && npm run start"]
