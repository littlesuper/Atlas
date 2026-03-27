# ==================== Stage 1: Build ====================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package files for workspace setup
COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY client/ ./client/
COPY server/ ./server/

# Generate Prisma Client
RUN cd server && npx prisma generate

# Build frontend
RUN npm run build --workspace=client

# Build backend
RUN npm run build --workspace=server

# ==================== Stage 2: Production ====================
FROM node:20-alpine AS production

WORKDIR /app

# Install only production dependencies
COPY package.json package-lock.json ./
COPY server/package.json ./server/
# client package.json needed for workspace resolution but no install
COPY client/package.json ./client/

RUN npm ci --omit=dev --workspace=server && npm cache clean --force

# Copy Prisma schema and generate client for production
COPY server/prisma/ ./server/prisma/
RUN cd server && npx prisma generate

# Copy built backend
COPY --from=builder /app/server/dist/ ./server/dist/

# Copy built frontend (served by Express static or reverse proxy)
COPY --from=builder /app/client/dist/ ./client/dist/

# Copy root package.json for version reading
COPY package.json ./

# Create uploads directory
RUN mkdir -p server/uploads

# Non-root user for security
RUN addgroup -g 1001 -S atlas && adduser -S atlas -u 1001
RUN chown -R atlas:atlas /app
USER atlas

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "server/dist/index.js"]
