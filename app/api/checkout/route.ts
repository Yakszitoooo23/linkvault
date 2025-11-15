import { NextRequest, NextResponse } from "next/server";

/**
 * DEPRECATED: This route is no longer used.
 * 
 * Use POST /api/products/[id]/checkout instead, which is the single source of truth
 * for creating checkout sessions.
 * 
 * This route is kept for backward compatibility but should not be called by new code.
 */
export async function POST(req: NextRequest) {
  return NextResponse.json(
    {
      error: "This endpoint is deprecated",
      details: "Please use POST /api/products/[id]/checkout instead.",
    },
    { status: 410 } // 410 Gone
  );
}
