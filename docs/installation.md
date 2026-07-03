# Node-X Private Cloud Storage - Installation Guide

This guide outlines deployment steps using Docker Compose (Recommended) or PM2 (Process Manager).

---

## 1. Deploying via Docker Compose

### Prerequisites
- Docker & Docker Compose installed.
- SSL Certificates for `node-x.my.id` (place `fullchain.pem` and `privkey.pem` in `nginx/certs/`).

### Setup Steps
1. Navigate to the root directory containing `docker-compose.yml`.
2. Build and start containers:
   ```bash
   docker-compose up --build -d
   ```
3. Run Prisma Migrations inside backend container to initialize Database:
   ```bash
   docker exec -it node-x-backend npx prisma db push
   ```
4. Check running containers:
   ```bash
   docker-compose ps
   ```

Default seeding:
- **Admin Email**: `admin@node-x.my.id`
- **Admin Password**: `adminpassword` (Please change this in settings console upon entry).

---

## 2. Deploying via PM2 (Bare Metal/VPS)

### Prerequisites
- Node.js v20+ & npm installed.
- PostgreSQL database server running.

### Backend Setup
1. Enter the `backend/` directory.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create `.env` file referencing your PostgreSQL credentials:
   ```ini
   DATABASE_URL="postgresql://user:pass@localhost:5432/node_x_db"
   JWT_SECRET="generate-some-random-salt-keys"
   ```
4. Push Prisma schema structures to DB:
   ```bash
   npx prisma generate
   npx prisma db push
   ```
5. Build and launch:
   ```bash
   npm run build
   pm2 start dist/index.js --name "node-x-backend"
   ```

### Frontend Setup
1. Enter the `frontend/` directory.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create `.env.local` to direct traffic:
   ```ini
   NEXT_PUBLIC_BACKEND_URL="http://localhost:4000"
   ```
4. Build and start application:
   ```bash
   npm run build
   pm2 start "npm run start" --name "node-x-frontend"
   ```
