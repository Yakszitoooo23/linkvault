export const env = {
  // Database
  DATABASE_URL: process.env.DATABASE_URL!,
  
  // Whop OAuth & API (optional - only needed when using OAuth/checkout)
  WHOP_CLIENT_ID: process.env.WHOP_CLIENT_ID,
  WHOP_CLIENT_SECRET: process.env.WHOP_CLIENT_SECRET,
  WHOP_APP_ID: process.env.WHOP_APP_ID,
  NEXT_PUBLIC_WHOP_REDIRECT_URL: process.env.NEXT_PUBLIC_WHOP_REDIRECT_URL,
  WHOP_API_KEY: process.env.WHOP_API_KEY,
  WHOP_WEBHOOK_SECRET: process.env.WHOP_WEBHOOK_SECRET,
  
  // AvaStorage (S3-compatible) / Cloudflare R2 - optional
  FILE_BUCKET: process.env.FILE_BUCKET,
  FILE_REGION: process.env.FILE_REGION,
  FILE_ACCESS_KEY_ID: process.env.FILE_ACCESS_KEY_ID,
  FILE_SECRET_ACCESS_KEY: process.env.FILE_SECRET_ACCESS_KEY,
  FILE_ENDPOINT: process.env.FILE_ENDPOINT, // Required for Cloudflare R2
  R2_PUBLIC_BASE: process.env.R2_PUBLIC_BASE, // Required for Cloudflare R2 public URLs
  
  // Supabase (optional, for image storage)
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_COVERS: process.env.SUPABASE_COVERS,
  SUPABASE_BUCKET: process.env.SUPABASE_BUCKET,
  
  // App settings
  APP_FEE_BPS: Number(process.env.APP_FEE_BPS ?? "500"),
};
