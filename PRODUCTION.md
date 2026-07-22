# Production deployment and operations

## Required configuration

- Set a strong `JWT_SECRET` of at least 32 random characters.
- Set `OPENAI_API_KEY` only when image-ticket OCR is enabled.
- Persist the `uploads/`, `backups/`, and SQLite database directories with durable storage.
- Terminate TLS/HTTPS at the hosting platform or reverse proxy.
- Change all seeded demo passwords before allowing warehouse users to sign in.

## Document processing

Text-based Rockland Bakery PDFs are parsed directly with `pdf-parse` and the format-specific parser. Image tickets can be sent through `src/ocrService.js`. Image-only PDFs require a page-rendering worker before the page images are sent to OCR. Every low-confidence extraction must stay in manager review; it must not be imported automatically.

## Daily backup

Run:

```bash
npm run backup
```

Schedule it daily and copy the output to durable off-site storage. PostgreSQL deployments should replace this with encrypted `pg_dump` backups and a tested restore procedure.

## Monitoring

Monitor `/api/health`, HTTP 5xx responses, storage consumption, failed document imports, average extraction confidence, undelivered stops, and missing proof photos. Configure alerts outside the application through the hosting provider.

## Security checklist

- HTTPS only
- restricted CORS origin
- private object storage for delivery proof
- least-privilege manager accounts
- password rotation
- no production demo accounts
- upload size and MIME validation
- retention policy for customer phone numbers and delivery photos
- dependency and container scanning in CI

## Release verification

1. Run `npm install`.
2. Copy `.env.example` to `.env` and configure secrets.
3. Run `npm run db:setup`.
4. Run `npm test`.
5. Upload a known Rockland PDF and compare the preview against the source ticket.
6. Import only selected tickets and confirm duplicate-ticket protection.
7. Test packer, picker, driver and manager permissions separately.
8. Test a database backup and restore before going live.

## Known deployment boundary

The repository contains the application and OCR integration point. Reliable OCR for image-only multi-page PDFs also needs an external PDF page-rendering service or worker. Cloud credentials, domains, TLS, storage, alerts and database backups are deployment-environment responsibilities and cannot be embedded safely in the public repository.
