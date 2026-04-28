# Bun + persistent SQLite for the corpus app.
# Build: docker build -f apps/corpus/Dockerfile -t agent-feed-corpus .
# Run:   docker run -p 4300:4300 -e SEED=1 -v $PWD/data:/data agent-feed-corpus

FROM oven/bun:1.3 AS base
WORKDIR /app

# Install deps with frozen lockfile so the image is reproducible
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

# Copy only what the corpus app needs to run
COPY src ./src
COPY apps/corpus ./apps/corpus

ENV PORT=4300
ENV DB_PATH=/data/agent-corpus.sqlite

# Persist SQLite outside the image
VOLUME ["/data"]

EXPOSE 4300

CMD ["bun", "apps/corpus/src/server.ts"]
