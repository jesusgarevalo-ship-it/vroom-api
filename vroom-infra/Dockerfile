# ============================================
# Dockerfile Multi-Stage para VROOM API
# ============================================
# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar archivos de package
COPY package*.json ./

# Instalar dependencias
RUN npm ci --only=production

# Copiar código fuente
COPY tsconfig.json ./
COPY src ./src

# Build de TypeScript
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS production

# Crear usuario no-root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copiar node_modules del builder
COPY --from=builder /app/node_modules ./node_modules

# Copiar código compilado
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

# Copiar archivos de entorno (sobreescribir en producción)
COPY .env.example .env

# Cambiar ownership
RUN chown -R nodejs:nodejs /app

# Usuario no-root
USER nodejs

# Exponer puerto
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Comando de inicio
CMD ["node", "dist/index.js"]