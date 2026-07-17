# Deploy Bread Route Manager: Vercel + Railway

This package is configured for a Vercel React/Vite frontend, Railway Express API, Railway PostgreSQL, and a Railway volume for persistent uploads.

## 1. Put the project on GitHub

Create a new GitHub repository and upload the contents of this folder. Keep `client` and `server` in the same repository.

## 2. Deploy the backend on Railway

1. Create a Railway project.
2. Add **PostgreSQL** from `+ New` → `Database` → `PostgreSQL`.
3. Add a service from the GitHub repository.
4. Set its **Root Directory** to `/server`.
5. Add these service variables:

```text
DATABASE_URL=${{Postgres.DATABASE_URL}}
JWT_SECRET=<a long random secret>
OPENAI_API_KEY=<optional OpenAI key>
CLIENT_ORIGIN=https://YOUR-VERCEL-PROJECT.vercel.app
ALLOW_VERCEL_PREVIEWS=true
UPLOAD_DIR=/data/uploads
```

6. Add a Railway volume and mount it at `/data`.
7. Generate a public domain in the API service's Networking settings.
8. Test `https://YOUR-RAILWAY-DOMAIN.up.railway.app/api/health`.

Railway uses `server/Dockerfile` and `server/railway.json`. At startup it runs `prisma db push`, seeds missing demo accounts/data, and starts the API.

## 3. Deploy the frontend on Vercel

1. Import the same GitHub repository in Vercel.
2. Set **Root Directory** to `client`.
3. Select the **Vite** framework preset.
4. Add this environment variable to Production and Preview:

```text
VITE_API_URL=https://YOUR-RAILWAY-DOMAIN.up.railway.app/api
```

5. Deploy and copy the final Vercel URL.
6. In Railway, set `CLIENT_ORIGIN` to that exact Vercel URL and redeploy the API.

## Demo accounts

Manager: `manager@bread.local` / `Manager123!`

Driver: `driver@bread.local` / `Driver123!`

Change these passwords before real use.

## Production notes

- PostgreSQL replaces the local SQLite database.
- Invoices and delivery photos persist in `/data/uploads` on the Railway volume.
- Keep `OPENAI_API_KEY` only in Railway, never in Vercel or frontend code.
- `VITE_API_URL` is compiled at build time, so redeploy Vercel after changing it.
