# Complete Code Structure Analysis for Whop Integration

## 1. CURRENT PRODUCT CREATION FLOW (OAuth Callback)

### File: `app/api/auth/callback/route.ts`

**Function:** `ensureCompanyProduct(accessToken: string)` (lines 130-160)

**Location in OAuth Flow:**
- Called at line 257: `whopProductId = await ensureCompanyProduct(access_token);`
- This happens AFTER token exchange succeeds
- Part of the OAuth callback handler (GET route starting at line 109)

**API Endpoint:**
```typescript
POST https://api.whop.com/api/v5/products
```

**Request Parameters:**
```typescript
{
  name: "LinkVault Digital Products",
  visibility: "hidden"
}
```

**Headers:**
```typescript
{
  Authorization: `Bearer ${accessToken}`,  // OAuth access token from token exchange
  "Content-Type": "application/json"
}
```

**Current Error:**
- Error: `"Failed to create Whop product (404): null"`
- This happens when the API returns 404
- The `accessToken` being used is from OAuth token exchange
- **Problem:** OAuth token exchange is failing with "invalid_client" error

**Code Location:**
```typescript
// Lines 130-160 in app/api/auth/callback/route.ts
async function ensureCompanyProduct(accessToken: string): Promise<string> {
  const response = await fetch("https://api.whop.com/api/v5/products", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "LinkVault Digital Products",
      visibility: "hidden",
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(
      `Failed to create Whop product (${response.status}): ${JSON.stringify(payload)}`
    );
  }

  const product = (await response.json()) as { id?: string };
  if (!product.id) {
    throw new Error("Whop product creation response missing id");
  }
  return product.id;
}
```

---

## 2. PRODUCT STORAGE

### File: `prisma/schema.prisma`

**Company Model (lines 25-38):**
```prisma
model Company {
  id               String    @id @default(cuid())
  whopCompanyId    String    @unique
  name             String
  whopAccessToken  String?
  whopRefreshToken String?
  tokenExpiresAt   DateTime?
  whopProductId    String?   // ✅ YES - This field exists
  isActive         Boolean   @default(true)
  installedAt      DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
  products         Product[]
  users            User[]
}
```

**User Model (lines 10-23):**
```prisma
model User {
  id               String     @id @default(cuid())
  whopUserId       String     @unique
  role             String     @default("buyer")
  companyId        String?
  company          Company?   @relation(fields: [companyId], references: [id])
  whopProductId    String?    // ✅ YES - This field exists on User too
  whopAccessToken  String?
  whopRefreshToken String?
  tokenExpiresAt   DateTime?
  createdAt        DateTime   @default(now())
  purchases        Purchase[]
  products         Product[]
}
```

**Storage Location:**
- **Solution 1 (Current):** `whopProductId` is stored on the **User** model (line 16)
- **Legacy:** `whopProductId` also exists on **Company** model (line 32) but not being used

**Database Query Result:**
- We need to check if any user has `whopProductId` set
- Based on logs: `hasUserToken: false` - suggests no OAuth tokens, so likely no `whopProductId` either

---

## 3. PLAN CREATION CODE

### File: `app/api/products/create-with-plan/route.ts`

**Function:** `createCompanyPlan()` (imported from `lib/whop.ts`)

**Called at:** Line 444 in `create-with-plan/route.ts`

**API Endpoint:**
```typescript
POST https://api.whop.com/api/v5/plans
```

**Request Parameters:**
```typescript
{
  product_id: whopProductId,      // From user.whopProductId
  plan_type: "one_time",
  initial_price: priceCents,
  currency: currency.toLowerCase(),
  release_method: "buy_now",
  visibility: "visible",
  metadata: {
    linkVaultProductId: product.id,
    userId: user.id,
    whopUserId: user.whopUserId,
  }
}
```

**Headers:**
```typescript
{
  Authorization: `Bearer ${accessToken}`,  // From user.whopAccessToken or WHOP_API_KEY
  "Content-Type": "application/json"
}
```

**Code Location in lib/whop.ts (lines 112-161):**
```typescript
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
  const response = await fetch(`${WHOP_V5_API_BASE}/plans`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      product_id: whopProductId,
      plan_type: "one_time",
      initial_price: priceCents,
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
```

**Error: "Failed to create Whop product (404)"**
- This error comes from `ensureCompanyProduct()` function
- Happens when trying to create the Whop product (not the plan)
- The 404 suggests the endpoint or authentication is wrong
- **Full error location:** `app/api/products/create-with-plan/route.ts` line 312

---

## 4. WHOP SDK USAGE

### Packages Used:
```json
{
  "@whop-apps/sdk": "0.0.1-canary.117",  // For validateToken (iframe auth)
  "@whop/api": "latest",                  // Not actively used
  "@whop/iframe": "^0.0.3",              // For iframe SDK
  "@whop/react": "latest"                 // For React components
}
```

### SDK Initialization:
**File:** `app/api/products/create-with-plan/route.ts` (line 3)
```typescript
import { validateToken } from "@whop-apps/sdk";
```

**Usage:**
```typescript
// Line 148
const tokenData = await validateToken({ headers: requestHeaders });
// Returns: { userId: "user_xxx", appId: "app_xxx" }
```

### API Calls:
**We're using manual `fetch()` calls, NOT the SDK:**
- All Whop API calls use `fetch()` directly
- No SDK client initialization
- Authentication via `Authorization: Bearer ${token}` header

### Token Usage:
**Current Flow:**
1. **User Identification:** Uses `validateToken()` from `@whop-apps/sdk` to get `userId`
2. **API Calls:** Uses either:
   - `user.whopAccessToken` (OAuth token - currently missing)
   - `WHOP_API_KEY` (App API Key - fallback, just added)
   - `x-whop-user-token` (iframe token - doesn't work for API calls)

**Problem:** 
- OAuth tokens are never being saved because OAuth flow fails
- App API Key might work but needs to be tested

---

## 5. COMPLETE FLOW EXPLANATION

### When Creator Clicks "Create Product" in LinkVault:

**Step 1: Frontend Form Submit**
- User fills form: title, description, price, uploads file/image
- Form submits to: `POST /api/products/create-with-plan`

**Step 2: Authentication (`create-with-plan/route.ts` line 148)**
- Uses `validateToken()` from `@whop-apps/sdk`
- Gets `userId` from iframe token (`x-whop-user-token` header)
- Looks up user in database by `whopUserId`

**Step 3: Check for Whop Product (line 206-312)**
- Checks if `user.whopProductId` exists
- **If NO:**
  - Tries to get token: `WHOP_API_KEY` OR `user.whopAccessToken`
  - Calls `ensureCompanyProduct(accessToken)` 
  - **Endpoint:** `POST https://api.whop.com/api/v5/products`
  - **Body:** `{ name: "LinkVault Digital Products", visibility: "hidden" }`
  - **Error:** Gets 404 - "Failed to create Whop product (404)"
  - Saves `whopProductId` to user if successful

**Step 4: Create Product in Database (line 420)**
- Creates `Product` record in our database
- Links to `user.id` (required)
- Links to `user.companyId` (optional)

**Step 5: Create Whop Plan (line 444)**
- Calls `createCompanyPlan()` from `lib/whop.ts`
- **Endpoint:** `POST https://api.whop.com/api/v5/plans`
- **Requires:** `user.whopProductId` (from Step 3)
- **Uses:** `user.whopAccessToken` or `WHOP_API_KEY` for auth
- **Body:** Plan details (price, currency, metadata)
- Saves `planId` to product record

**Step 6: Return Success**
- Returns product with `planId` set
- Frontend can now use `planId` for checkout

### Current Blockers:

1. **OAuth Flow Failing:**
   - Token exchange returns "invalid_client"
   - `user.whopAccessToken` is never saved
   - `user.whopProductId` is never created via OAuth

2. **Product Creation Failing:**
   - `ensureCompanyProduct()` gets 404 error
   - Happens when trying to create Whop product on-demand
   - Using `WHOP_API_KEY` might work (needs testing)

3. **Missing whopProductId:**
   - User has no `whopProductId` in database
   - Can't create plans without it
   - Need to create Whop product first

---

## SUMMARY

**Current State:**
- ✅ User identification works (via iframe token)
- ✅ Database schema is correct
- ❌ OAuth flow fails (invalid_client error)
- ❌ Whop product creation fails (404 error)
- ❌ No `whopProductId` saved for users
- ⚠️ App API Key fallback just added (needs testing)

**Next Steps:**
1. Test if `WHOP_API_KEY` works for creating products
2. If not, fix OAuth flow for Whop Apps
3. Or find correct authentication method for Apps

