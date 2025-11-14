import { headers } from "next/headers";
import { validateToken } from "@whop-apps/sdk";
import { env } from "./env";

export type WhopUser = {
  userId: string;
  companyId?: string;
  email?: string;
  appId?: string;
  [key: string]: unknown;
};

/**
 * Verify Whop user from iframe token
 * Reads x-whop-user-token header and validates it using @whop-apps/sdk
 * 
 * @returns WhopUser object with userId, companyId, etc., or null if invalid
 */
export async function verifyWhopUser(): Promise<WhopUser | null> {
  try {
    const requestHeaders = headers();
    
    // validateToken from @whop-apps/sdk reads x-whop-user-token header automatically
    const tokenData = await validateToken({ headers: requestHeaders });
    
    if (!tokenData) {
      return null;
    }

    // Extract user info from token
    // NOTE: companyId might be in different fields - check common variations
    const token = tokenData as {
      userId?: string;
      companyId?: string;
      company_id?: string; // Some APIs use snake_case
      email?: string;
      appId?: string;
      [key: string]: unknown;
    };

    const userId = token.userId;
    // Try both companyId and company_id (some APIs use snake_case)
    const companyId = token.companyId || token.company_id;
    const email = token.email;
    const appId = token.appId;
    const { userId: _, companyId: __, company_id: ___, email: ____, appId: _____, ...rest } = token;

    if (!userId) {
      console.warn("[whopAuth] Token validated but missing userId", { 
        tokenKeys: Object.keys(token),
        tokenData,
      });
      return null;
    }

    // Log if companyId is missing - this is important for product creation
    if (!companyId) {
      console.warn("[whopAuth] ⚠️ Token validated but companyId is missing", {
        userId,
        tokenKeys: Object.keys(token),
        note: "This may cause issues with Whop product creation",
      });
    }

    return {
      userId,
      companyId,
      email,
      appId,
      ...rest,
    };
  } catch (error) {
    console.error("[whopAuth] Token validation failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Verify that required app permissions are configured
 * Checks if WHOP_API_KEY exists and has necessary permissions
 * 
 * @returns true if permissions are configured, false otherwise
 */
export function verifyAppPermissions(): {
  hasApiKey: boolean;
  hasAppId: boolean;
  missing: string[];
} {
  const hasApiKey = !!env.WHOP_API_KEY;
  const hasAppId = !!env.WHOP_APP_ID;
  
  const missing: string[] = [];
  if (!hasApiKey) missing.push("WHOP_API_KEY");
  if (!hasAppId) missing.push("WHOP_APP_ID");

  return {
    hasApiKey,
    hasAppId,
    missing,
  };
}

/**
 * Get App API Key for server-side API calls
 * 
 * @returns App API Key or null if not configured
 */
export function getAppApiKey(): string | null {
  return env.WHOP_API_KEY || null;
}

