FROM node:20-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies required for pdf2pic, GraphicsMagick, and Ghostscript
RUN apt-get update && apt-get install -y --no-install-recommends \
    graphicsmagick \
    ghostscript \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --include=dev

# Copy application source
COPY . .

# Set default port (Render injects PORT dynamically)
ENV PORT=10000
EXPOSE 10000

CMD ["npx", "tsx", "src/index.ts"]
