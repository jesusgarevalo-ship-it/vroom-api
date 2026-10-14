# 🚗 VROOM Repuestos Express MVP

> API Backend para marketplace de repuestos automotrices en Venezuela. Pago Móvil (BS) únicamente.

![Node.js](https://img.shields.io/badge/Node.js-20-green)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)
![Fastify](https://img.shields.io/badge/Fastify-4.x-purple)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-blue)
![License](https://img.shields.io/badge/License-MIT-yellow)

---

## 📋 Tabla de Contenidos

- [Descripción](#-descripción)
- [Arquitectura](#-arquitectura)
- [Stack Tecnológico](#-stack-tecnológico)
- [Primeros Pasos](#-primeros-pasos)
- [Variables de Entorno](#-variables-de-entorno)
- [API Endpoints](#-api-endpoints)
- [Esquema de Base de Datos](#-esquema-de-base-de-datos)
- [Pagos con Pago Móvil](#-pagos-con-pago-móvil)
- [Tiempo Real con Socket.io](#-tiempo-real-con-socketio)
- [Docker](#-docker)
- [Desarrollo](#-desarrollo)

---

## 📖 Descripción

VROOM Repuestos Express es un marketplace MVP que conecta talleres mecánicos y vendedores de repuestos con conductores en Venezuela. El sistema soporta:

- ✅ Búsqueda de repuestos por vehículo, categoría o texto
- ✅ Órdenes de compra con confirmación de Pago Móvil
- ✅ Seguimiento de entregas en tiempo real (GPS)
- ✅ Autenticación con OTP por SMS
- ✅ Moneda local: Bolívares (BS) vía Pago Móvil

---

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENTE MÓVIL                           │
│                    (Aplicación del Cliente)                     │
└─────────────────────────────┬───────────────────────────────────┘
                              │ REST + WebSocket
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         VROOM API                                │
│                    (Node.js + Fastify)                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │   Auth   │  │ Products │  │  Orders  │  │ Payments │        │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │
│         │                                            │           │
│  ┌──────┴────────────────────────────────────────────┴─────┐    │
│  │                    Socket.io (Real-time)                │    │
│  │              GPS Tracking + Status Updates              │    │
│  └──────────────────────────────────────────────────────────┘   │
└──────────┬─────────────────────────────────────┬────────────────┘
           │                                     │
     ┌─────┴─────┐                         ┌─────┴─────┐
     │ PostgreSQL │                         │   Redis    │
     │   ( Datos ) │                         │ (Cache/OTPs)│
     └───────────┘                         └────────────┘
```

---

## 🛠️ Stack Tecnológico

| Componente | Tecnología | Propósito |
|------------|------------|-----------|
| API | Node.js 20 + Fastify | Servidor HTTP de alto rendimiento |
| Lenguaje | TypeScript 5 | Tipado estático |
| Base de Datos | PostgreSQL 15 | Almacenamiento principal |
| Cache/Sesiones | Redis 7 | OTPs, rate limiting, sesiones |
| Tiempo Real | Socket.io | GPS tracking, updates |
| Pagos | Pago Móvil BS | Unico método de pago |
| Tasas | BCV API | Tipo de cambio USD→BS |
| Testing | Vitest | Unit tests |
| Despliegue | Docker + Railway | Contenedores |

---

## 🚀 Primeros Pasos

### Requisitos

- Node.js 20+
- PostgreSQL 15
- Redis 7
- npm o yarn

### Instalación

```bash
# Clonar repositorio
git clone https://github.com/jesusgarevalo-ship-it/vroom-api.git
cd vroom-api

# Instalar dependencias
npm install

# Copiar variables de entorno
cp .env.example .env

# Editar .env con tus credenciales
# DATABASE_URL=postgresql://user:pass@localhost:5432/vroom_db
# REDIS_URL=redis://localhost:6379

# Crear base de datos
psql -U postgres -c "CREATE DATABASE vroom_db;"

# Ejecutar migración
psql -U postgres -d vroom_db -f src/db/migrations/001_initial.sql

# Iniciar en desarrollo
npm run dev
```

### Inicio Rápido con Docker

```bash
cd vroom-infra
docker-compose up -d

# Ver logs
docker-compose logs -f api

# La API estará disponible en http://localhost:3000
```

---

## 🔧 Variables de Entorno

| Variable | Descripción | Default |
|----------|-------------|---------|
| `PORT` | Puerto del servidor | `3000` |
| `NODE_ENV` | Entorno (development/production) | `development` |
| `LOG_LEVEL` | Nivel de logs | `info` |
| `DATABASE_URL` | URL de PostgreSQL | - |
| `REDIS_URL` | URL de Redis | `redis://localhost:6379` |
| `JWT_SECRET` | Clave secreta para JWT | - |
| `BCV_FALLBACK_RATE` | Tasa USD→BS si BCV falla | `50` |
| `CORS_ORIGIN` | Origen permitido para CORS | `*` |

---

## 📡 API Endpoints

### Salud

```
GET /health
```
Respuesta:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T12:00:00.000Z"
}
```

---

### Autenticación 🔐

#### Enviar OTP
```
POST /auth/send-otp
Content-Type: application/json

{
  "phone": "04121234567"
}
```
Respuesta:
```json
{
  "success": true,
  "message": "Código enviado"
}
```

#### Verificar OTP
```
POST /auth/verify-otp
Content-Type: application/json

{
  "phone": "04121234567",
  "code": "123456"
}
```
Respuesta:
```json
{
  "accessToken": "eyJhbGci...",
  "refreshToken": "eyJhbGci...",
  "expiresIn": 3600
}
```

#### Refrescar Token
```
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGci..."
}
```

---

### Productos 🔍

#### Buscar
```
GET /products/search?q=pastillas+corsa+2015&city=Caracas&limit=20&offset=0
```

#### Categorías
```
GET /products/categories
```
Respuesta:
```json
{
  "success": true,
  "categories": [
    { "id": "frenos", "name": "Frenos", "icon": "brake" },
    { "id": "motor", "name": "Motor", "icon": "engine" }
  ]
}
```

#### Producto por ID
```
GET /products/:id
```

---

### Órdenes 📦

#### Crear Orden
```
POST /orders
Content-Type: application/json

{
  "items": [
    { "productId": "uuid", "quantity": 2 }
  ],
  "deliveryAddress": "Av. Libertador, Caracas",
  "city": "Caracas",
  "customerName": "Juan Pérez",
  "customerPhone": "04121234567"
}
```

#### Obtener Orden
```
GET /orders/:id
```

#### Listar Órdenes
```
GET /orders?phone=04121234567&limit=20&offset=0
```

---

### Pagos 💰

#### Iniciar Pago
```
POST /payments/initiate
Content-Type: application/json

{
  "orderId": "uuid"
}
```
Respuesta:
```json
{
  "success": true,
  "paymentId": "uuid",
  "reference": "VROOM-A1B2C3D4",
  "amountBs": 5100.00,
  "instructions": {
    "bank": "Banco de Venezuela (BDV)",
    "phone": "04141234567",
    "reference": "VROOM-A1B2C3D4",
    "amount": "Bs 5100.00",
    "concept": "VROOM"
  }
}
```

#### Confirmar Pago
```
POST /payments/confirm
Content-Type: application/json

{
  "reference": "VROOM-A1B2C3D4",
  "phone": "04121234567",
  "amount": 5100.00
}
```

---

## 🗄️ Esquema de Base de Datos

### Tablas Principales

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│    users     │     │  suppliers   │     │   products   │
├──────────────┤     ├──────────────┤     ├──────────────┤
│ id (PK)      │     │ id (PK)      │     │ id (PK)      │
│ phone        │     │ business_name│     │ supplier_id  │──┐
│ name         │     │ city         │     │ name         │  │
│ email        │     │ rating       │     │ price_usd    │  │
│ is_verified  │     │ is_active    │     │ category     │  │
└──────────────┘     └──────────────┘     │ stock        │  │
                                          └──────────────┘  │
                                                  ▲        │
                                                  │        │
                                          ┌───────────────┴─────┐
                                          │ product_compatibility│
                                          ├──────────────────────┤
                                          │ product_id (FK)      │
                                          │ brand, model         │
                                          │ year_from, year_to   │
                                          └──────────────────────┘

┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│    orders    │────▶│ order_items  │     │  payments    │
├──────────────┤     ├──────────────┤     ├──────────────┤
│ id (PK)      │     │ id (PK)      │     │ id (PK)      │
│ status       │     │ order_id (FK)│     │ order_id (FK)│
│ total_usd    │     │ product_id   │     │ reference    │
│ city         │     │ quantity     │     │ amount_bs    │
│ customer_    │     │ price_usd    │     │ status       │
│   phone      │     └──────────────┘     └──────────────┘
└──────────────┘

┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   drivers    │────▶│  deliveries  │     │driver_locations│
├──────────────┤     ├──────────────┤     ├──────────────┤
│ id (PK)      │     │ id (PK)      │     │ driver_id    │
│ name         │     │ order_id (FK)│     │ latitude     │
│ phone        │     │ driver_id    │     │ longitude    │
│ vehicle_id   │     │ status       │     │ recorded_at  │
│ rating       │     │ picked_up_at │     └──────────────┘
└──────────────┘     │ delivered_at │
                     └──────────────┘
```

### Índices Importantes

- `products`: Búsqueda full-text con `tsvector` y `pg_trgm`
- `suppliers`: Índice por ciudad para filtrado geográfico
- `driver_locations`: Índice por tiempo para GPS tracking
- `payments`: Índice por referencia única para verificación

---

## 💳 Pagos con Pago Móvil

### Flujo

```
1. Cliente crea orden (total USD)
            │
            ▼
2. Cliente inicia pago → genera referencia VROOM-XXXXXXXX
            │
            ▼
3. Sistema calcula monto BS: USD × tasa BCV × 1.02
            │
            ▼
4. Cliente recibe instrucciones:
   - Banco: Banco de Venezuela
   - Teléfono: 04141234567
   - Referencia: VROOM-A1B2C3D4
   - Monto: Bs 5,100.00
            │
            ▼
5. Cliente hace Pago Móvil manualmente
            │
            ▼
6. Cliente confirma en app → POST /payments/confirm
            │
            ▼
7. Sistema verifica referencia + monto
            │
            ▼
8. Orden cambia a "paid" → procesamiento
```

### Tasa BCV

El sistema consulta la tasa oficial del BCV:
- **URL**: `https://s3.amazonaws.com/assets.bcv.org.ve/servicio/VentaDolar`
- **Fallback**: Si el API falla, usa `BCV_FALLBACK_RATE` (default: 50 BS/USD)
- **Recargo**: +2% para cubrir fluctuaciones

---

## 🔌 Tiempo Real con Socket.io

### Eventos del Cliente

```javascript
// Suscribirse a actualizaciones de orden
socket.emit('order:subscribe', { orderId: 'uuid' });

// Recibir ubicación del repartidor
socket.on('driver:location', (data) => {
  console.log(data.latitude, data.longitude);
});

// Recibir cambio de estado
socket.on('status:changed', (data) => {
  console.log(data.status);
});
```

### Eventos del Repartidor (Driver App)

```javascript
// Enviar ubicación GPS
socket.emit('driver:location', {
  driverId: 'uuid',
  orderId: 'uuid',
  latitude: 10.4806,
  longitude: -66.9036,
  speed: 35,
  heading: 90
});

// Cambiar estado de entrega
socket.emit('status:change', {
  orderId: 'uuid',
  status: 'picked_up',
  description: 'Paquete recogido'
});
```

---

## 🐳 Docker

### Desarrollo Local

```bash
cd vroom-infra
docker-compose up -d

# Ver servicios
docker-compose ps

# Ver logs de un servicio
docker-compose logs -f api

# Detener
docker-compose down
```

### Producción con Dockerfile Multi-Stage

```dockerfile
# Build
docker build -t vroom-api:latest -f vroom-infra/Dockerfile .

# Run
docker run -p 3000:3000 \
  -e DATABASE_URL=postgresql://... \
  -e REDIS_URL=redis://... \
  vroom-api:latest
```

---

## 💻 Desarrollo

### Scripts Disponibles

```bash
npm run dev        # Desarrollo con hot-reload (tsx)
npm run build      # Compilar TypeScript
npm run start      # Producction (node dist/index.js)
npm run test       # Unit tests (vitest)
npm run test:watch # Tests en modo watch
```

### Testing

```bash
# Todos los tests
npm test

# Tests con coverage
npx vitest --coverage

# Tests en modo interactivo
npm run test:watch
```

### Estructura del Proyecto

```
vroom-api/
├── src/
│   ├── index.ts          # Entry point
│   ├── app.ts            # Fastify app setup
│   ├── plugins/
│   │   ├── db.ts         # PostgreSQL pool
│   │   └── redis.ts      # Redis client
│   ├── routes/
│   │   ├── auth.ts       # Autenticación OTP
│   │   ├── products.ts   # Búsqueda productos
│   │   ├── orders.ts     # Órdenes
│   │   └── payments.ts   # Pago Móvil
│   ├── services/
│   │   ├── search.service.ts   # Búsqueda con pg_trgm
│   │   ├── search.parser.ts    # Parser query natural
│   │   └── payment.service.ts  # Lógica Pago Móvil
│   ├── db/
│   │   └── migrations/
│   │       └── 001_initial.sql # Schema completo
│   ├── socket/
│   │   └── tracking.ts   # Socket.io GPS tracking
│   └── types/
│       └── index.ts      # TypeScript interfaces
├── tests/
│   └── auth.test.ts      # Unit tests
├── .env.example          # Template variables
└── package.json
```

---

## 📄 Licencia

MIT © 2024 VROOM Repuestos Express

---

## 👥 Contacto

- **GitHub**: [jesusgarevalo-ship-it](https://github.com/jesusgarevalo-ship-it)
- **Email**: jesus@vroom.ve

---

*Construido con ❤️ para Venezuela* 🇻🇪