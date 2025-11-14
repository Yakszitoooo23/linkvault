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

    // Safe logging: redact sensitive fields, show all IDs
    const safeTokenData: Record<string, unknown> = {};
    const sensitiveFields = ['email', 'token', 'secret', 'password', 'access_token', 'refresh_token'];
    
    for (const [key, value] of Object.entries(tokenData)) {
      if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
        // Redact sensitive fields
        safeTokenData[key] = value && typeof value === 'string' && value.length > 0 
          ? `${value.substring(0, 3)}***` 
          : '***';
      } else {
        safeTokenData[key] = value;
      }
    }

    // Log all token claims for debugging
    console.log("[whopAuth] Raw claims from x-whop-user-token", {
      allKeys: Object.keys(tokenData),
      claims: safeTokenData,
      // Explicitly log common ID fields
      userId: (tokenData as any).userId,
      companyId: (tokenData as any).companyId,
      company_id: (tokenData as any).company_id,
      experienceId: (tokenData as any).experienceId,
      experience_id: (tokenData as any).experience_id,
      appId: (tokenData as any).appId,
      app_id: (tokenData as any).app_id,
    });

    // Extract user info from token
    // NOTE: companyId might be in different fields - check common variations
    const token = tokenData as {
      userId?: string;
      companyId?: string;
      company_id?: string; // Some APIs use snake_case
      experienceId?: string;
      experience_id?: string;
      email?: string;
      appId?: string;
      app_id?: string;
      [key: string]: unknown;
    };

    const userId = token.userId;
    // Try both companyId and company_id (some APIs use snake_case)
    let companyId = token.companyId || token.company_id;
    const email = token.email;
    const appId = token.appId || token.app_id;
    const experienceId = token.experienceId || token.experience_id;
    const { userId: _, companyId: __, company_id: ___, email: ____, appId: _____, app_id: ______, experienceId: _______, experience_id: ________, ...rest } = token;

    if (!userId) {
      console.warn("[whopAuth] Token validated but missing userId", { 
        tokenKeys: Object.keys(token),
        tokenData: safeTokenData,
      });
      return null;
    }

    // Fallback companyId strategy: use env var if token doesn't have it
    if (!companyId && env.WHOP_FALLBACK_COMPANY_ID) {
      companyId = env.WHOP_FALLBACK_COMPANY_ID;
      console.log("[whopAuth] Using fallback companyId from env", {
        fallbackCompanyId: companyId,
        note: "Token contained no companyId",
        tokenKeys: Object.keys(token),
      });
    }

    // Log if companyId is still missing - this is important for product creation
    if (!companyId) {
      console.warn("[whopAuth] ⚠️ Token validated but companyId is missing and no fallback configured", {
        userId,
        tokenKeys: Object.keys(token),
        hasFallback: !!env.WHOP_FALLBACK_COMPANY_ID,
        note: "This may cause issues with Whop product creation",
      });
    }

    return {
      userId,
      companyId,
      email,
      appId,
      experienceId,
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

