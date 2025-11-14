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
    const { userId, companyId, email, appId, ...rest } = tokenData as {
      userId?: string;
      companyId?: string;
      email?: string;
      appId?: string;
      [key: string]: unknown;
    };

    if (!userId) {
      console.warn("[whopAuth] Token validated but missing userId", { tokenData });
      return null;
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

