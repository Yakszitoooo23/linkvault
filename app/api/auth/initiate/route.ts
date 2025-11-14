import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";

/**
 * Manually initiate OAuth flow
 * This endpoint can be called to start the OAuth authorization process
 */
export async function GET(req: NextRequest) {
  if (!env.WHOP_CLIENT_ID || !env.NEXT_PUBLIC_WHOP_REDIRECT_URL) {
    return NextResponse.json(
      { error: "OAuth not configured" },
      { status: 500 }
    );
  }

  const redirectUri = encodeURIComponent(env.NEXT_PUBLIC_WHOP_REDIRECT_URL);
  const clientId = env.WHOP_CLIENT_ID;
  
  // Build OAuth authorization URL
  const authUrl = `https://whop.com/oauth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=read write`;
  
  console.log("[OAuth Initiate] Redirecting to OAuth", {
    authUrl,
    redirectUri,
    clientId,
  });

  return NextResponse.redirect(authUrl);
}

