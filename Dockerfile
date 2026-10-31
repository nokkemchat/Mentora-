FROM node:20-bullseye-slim

# Install system dependencies required for pdf2pic, GraphicsMagick, and Ghostscript
RUN apt-get update && apt-get install -y \
    graphicsmagick \
    ghostscript \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies from mentora-ingestion-agent
COPY mentora-ingestion-agent/package*.json ./
RUN npm install --include=dev

# Copy application source
COPY mentora-ingestion-agent/ .

# Set default port (Render injects PORT dynamically)
ENV PORT=10000
EXPOSE 10000

CMD ["npx", "tsx", "src/index.ts"]
