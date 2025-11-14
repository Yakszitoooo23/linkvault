import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { validateToken } from "@whop-apps/sdk";

import { prisma } from "@/lib/db";

/**
 * Check OAuth status for the current user
 * This endpoint helps diagnose if OAuth completed successfully
 */
export async function GET(req: NextRequest) {
  try {
    const tokenData = await validateToken({ headers: headers() });
    const { userId: whopUserId } = (tokenData || {}) as {
      userId?: string;
      [key: string]: unknown;
    };

    if (!whopUserId) {
      return NextResponse.json({
        status: "not_authenticated",
        message: "No user ID found in token",
      });
    }

    // Find user in database
    const user = await prisma.user.findUnique({
      where: { whopUserId },
      select: {
        id: true,
        whopUserId: true,
        whopProductId: true,
        whopAccessToken: true,
        whopRefreshToken: true,
        tokenExpiresAt: true,
        companyId: true,
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({
        status: "user_not_found",
        message: "User not found in database",
        whopUserId,
        action: "Run OAuth flow to create user",
      });
    }

    const hasTokens = !!(user.whopAccessToken && user.whopRefreshToken);
    const hasProduct = !!user.whopProductId;
    const tokenExpired = user.tokenExpiresAt
      ? user.tokenExpiresAt.getTime() <= Date.now()
      : null;

    return NextResponse.json({
      status: hasTokens && hasProduct ? "ready" : "incomplete",
      user: {
        id: user.id,
        whopUserId: user.whopUserId,
        hasAccessToken: !!user.whopAccessToken,
        hasRefreshToken: !!user.whopRefreshToken,
        hasProduct: hasProduct,
        whopProductId: user.whopProductId,
        tokenExpired,
        tokenExpiresAt: user.tokenExpiresAt?.toISOString(),
        createdAt: user.createdAt.toISOString(),
      },
      issues: [
        !hasTokens && "Missing OAuth tokens - run OAuth flow",
        !hasProduct && "Missing Whop product ID - OAuth may have failed",
        tokenExpired && "Access token expired - needs refresh",
      ].filter(Boolean),
      nextSteps: !hasTokens
        ? [
            "Visit: https://linkvault-five.vercel.app/api/auth/initiate",
            "Complete OAuth authorization",
            "Check this endpoint again to verify tokens were saved",
          ]
        : !hasProduct
        ? [
            "OAuth tokens exist but product creation failed",
            "Check Vercel logs for '[OAuth Callback] Failed to create Whop product'",
            "You may need to manually create the product",
          ]
        : ["Everything looks good! You should be able to create products."],
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

