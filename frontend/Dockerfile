# Local development image for the Vite SPA (production is built and served by Vercel).
FROM oven/bun:1.3.3-alpine

WORKDIR /app

# Install dependencies first for better layer caching. bunfig.toml pins exact versions.
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile

COPY . .

EXPOSE 5173

CMD ["bun", "run", "dev", "--host"]
