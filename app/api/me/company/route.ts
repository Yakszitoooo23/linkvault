import { NextRequest, NextResponse } from "next/server";
import { verifyWhopUser } from "@/lib/whopAuth";
import { prisma } from "@/lib/db";

/**
 * Get the companyId for the currently logged-in user
 * Uses iframe auth (x-whop-user-token) to identify the user
 * Returns the user's companyId from the database
 */
export async function GET(req: NextRequest) {
  try {
    // Verify user from iframe token
    const whopUser = await verifyWhopUser();
    if (!whopUser) {
      return NextResponse.json(
        {
          error: "Authentication required",
          details: "Invalid or missing Whop user token. Please ensure you're accessing this app from within Whop.",
        },
        { status: 401 }
      );
    }

    // Find user in database with company relation
    const user = await prisma.user.findUnique({
      where: { whopUserId: whopUser.userId },
      include: {
        company: {
          select: {
            id: true,
            whopCompanyId: true,
            name: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        {
          error: "User not found",
          details: "No user record found for this Whop account. Please contact support.",
        },
        { status: 404 }
      );
    }

    // Check if user has a companyId
    if (!user.companyId) {
      return NextResponse.json(
        {
          error: "No company associated",
          details: "This user is not associated with a company. Please contact support or use the dashboard URL with companyId.",
        },
        { status: 404 }
      );
    }

    // Return the companyId (Whop company ID, not our internal ID)
    if (!user.company) {
      return NextResponse.json(
        {
          error: "Company not found",
          details: "User has companyId but company record is missing. Please contact support.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      companyId: user.company.whopCompanyId, // Return Whop company ID (biz_xxx)
      companyName: user.company.name,
    });
  } catch (error) {
    console.error("[api/me/company] Error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

