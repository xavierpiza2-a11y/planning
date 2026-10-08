# syntax=docker/dockerfile:1
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies for build
RUN npm install

# Copy application source code
COPY . .

# Build Vite frontend bundle
RUN npm run build

# ----------------------------------------------------------------------------
# Production Runner
# ----------------------------------------------------------------------------
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy package definitions and install only production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy built frontend assets
COPY --from=builder /app/dist ./dist

# Copy backend server files
COPY server.ts ./
COPY src/server ./src/server
COPY src/config ./src/config
COPY src/types ./src/types

# Create persistent storage directory for planning database
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "server.ts"]
