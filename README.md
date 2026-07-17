# Bread Route Manager — Phase 4 Complete Product

A runnable manager-and-driver delivery operations application for daily bread routes.

## Product modules

### Phase 1 — Foundation
- Manager and driver authentication
- Daily invoice PDF/image upload
- OpenAI structured invoice extraction with demo fallback
- Extraction review and customer/address approval
- SQLite/Prisma database

### Phase 2 — Visual dispatch
- Map-style dispatch board
- Drag-and-drop stop assignment
- 5–6 hour workload balancing
- Driver targets, box capacity, invoice value and service-time estimates
- Route ordering and optimization

### Phase 3 — Driver execution
- Installable mobile PWA
- Live GPS pings and manager tracking
- Turn-by-turn Google Maps launch
- Arrived, en-route, delivered and issue workflows
- Proof-of-delivery camera uploads
- Offline status queue

### Phase 4 — Reporting and deployment
- Daily KPI dashboard
- Per-driver scorecards
- Short delivery, issue and missing-proof alerts
- Stop-by-stop delivery audit
- 30-day activity chart
- Authenticated CSV report export
- Docker production deployment

## Local development

Requires Node.js 20+.

```bash
cp server/.env.example server/.env
npm run setup
npm run dev
```

Open `http://localhost:5173`.

Manager: `manager@bread.local` / `Manager123!`

Driver: `driver@bread.local` / `Driver123!`

## Docker deployment

```bash
cp .env.production.example .env
# Add a strong JWT_SECRET and optional OPENAI_API_KEY
docker compose up --build -d
```

Open `http://localhost:8080`.

## Production notes

- Change all demo passwords before real use.
- Use HTTPS for phone GPS and camera permissions.
- Replace SQLite with PostgreSQL for multi-warehouse/high-concurrency deployments.
- Configure durable object storage such as S3/R2 for proof photos.
- Connect Google Maps Platform or Mapbox for road-accurate geocoding and routing.
- Restrict `CLIENT_ORIGIN` to the production domain.
