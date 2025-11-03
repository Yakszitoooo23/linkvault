# Whop DigiSell Starter (Next.js + Prisma + S3 + Webhooks)

This is a ready-to-deploy starter for a DigiSell-style app embedded in **Whop**:
- App Router (Next.js 14)
- Prisma (PostgreSQL)
- S3/R2 presigned uploads & downloads
- Whop Webhook verification (payment.succeeded / refunded)
- Minimal Discover + Experience pages

## 1) Local Setup

1. Install Node.js LTS
2. Install pnpm: `npm i -g pnpm`
3. Install deps: `pnpm install`
4. Create `.env.local` (see below)
5. Run: `pnpm dev`

## 2) Environment variables

Create `.env.local` with:

```
# Database (Postgres; e.g., Neon or Vercel Postgres)
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DB?sslmode=require

# Whop OAuth & API
WHOP_CLIENT_ID=your_whop_client_id
WHOP_CLIENT_SECRET=your_whop_client_secret
WHOP_APP_ID=your_whop_app_id
NEXT_PUBLIC_WHOP_REDIRECT_URL=https://your-vercel-domain.vercel.app/api/auth/callback
WHOP_API_KEY=your_whop_api_key_here
WHOP_WEBHOOK_SECRET=your_webhook_secret_here

# Storage (S3 or Cloudflare R2 S3-compatible)
FILE_BUCKET=your-bucket
FILE_REGION=us-east-1
FILE_ACCESS_KEY_ID=your_key_id
FILE_SECRET_ACCESS_KEY=your_secret_key

# Supabase (optional, for image storage - recommended for production)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_COVERS=covers
SUPABASE_BUCKET=covers

# App fee in basis points (5% = 500)
APP_FEE_BPS=500
```

Then generate the Prisma client and run migrations:
```
pnpm prisma:generate
pnpm prisma:migrate
```

> For local dev only you can switch Prisma to SQLite if you prefer. In production use Postgres.

## 3) Vercel Deployment

1. Push this repo to GitHub.
2. In Vercel, click **New Project → Import** your repo.
3. When prompted, set **Environment Variables** as above.
4. **Build command**: `pnpm build` (default is fine)
5. **Install command**: `pnpm install` (default is fine)
6. **Output directory**: `.next` (default)
7. After first deploy, run **Prisma migrate** via build step (already included) or a one-time console migration.

### Whop App Settings
- **Discover URL**: `https://YOUR_DOMAIN/discover`
- **Experience URL**: `https://YOUR_DOMAIN/experience`
- **OAuth Callback URL**: `https://YOUR_DOMAIN/api/auth/callback`
- **Webhook URL**: `https://YOUR_DOMAIN/api/webhook`

## 4) Features
- ✅ OAuth callback handler at `/api/auth/callback` for Whop authentication
- ✅ Checkout integration at `/api/checkout` - creates Whop checkout sessions (falls back to dev mode if API key not configured)
- ✅ Webhook endpoint at `/api/webhook` for handling payment events
- ✅ Error pages (404 and 500) with LinkVault branding
- ✅ Production-safe image uploads (requires Supabase in production, local only in development)

## 5) Security Notes
- Always verify webhook signatures (already implemented)
- Only serve downloads via short-lived presigned URLs
- Add auth/role checks (owner for product create; purchaser for downloads)
