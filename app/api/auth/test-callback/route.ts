import { NextRequest, NextResponse } from "next/server";

/**
 * Test endpoint to verify OAuth callback route is accessible
 * Visit: https://linkvault-five.vercel.app/api/auth/test-callback
 */
export async function GET(req: NextRequest) {
  return NextResponse.json({
    message: "OAuth callback route is accessible",
    callbackUrl: "/api/auth/callback",
    timestamp: new Date().toISOString(),
    instructions: [
      "1. Make sure NEXT_PUBLIC_WHOP_REDIRECT_URL is set to: https://linkvault-five.vercel.app/api/auth/callback",
      "2. Make sure this same URL is set in Whop Dashboard → OAuth Settings",
      "3. When you install the app, you should be redirected to this callback URL",
      "4. Check Vercel logs for entries starting with '[OAuth Callback]'",
    ],
  });
}

