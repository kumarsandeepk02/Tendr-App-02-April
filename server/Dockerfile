FROM node:22-slim

WORKDIR /app

# Copy package files first for better caching
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy application code
COPY . .

# App Runner expects port 8080 by default, but we use PORT env var
EXPOSE 3001

CMD ["node", "server.js"]
