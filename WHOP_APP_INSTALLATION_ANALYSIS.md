# Whop App Installation Analysis

## CRITICAL UNDERSTANDING

**LinkVault is a Whop App (installed from marketplace), NOT a standalone OAuth website!**

## 1. APP INSTALLATION FLOW

### Current Callback Route: `app/api/auth/callback/route.ts`

**What it's doing:**
- Lines 157-333: Handling OAuth callback with `?code=xxx` parameter
- This is treating it like OAuth login, NOT app installation
- **Problem:** Whop Apps might not use OAuth for installation!

**What should happen during app installation:**
1. Creator clicks "Install" in Whop marketplace
2. Whop shows permission screen
3. Creator approves
4. **Whop might:**
   - Send webhook to our app (not OAuth callback)
   - OR redirect to callback URL with different parameters
   - OR just install silently and app becomes available

**Current code expects:**
- OAuth `code` parameter
- Exchanges code for tokens
- Creates user record
- Creates Whop product

**What we need to check:**
- Does Whop send a webhook when app is installed?
- What parameters does the callback URL receive during installation?
- Is OAuth even needed for Whop Apps?

---

## 2. HOW CREATORS ACCESS LINKVAULT

### Current Setup:

**Layout:** `app/layout.tsx` (line 16)
```typescript
<WhopProvider>
  {children}
</WhopProvider>
```

**WhopProvider:** `components/providers/WhopProvider.tsx`
- Uses `@whop/iframe` SDK
- Creates SDK with `NEXT_PUBLIC_WHOP_APP_ID`
- **This suggests app runs in iframe!**

**Routes:**
- `app/dashboard/[companyId]/page.tsx` - Dashboard view (companyId from URL)
- `app/experience/[experienceId]/page.tsx` - Experience view (if exists)

**How creators access:**
- App opens from Whop dashboard (in iframe)
- URL might be: `https://linkvault-five.vercel.app/dashboard/{companyId}`
- OR: `https://linkvault-five.vercel.app/experience/{experienceId}`
- **NOT direct access to `linkvault-five.vercel.app`**

**Authentication:**
- Uses `validateToken()` from `@whop-apps/sdk`
- Reads `x-whop-user-token` header (automatically sent by Whop iframe)
- Gets `userId` and `appId` from token

---

## 3. USER AUTHENTICATION

### File: `app/api/products/create-with-plan/route.ts`

**Line 148:**
```typescript
const tokenData = await validateToken({ headers: requestHeaders });
// Returns: { userId: "user_xxx", appId: "app_xxx" }
```

**How we identify creator:**
1. `validateToken()` reads `x-whop-user-token` header
2. Extracts `userId` (Whop user ID like `user_xxx`)
3. Looks up user in database by `whopUserId`
4. Uses that user's `whopProductId` and `whopAccessToken` for API calls

**Company/Context:**
- We're NOT using `companyId` from URL params currently
- We're using user-based approach (Solution 1)
- `companyId` is optional in schema

---

## 4. APP INSTALLATION IN DATABASE

### What SHOULD happen when app is installed:

**Option A: Webhook-based (most likely)**
1. Whop sends webhook to our app
2. Webhook contains: `companyId`, `userId`, installation data
3. We create/update:
   - `Company` record (if company-based)
   - `User` record (link to company)
   - Create Whop product for that company/user
   - Store installation tokens (if any)

**Option B: Callback-based (current assumption)**
1. Whop redirects to `/api/auth/callback?code=xxx`
2. We exchange code for tokens
3. Create user record
4. Create Whop product

**Current Implementation:**
- Lines 277-294: Creates/updates `User` record
- Stores: `whopUserId`, `whopProductId`, `whopAccessToken`, `whopRefreshToken`
- **Does NOT create Company record** (companyId is optional)
- **Does NOT handle webhooks**

**What's missing:**
- Webhook handler for `app.installed` event
- Company record creation (if needed)
- Proper installation flow

---

## 5. THE REDIRECT URL

**Current:** `https://linkvault-five.vercel.app/api/auth/callback`

**What Whop sends:**
- During OAuth: `?code=xxx` (authorization code)
- During installation: **Unknown** - might be different!

**Current code expects:**
- `code` parameter (OAuth authorization code)
- Exchanges it for tokens
- Creates user

**What we need to check:**
- Does Whop send `code` during app installation?
- Or does it send different parameters?
- Or does it use webhooks instead?

---

## THE REAL PROBLEM

**We're mixing two concepts:**

1. **OAuth Flow** (for standalone web apps)
   - User logs in with Whop
   - Gets OAuth tokens
   - Can make API calls

2. **Whop App Installation** (for marketplace apps)
   - App is installed from marketplace
   - Runs in iframe
   - Uses App API Key for API calls
   - Uses iframe token for user identification

**Current code is trying to use OAuth for a Whop App, which might be wrong!**

---

## WHAT WE NEED TO DO

1. **Check if OAuth is needed:**
   - For Whop Apps, we might just need App API Key
   - OAuth might only be for standalone websites

2. **Check installation flow:**
   - Does Whop send webhook on installation?
   - What does the callback URL receive?
   - Do we need to handle installation differently?

3. **Use App API Key:**
   - For API calls, use `WHOP_API_KEY` (not OAuth tokens)
   - For user identification, use `validateToken()` (already doing this)

4. **Fix product creation:**
   - Use App API Key to create Whop products
   - Don't require OAuth tokens

---

## NEXT STEPS

1. **Remove OAuth requirement** - Use App API Key instead
2. **Check for webhook handler** - Handle `app.installed` event
3. **Test with App API Key** - See if product creation works
4. **Simplify installation** - Don't need OAuth flow

