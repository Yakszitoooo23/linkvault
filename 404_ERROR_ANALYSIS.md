# 404 Error Analysis - Complete Breakdown

## THE ERROR

**Status:** 500 Internal Server Error  
**Endpoint:** `/api/products/create-with-plan`  
**Root Cause:** `Failed to create Whop product (404)`  
**Location:** Line 86 in `app/api/products/create-with-plan/route.ts`

---

## 1. COMPLETE API ROUTE

**File:** `app/api/products/create-with-plan/route.ts` (502 lines)

**Flow:**
1. Line 139: `POST` handler starts
2. Line 151: Authenticate user via `validateToken()`
3. Line 194: Look up user in database
4. Line 257: Check if user has `whopProductId`
5. **Line 312: Call `ensureCompanyProduct()` → THIS IS WHERE 404 HAPPENS**
6. Line 334: Error caught, returns 500

---

## 2. THE EXACT LINE CAUSING 404

### Function: `ensureCompanyProduct()` (Lines 76-127)

**Location:** `app/api/products/create-with-plan/route.ts`

**Called from:**
- Line 312: `const whopProductId = await ensureCompanyProduct(accessTokenToUse);`
- Also called from: `app/api/auth/callback/route.ts` line 257

**The failing API call (Line 86):**
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

**Error thrown (Line 114-116):**
```typescript
if (!response.ok) {
  throw new Error(
    `Failed to create Whop product (${response.status}): ${JSON.stringify(payload)}`
  );
}
```

**Result:** Error message: `"Failed to create Whop product (404)"`

---

## 3. COMPLETE ERROR FLOW

### Step-by-step execution:

1. **User clicks "Create Product"**
   - Frontend calls: `POST /api/products/create-with-plan`

2. **Line 151:** Authenticate user
   ```typescript
   const tokenData = await validateToken({ headers: requestHeaders });
   // Returns: { userId: "user_xxx" }
   ```

3. **Line 194:** Look up user
   ```typescript
   const user = await prisma.user.findUnique({ where: { whopUserId } });
   ```

4. **Line 257:** Check if user has `whopProductId`
   ```typescript
   if (!user.whopProductId) {
     // User doesn't have whopProductId, need to create it
   }
   ```

5. **Line 278:** Get access token
   ```typescript
   const appApiKey = process.env.WHOP_API_KEY;
   const accessTokenToUse = appApiKey || user.whopAccessToken;
   ```

6. **Line 312:** Call `ensureCompanyProduct()` ← **404 ERROR HERE**
   ```typescript
   const whopProductId = await ensureCompanyProduct(accessTokenToUse);
   ```

7. **Inside `ensureCompanyProduct()` (Line 86):**
   ```typescript
   const response = await fetch("https://api.whop.com/api/v5/products", {
     method: "POST",
     // ... headers and body
   });
   // Response: 404 Not Found
   ```

8. **Line 114:** Error thrown
   ```typescript
   throw new Error("Failed to create Whop product (404): null");
   ```

9. **Line 334:** Error caught in try-catch
   ```typescript
   catch (productError) {
     return NextResponse.json({
       error: "Failed to set up Whop product",
       details: productError.message, // "Failed to create Whop product (404)"
     }, { status: 500 });
   }
   ```

10. **Result:** Frontend receives 500 error with message "Failed to create Whop product (404)"

---

## 4. THE PROBLEMATIC FUNCTION

### `ensureCompanyProduct()` - Complete Code

**File:** `app/api/products/create-with-plan/route.ts` (Lines 76-127)

```typescript
async function ensureCompanyProduct(accessToken: string): Promise<string> {
  const isApiKey = accessToken.startsWith("apik_");
  console.log("[ensureCompanyProduct] Attempting to create Whop product", {
    tokenLength: accessToken.length,
    tokenPrefix: accessToken.substring(0, 20) + "...",
    endpoint: "https://api.whop.com/api/v5/products",  // ← WRONG ENDPOINT?
    usingApiKey: isApiKey,
    usingOAuthToken: !isApiKey,
  });

  // LINE 86: THE FAILING API CALL
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

  const responseText = await response.text();
  let payload: unknown = null;
  try {
    payload = JSON.parse(responseText);
  } catch {
    payload = responseText;
  }

  console.log("[ensureCompanyProduct] Whop API response", {
    status: response.status,  // ← THIS IS 404
    statusText: response.statusText,
    payload,
    headers: Object.fromEntries(response.headers.entries()),
  });

  // LINE 114: ERROR THROWN HERE
  if (!response.ok) {
    throw new Error(
      `Failed to create Whop product (${response.status}): ${JSON.stringify(payload)}`
    );
  }

  const product = typeof payload === "object" && payload !== null && "id" in payload
    ? (payload as { id?: string })
    : null;

  if (!product?.id) {
    throw new Error(`Whop product creation response missing id: ${JSON.stringify(payload)}`);
  }
  return product.id;
}
```

---

## 5. WHAT WE EXPECT TO FIND IN VERCEL LOGS

When you check Vercel logs, you should see:

```
[ensureCompanyProduct] Attempting to create Whop product {
  tokenLength: 71,
  tokenPrefix: "apik_SQDtE...",
  endpoint: "https://api.whop.com/api/v5/products",
  usingApiKey: true,
  usingOAuthToken: false
}

[ensureCompanyProduct] Whop API response {
  status: 404,
  statusText: "Not Found",
  payload: null,
  headers: { ... }
}

[create-with-plan] Failed to create Whop product on-demand {
  userId: "cmhyss4rx0001ikzwnhxzw4it",
  error: "Failed to create Whop product (404): null"
}

create-with-plan error: Error: Failed to create Whop product (404): null
```

---

## 6. POSSIBLE CAUSES OF 404

### Issue 1: Wrong Endpoint
- **Current:** `POST https://api.whop.com/api/v5/products`
- **Might need:** `POST https://api.whop.com/api/v2/products`
- **Evidence:** Web search suggests `/v2/products` is the correct endpoint

### Issue 2: Missing Company Context
- Products might need `company_id` in request body
- Current body only has `name` and `visibility`
- Might need: `{ name, visibility, company_id }`

### Issue 3: Wrong Authentication
- App API Key might not have permission to create products
- Might need OAuth token instead
- Or might need different permissions

### Issue 4: Products Are Company-Scoped
- Can't create products without company context
- Need to get company from experience first
- Use company's existing product instead of creating new one

### Issue 5: Endpoint Doesn't Exist
- `POST /v5/products` might not be a valid endpoint
- Products might be created differently for Experience Apps
- Might need to use a different API path

---

## 7. THE FIX

**Option 1: Change endpoint to `/v2/products`**
```typescript
const response = await fetch("https://api.whop.com/api/v2/products", {
  // ... rest of code
});
```

**Option 2: Add company_id to request body**
```typescript
body: JSON.stringify({
  name: "LinkVault Digital Products",
  visibility: "hidden",
  company_id: companyId, // ← ADD THIS
}),
```

**Option 3: Don't create products - use existing**
- For Experience Apps, products might already exist
- Get product ID from experience or company
- Don't try to create new products

**Option 4: Use different endpoint**
- Check Whop API docs for correct product creation endpoint
- Might be `/v5/companies/{companyId}/products`
- Or might need different authentication

---

## NEXT STEPS

1. **Check Whop API documentation** for correct product creation endpoint
2. **Try `/v2/products` instead of `/v5/products`**
3. **Add `company_id` to request body** if needed
4. **Get company from experience** and use its existing product
5. **Check if products need to be created at all** for Experience Apps

