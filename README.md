# Bread Route Manager

A full-stack warehouse and delivery operations platform built around a real bread-distribution workflow.

## Completed modules

- JWT authentication with Manager, Packer, Picker and Driver roles
- Manager route creation and staff assignment API
- Bread-wise packing board with customer quantities
- Done and shortage tracking with notes
- Customer-wise picker workflow
- Mobile-friendly driver stop list
- Google Maps navigation links
- Arrived, delivered and issue statuses
- Proof-of-delivery photo uploads
- Invoice/loading-sheet upload and extraction-review workflow
- Manager approval endpoint for extracted route data
- Dashboard KPIs and shortage reporting
- Authenticated CSV export
- SQLite and Prisma persistence
- Seeded realistic Route 0202 demo
- Docker deployment
- Native Node API tests
- GitHub Actions CI

## Demo accounts

All demo accounts use password `Demo123!`.

| Role | Email |
|---|---|
| Manager | manager@bread.local |
| Packer | packer@bread.local |
| Picker | picker@bread.local |
| Driver | driver@bread.local |

## Run locally

Requires Node.js 20+.

```bash
git clone https://github.com/patnamvignesh/bread-route-manager.git
cd bread-route-manager
cp .env.example .env
npm install
npm run db:setup
npm run dev
```

Open `http://localhost:3000`.

## Run tests

```bash
npm test
```

## Run with Docker

```bash
docker build -t bread-route-manager .
docker run --rm -p 3000:3000 \
  -e DATABASE_URL="file:./production.db" \
  -e JWT_SECRET="replace-with-a-long-random-secret" \
  bread-route-manager
```

## Main API areas

- `/api/auth/*` — login and current user
- `/api/routes/*` — route operations and assignments
- `/api/order-items/*` — packing updates
- `/api/customers/*` — picking, delivery and proof photos
- `/api/documents/*` — uploaded invoice review and approval
- `/api/reports/*` — dashboard, shortages and CSV export

## Production hardening

Before using this for a real warehouse:

- Replace all demo credentials and the JWT secret.
- Use HTTPS for camera and location permissions.
- Replace SQLite with PostgreSQL for multi-user production use.
- Store proof photos in S3, Cloudflare R2 or equivalent object storage.
- Connect a dedicated OCR/document extraction provider and require manager review.
- Add automated backups, audit logging and warehouse-level tenant isolation.

## Portfolio value

This project demonstrates full-stack API design, relational data modeling, authentication, role-based authorization, file uploads, operational workflow design, reporting, testing, CI and container deployment.
