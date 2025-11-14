# Complete Flow Analysis - Whop Experience App

## 1. EXPERIENCE ROUTE

### Current: `app/experience/page.tsx`

**Status:** Static route (no `[experienceId]` parameter)

**What it does:**
- Shows all products (no filtering by experience)
- Has "Create Product" button that routes to `/products/new`
- Does NOT use `validateToken()` for authentication
- Does NOT get `experienceId` from URL
- Does NOT get company info from experience

**Missing:**
- Dynamic route: `app/experiences/[experienceId]/page.tsx`
- Authentication via `validateToken()`
- Getting company from experience
- Filtering products by experience/company

---

## 2. PRODUCT CREATION FLOW

### File: `app/api/products/create-with-plan/route.ts`

**Complete Flow:**

1. **Line 141:** Parse request body
   ```typescript
   { title, description, priceCents, currency, fileKey, imageKey, imageUrl }
   ```

2. **Line 151:** Authenticate user
   ```typescript
   const tokenData = await validateToken({ headers: requestHeaders });
   // Returns: { userId: "user_xxx", companyId?: "biz_xxx" }
   ```

3. **Line 194:** Look up user in database
   ```typescript
   const user = await prisma.user.findUnique({ where: { whopUserId } });
   ```

4. **Line 228:** Create user if doesn't exist (Solution A)

5. **Line 257:** Check if user has `whopProductId`
   - **If NO:** Try to create Whop product on-demand

6. **Line 312:** **THE 404 ERROR HAPPENS HERE**
   ```typescript
   const whopProductId = await ensureCompanyProduct(accessTokenToUse);
   ```

7. **Line 429:** Create product in our database

8. **Line 444:** Create Whop plan
   ```typescript
   const planId = await createCompanyPlan({
     accessToken,
     whopProductId: user.whopProductId,
     priceCents: product.priceCents,
     currency: product.currency.toLowerCase(),
   });
   ```

---

## 3. THE 404 ERROR - EXACT LOCATION

### File: `app/api/products/create-with-plan/route.ts`

**Function:** `ensureCompanyProduct()` (lines 76-127)

**Exact API Call (Line 86):**
```typescript
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
```

**Error:** `Failed to create Whop product (404): null`

**Called from:**
- Line 312: `ensureCompanyProduct(accessTokenToUse)` (when user missing `whopProductId`)
- Line 257: In OAuth callback: `ensureCompanyProduct(access_token)`

**Possible Issues:**
1. **Wrong endpoint:** Web search says it should be `/v2/products` not `/v5/products`
2. **Missing company_id:** Products might need `company_id` in request body
3. **Wrong auth:** App API Key might not have permission to create products
4. **Products are company-scoped:** Can't create products without company context
5. **Endpoint doesn't exist:** `POST /v5/products` might not be a valid endpoint

---

## 4. APP INSTALLATION

### File: `app/api/auth/callback/route.ts`

**Current Implementation:**
- Lines 157-333: OAuth callback handler
- Expects `?code=xxx` parameter
- Exchanges code for OAuth tokens
- Creates user record
- Tries to create Whop product (line 257) ← **ALSO GETS 404 HERE**

**What happens:**
1. User installs app from Whop marketplace
2. Whop redirects to `/api/auth/callback?code=xxx`
3. We exchange code for tokens
4. We try to create Whop product → **404 ERROR**
5. User record created but `whopProductId` is null

**Problem:**
- This is OAuth flow, but might not be how Whop Apps install
- Product creation fails with 404
- User ends up without `whopProductId`

---

## 5. GETTING COMPANY INFO FROM EXPERIENCE

### Current Implementation:

**We're NOT getting company from experience!**

**What we have:**
- `app/experience/page.tsx` - static route, no `experienceId`
- No code to get experience details from Whop API
- No code to extract `companyId` from experience

**What we need:**
- Dynamic route: `app/experiences/[experienceId]/page.tsx`
- Get experience details: `GET /v5/experiences/{experienceId}`
- Extract `companyId` from experience response
- Use company's `whopProductId` for plans

**Missing Code:**
```typescript
// Get experience details
const experience = await fetch(`https://api.whop.com/api/v5/experiences/${experienceId}`, {
  headers: { Authorization: `Bearer ${WHOP_API_KEY}` }
});

// Extract companyId
const companyId = experience.company_id;

// Get company from database
const company = await prisma.company.findUnique({
  where: { whopCompanyId: companyId }
});

// Use company's whopProductId
const whopProductId = company.whopProductId;
```

---

## THE EXACT PROBLEM

**404 Error:**
- **File:** `app/api/products/create-with-plan/route.ts`
- **Line:** 86
- **Function:** `ensureCompanyProduct()`
- **Endpoint:** `POST https://api.whop.com/api/v5/products`
- **Error:** `Failed to create Whop product (404): null`

**Why it's failing:**
1. **Wrong endpoint:** Should be `/v2/products` not `/v5/products` (according to web search)
2. **Missing company context:** Products might need `company_id` in body
3. **Wrong authentication:** App API Key might not work for this endpoint
4. **Products are company-scoped:** Can't create products without company

**What we need to check:**
- Correct Whop API endpoint for creating products
- Whether products need `company_id` in request body
- Whether App API Key can create products
- Whether we should use the experience's company instead

---

## SOLUTION APPROACH

**Option 1: Fix the endpoint**
- Change `/v5/products` to `/v2/products`
- Add `company_id` to request body if needed

**Option 2: Use experience's company**
- Get `experienceId` from URL or token
- Fetch experience details from Whop API
- Get company from experience
- Use company's existing `whopProductId` (don't create new product)

**Option 3: Products already exist**
- For Experience Apps, products might already exist
- We might just need to create plans, not products
- Check if we can get product ID from experience or company

---

## NEXT STEPS

1. **Check Whop API docs** for correct product creation endpoint
2. **Check if products need company_id** in request body
3. **Get company from experience** instead of user
4. **Use experience's company whopProductId** for plans
5. **Create dynamic experience route** with `[experienceId]` parameter
