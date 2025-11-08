import { env } from "@/lib/env";

const WHOP_API_BASE_URL = "https://api.whop.com/v2";

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

type CreatePlanInput = {
  plan_type: "one_time" | "renewal";
  initial_price: number;
  currency: string;
  metadata?: Record<string, unknown>;
};

type CreatePlanResponse = {
  id: string;
  [key: string]: unknown;
};

type CreateCheckoutConfigurationInput = {
  plan_id: string;
  success_url: string;
  cancel_url: string;
  metadata?: Record<string, unknown>;
};

type CreateCheckoutConfigurationResponse = {
  id: string;
  plan?: { id: string };
  [key: string]: unknown;
};

type RequestOptions = Omit<RequestInit, "body"> & { body?: unknown };

async function requestWhop<TResponse>(path: string, options: RequestOptions = {}): Promise<TResponse> {
  if (!env.WHOP_API_KEY) {
    throw new Error("Whop API key not configured");
  }

  const { body, ...init } = options;

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${env.WHOP_API_KEY}`);
  headers.set("Content-Type", "application/json");

  if (env.WHOP_APP_ID) {
    headers.set("X-Whop-App-Id", env.WHOP_APP_ID);
  }

  const response = await fetch(`${WHOP_API_BASE_URL}${path}`, {
    ...init,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let payload: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    let message: string | null = null;

    if (typeof payload === "object" && payload !== null) {
      const record = payload as Record<string, unknown>;
      if (typeof record.error === "string") {
        message = record.error;
      } else if (typeof record.message === "string") {
        message = record.message;
      }
    } else if (typeof payload === "string") {
      message = payload;
    }

    throw new WhopApiError(
      message ?? `Whop API request to ${path} failed with status ${response.status}`,
      response.status,
      payload
    );
  }

  return payload as TResponse;
}

export const whop = env.WHOP_API_KEY
  ? {
      plans: {
        create: (input: CreatePlanInput) =>
          requestWhop<CreatePlanResponse>("/plans", {
            method: "POST",
            body: input,
          }),
      },
      checkoutConfigurations: {
        create: (input: CreateCheckoutConfigurationInput) =>
          requestWhop<CreateCheckoutConfigurationResponse>("/checkout_configurations", {
            method: "POST",
            body: input,
          }),
      },
    }
  : null;

export type WhopClient = NonNullable<typeof whop>;
