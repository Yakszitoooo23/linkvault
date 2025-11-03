import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * OAuth callback handler for Whop
 * Handles the OAuth code exchange and creates/updates the user session
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const code = searchParams.get("code");
    const error = searchParams.get("error");
    const state = searchParams.get("state");

    // Handle OAuth errors
    if (error) {
      console.error("OAuth error:", error);
      const redirectUrl = new URL(env.NEXT_PUBLIC_WHOP_REDIRECT_URL || "/");
      redirectUrl.searchParams.set("error", error);
      return NextResponse.redirect(redirectUrl.toString());
    }

    if (!code) {
      return NextResponse.json(
        { error: "Missing authorization code" },
        { status: 400 }
      );
    }

    // Check if OAuth environment variables are configured
    if (!env.WHOP_CLIENT_ID || !env.WHOP_CLIENT_SECRET || !env.NEXT_PUBLIC_WHOP_REDIRECT_URL) {
      console.error("OAuth not configured: Missing WHOP_CLIENT_ID, WHOP_CLIENT_SECRET, or NEXT_PUBLIC_WHOP_REDIRECT_URL");
      const redirectUrl = new URL("/");
      redirectUrl.searchParams.set("error", "oauth_not_configured");
      return NextResponse.redirect(redirectUrl.toString());
    }

    // Exchange code for access token
    const tokenResponse = await fetch("https://api.whop.com/api/v2/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: env.WHOP_CLIENT_ID,
        client_secret: env.WHOP_CLIENT_SECRET,
        code: code,
        redirect_uri: env.NEXT_PUBLIC_WHOP_REDIRECT_URL,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json().catch(() => ({}));
      console.error("Token exchange failed:", errorData);
      const redirectUrl = new URL(env.NEXT_PUBLIC_WHOP_REDIRECT_URL || "/");
      redirectUrl.searchParams.set("error", "token_exchange_failed");
      return NextResponse.redirect(redirectUrl.toString());
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, expires_in } = tokenData;

    // Fetch user info from Whop API
    const userResponse = await fetch("https://api.whop.com/api/v2/me", {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });

    if (!userResponse.ok) {
      console.error("Failed to fetch user info");
      const redirectUrl = new URL(env.NEXT_PUBLIC_WHOP_REDIRECT_URL || "/");
      redirectUrl.searchParams.set("error", "user_fetch_failed");
      return NextResponse.redirect(redirectUrl.toString());
    }

    const whopUser = await userResponse.json();

    // Create or update user in database
    const user = await prisma.user.upsert({
      where: { whopUserId: whopUser.id },
      create: {
        whopUserId: whopUser.id,
        role: "seller", // Default role, can be adjusted based on Whop permissions
      },
      update: {},
    });

    // TODO: Store access_token, refresh_token, and expires_in in a session/cookie
    // For now, we'll redirect with the user info in the URL (not secure for production)
    // In production, use secure httpOnly cookies or a session store

    const redirectUrl = new URL(env.NEXT_PUBLIC_WHOP_REDIRECT_URL || "/experience");
    redirectUrl.searchParams.set("success", "true");
    redirectUrl.searchParams.set("userId", user.id);

    // Set a session cookie (you may want to use a proper session library)
    const response = NextResponse.redirect(redirectUrl.toString());
    response.cookies.set("whop_user_id", user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: expires_in || 3600,
    });

    return response;
  } catch (e: any) {
    console.error("OAuth callback error:", e);
    const redirectUrl = new URL(env.NEXT_PUBLIC_WHOP_REDIRECT_URL || "/");
    redirectUrl.searchParams.set("error", "internal_error");
    return NextResponse.redirect(redirectUrl.toString());
  }
}

