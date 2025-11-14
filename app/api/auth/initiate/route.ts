import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";

/**
 * Manually initiate OAuth flow
 * This endpoint can be called to start the OAuth authorization process
 */
export async function GET(req: NextRequest) {
  const missingVars: string[] = [];
  if (!env.WHOP_CLIENT_ID) missingVars.push("WHOP_CLIENT_ID");
  if (!env.NEXT_PUBLIC_WHOP_REDIRECT_URL) missingVars.push("NEXT_PUBLIC_WHOP_REDIRECT_URL");
  
  if (missingVars.length > 0) {
    return NextResponse.json(
      { 
        error: "OAuth not configured",
        message: "Missing required environment variables",
        missing: missingVars,
        instructions: {
          step1: "Go to Vercel Dashboard → Your Project → Settings → Environment Variables",
          step2: "Add these variables:",
          variables: {
            WHOP_CLIENT_ID: "Get from Whop Apps Dashboard → Your App → OAuth Settings",
            NEXT_PUBLIC_WHOP_REDIRECT_URL: "https://linkvault-five.vercel.app/api/auth/callback",
          },
          step3: "Redeploy your app after adding variables",
        }
      },
      { status: 500 }
    );
  }

  // TypeScript: we've already checked these exist above
  const redirectUri = encodeURIComponent(env.NEXT_PUBLIC_WHOP_REDIRECT_URL!);
  const clientId = env.WHOP_CLIENT_ID!;
  
  // Build OAuth authorization URL
  const authUrl = `https://whop.com/oauth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=read write`;
  
  console.log("[OAuth Initiate] Redirecting to OAuth", {
    authUrl,
    redirectUri,
    clientId,
  });

  return NextResponse.redirect(authUrl);
}

