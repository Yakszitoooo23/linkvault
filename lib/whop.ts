import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

const WHOP_V2_TOKEN_ENDPOINT = "https://api.whop.com/api/v2/oauth/token";
const WHOP_V5_API_BASE = "https://api.whop.com/api/v5";
const TOKEN_EXPIRY_GRACE_PERIOD_MS = 60 * 1000;

export class WhopApiError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "WhopApiError";
    this.status = status;
    this.details = details;
  }
}

export type CompanyTokenBundle = {
  id: string;
  whopAccessToken: string | null;
  whopRefreshToken: string | null;
  tokenExpiresAt: Date | null;
};

async function parseResponseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function ensureCompanyAccessToken(company: CompanyTokenBundle): Promise<string> {
  if (!company.whopAccessToken) {
    throw new Error("Company does not have a Whop access token");
  }

  const expiresAt = company.tokenExpiresAt ? new Date(company.tokenExpiresAt) : null;
  const now = Date.now();
  if (expiresAt && expiresAt.getTime() - TOKEN_EXPIRY_GRACE_PERIOD_MS > now) {
    return company.whopAccessToken;
  }

  if (!company.whopRefreshToken) {
    throw new Error("Company Whop access token expired and refresh token is unavailable");
  }

  if (!env.WHOP_CLIENT_ID || !env.WHOP_CLIENT_SECRET) {
    throw new Error("Whop OAuth client credentials are not configured");
  }

  const response = await fetch(WHOP_V2_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: company.whopRefreshToken,
      client_id: env.WHOP_CLIENT_ID,
      client_secret: env.WHOP_CLIENT_SECRET,
    }),
  });

  if (!response.ok) {
    const payload = await parseResponseJson(response);
    console.error("Failed to refresh Whop access token", {
      companyId: company.id,
      status: response.status,
      payload,
    });
    throw new Error("Failed to refresh Whop access token");
  }

  const tokenData = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };

  const newExpiresAt = new Date(Date.now() + ((tokenData.expires_in ?? 3600) * 1000));

  const updated = await prisma.company.update({
    where: { id: company.id },
    data: {
      whopAccessToken: tokenData.access_token,
      whopRefreshToken: tokenData.refresh_token ?? company.whopRefreshToken,
      tokenExpiresAt: newExpiresAt,
    },
    select: {
      whopAccessToken: true,
      whopRefreshToken: true,
      tokenExpiresAt: true,
    },
  });

  company.whopAccessToken = updated.whopAccessToken;
  company.whopRefreshToken = updated.whopRefreshToken;
  company.tokenExpiresAt = updated.tokenExpiresAt;

  if (!updated.whopAccessToken) {
    throw new Error("Failed to refresh access token");
  }

  return updated.whopAccessToken;
}

export async function createCompanyPlan({
  accessToken,
  whopProductId,
  priceCents,
  currency,
  releaseMethod = "buy_now",
  visibility = "visible",
  metadata,
}: {
  accessToken: string;
  whopProductId: string;
  priceCents: number;
  currency: string;
  releaseMethod?: "buy_now" | "waitlist";
  visibility?: "visible" | "hidden";
  metadata?: Record<string, unknown>;
}): Promise<string> {
  // Convert cents to dollars for Whop API
  const amountInDollars = priceCents / 100;
  
  console.log("[createCompanyPlan] Price conversion", {
    priceCents,
    amountInDollars,
    currency,
  });

  const response = await fetch(`${WHOP_V5_API_BASE}/plans`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      product_id: whopProductId,
      plan_type: "one_time",
      initial_price: amountInDollars,
      currency,
      release_method: releaseMethod,
      visibility,
      metadata,
    }),
  });

  if (!response.ok) {
    const payload = await parseResponseJson(response);
    throw new WhopApiError(
      "Failed to create Whop plan",
      response.status,
      payload
    );
  }

  const plan = (await response.json()) as { id?: string };
  if (!plan.id) {
    throw new Error("Whop plan creation response did not include an id");
  }

  return plan.id;
}

export async function createCompanyCheckoutConfiguration({
  accessToken,
  planId,
  successUrl,
  cancelUrl,
  metadata,
}: {
  accessToken: string;
  planId: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const response = await fetch(`${WHOP_V5_API_BASE}/checkout_configurations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      plan_id: planId,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata,
    }),
  });

  if (!response.ok) {
    const payload = await parseResponseJson(response);
    throw new WhopApiError(
      "Failed to create Whop checkout configuration",
      response.status,
      payload
    );
  }

  const config = (await response.json()) as { id?: string };
  if (!config.id) {
    throw new Error("Whop checkout configuration response did not include an id");
  }

  return config.id;
}

/**
 * Create a Whop checkout configuration with an inline plan for a LinkVault product.
 * Uses App API Key (WHOP_API_KEY) and creates the plan inline in the checkout configuration.
 * 
 * Required permissions: checkout_configuration:create, plan:create, access_pass:create, access_pass:update
 */
export type CreateCheckoutConfigParams = {
  companyId: string;        // biz_xxx
  priceCents: number;
  currency: string;         // "USD"
  productId: string;        // LinkVault product ID
  productTitle?: string;    // Optional product title
  whopUserId?: string;      // Optional creator's whopUserId
  creatorUserId?: string;   // Optional our internal User.id
};

export async function createCheckoutConfigurationForProduct(
  params: CreateCheckoutConfigParams
): Promise<{
  checkoutConfigId: string;
  planId: string;
  purchaseUrl: string;
  raw: unknown;
}> {
  const { companyId, priceCents, currency, productId, productTitle, whopUserId, creatorUserId } = params;

  const appApiKey = env.WHOP_API_KEY;
  if (!appApiKey) {
    throw new Error("WHOP_API_KEY is not configured");
  }

  // Convert cents to dollars for Whop API
  const amountInDollars = priceCents / 100;
  const currencyLower = (currency ?? "USD").toLowerCase();

  // Use the correct v1 endpoint as per Whop docs
  const endpoint = "https://api.whop.com/api/v1/checkout_configurations";

  // Log price conversion for debugging
  console.log("[createCheckoutConfigurationForProduct] price debug", {
    priceCents,
    amountInDollars,
    currency: currencyLower,
  });

  // Log request details
  console.log("[createCheckoutConfigurationForProduct] Creating checkout configuration", {
    endpoint,
    companyId: companyId || "MISSING",
    hasCompanyId: !!companyId,
    productId: productId || "MISSING",
    hasProductId: !!productId,
    priceCents: priceCents || "MISSING",
    hasPriceCents: typeof priceCents === "number",
    currency: currencyLower || "MISSING",
  });

  // Build request body matching Whop docs format
  const body: Record<string, unknown> = {
    plan: {
      company_id: companyId,
      visibility: "visible",
      plan_type: "one_time",
      release_method: "buy_now",
      currency: currencyLower,
      initial_price: amountInDollars,
    },
    metadata: {
      productId,
      companyId,
      source: "linkvault",
    },
  };

  // Add optional fields
  if (productTitle) {
    (body.plan as Record<string, unknown>).title = productTitle;
  }
  if (whopUserId) {
    (body.metadata as Record<string, unknown>).whopUserId = whopUserId;
  }
  if (creatorUserId) {
    (body.metadata as Record<string, unknown>).userId = creatorUserId;
  }

  console.log("[createCheckoutConfigurationForProduct] Request body", {
    plan: body.plan,
    metadata: body.metadata,
    hasApiKey: !!appApiKey,
    apiKeyLength: appApiKey.length,
  });

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${appApiKey}`,
    },
    body: JSON.stringify(body),
  });

  const responseText = await res.text();
  
  // Log response details
  const truncatedBody = responseText.length > 500 
    ? responseText.substring(0, 500) + "..." 
    : responseText;
  
  console.log("[createCheckoutConfigurationForProduct] Whop API response", {
    status: res.status,
    statusText: res.statusText,
    bodyLength: responseText.length,
    bodyPreview: truncatedBody,
    endpoint,
    companyId,
    productId,
  });

  if (!res.ok) {
    console.error("[createCheckoutConfigurationForProduct] Whop error", {
      status: res.status,
      statusText: res.statusText,
      body: truncatedBody,
      companyId,
      productId,
      endpoint,
    });
    throw new Error(
      `Failed to create Whop checkout configuration (${res.status}): ${truncatedBody}`
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(responseText);
  } catch {
    console.error("[createCheckoutConfigurationForProduct] Failed to parse JSON", {
      responseText: truncatedBody,
    });
    throw new Error("Invalid JSON from Whop checkout_configurations endpoint");
  }

  // Parse response according to Whop docs
  const response = json as {
    id?: string;
    plan?: { id?: string };
    purchase_url?: string;
  };

  const checkoutConfigId = response.id;
  const planId = response?.plan?.id;
  const purchaseUrl = response.purchase_url;

  console.log("[createCheckoutConfigurationForProduct] Parsed response", {
    hasCheckoutConfigId: !!checkoutConfigId,
    hasPlanId: !!planId,
    hasPurchaseUrl: !!purchaseUrl,
    checkoutConfigId,
    planId,
    purchaseUrlPreview: purchaseUrl ? purchaseUrl.substring(0, 50) + "..." : null,
  });

  if (!checkoutConfigId || !planId || !purchaseUrl) {
    console.error("[createCheckoutConfigurationForProduct] Missing expected fields", {
      checkoutConfigId,
      planId,
      purchaseUrl,
      fullResponse: json,
    });
    throw new Error(
      "Whop checkout configuration response missing required fields (id, plan.id, purchase_url)"
    );
  }

  return {
    checkoutConfigId,
    planId,
    purchaseUrl,
    raw: json,
  };
}
