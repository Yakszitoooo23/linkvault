# Issues Summary - LinkVault Whop App

## PROJECT OVERVIEW

**App Type:** Whop Experience App (Seller Product)
- App ID: `app_SQKFXgC8in232g`
- App Name: LinkVault
- Purpose: Creators can create and sell digital products
- Installation URL: `https://whop.com/apps/app_SQKFXgC8in232g/install/`

**Tech Stack:**
- Next.js 14 (App Router)
- Prisma ORM (PostgreSQL)
- Vercel deployment
- Whop SDKs: `@whop-apps/sdk`, `@whop/iframe`, `@whop/api`

---

## CRITICAL PROBLEM: INSTALLATION NOT WORKING

### Issue #1: OAuth Callback Not Being Called

**Symptom:**
- When users click "Install" in Whop marketplace, the OAuth callback route is NEVER called
- Vercel logs show NO requests to `/api/auth/callback`
- No `[OAuth Callback] ====== CALLBACK CALLED ======` logs appear

**What We Have:**
- ✅ Callback route exists: `app/api/auth/callback/route.ts`
- ✅ Route has complete logic to:
  - Exchange OAuth code for tokens
  - Fetch user's companies from Whop API
  - Create Company records in database
  - Link users to companies
  - Save OAuth tokens

**What's Missing:**
- ❌ Callback is never triggered during installation
- ❌ Company table remains empty (no installations have succeeded)
- ❌ Users have no OAuth tokens stored

**Current Redirect URL:**
- Configured: `https://linkvault-five.vercel.app/api/auth/callback`
- But Whop doesn't redirect to it during installation

**Questions for Whop Docs:**
1. **Do Whop Apps use OAuth callback for installation?**
   - Or do they use webhooks instead?
   - What is the correct installation flow for Whop Apps?

2. **What redirect URL should be configured?**
   - Is `/api/auth/callback` the correct path?
   - Does it need to be in a specific format?

3. **How does app installation work for Whop Apps?**
   - What happens when user clicks "Install"?
   - Where does Whop redirect after installation?
   - What parameters are sent?

4. **Is there an `app.installed` webhook event?**
   - Should we handle installation via webhook instead of OAuth?
   - What webhook events exist for app installation?

---

## ISSUE #2: PRODUCT CREATION FAILS WITH 401

**Symptom:**
- When users try to create products, we get: `"The API Key supplied does not have permission to access this route"`
- Error occurs when calling: `POST https://api.whop.com/api/v2/products`

**Root Cause:**
- App API Key (`WHOP_API_KEY`) doesn't have permission to create products
- We need OAuth tokens to create products, but users don't have them (because installation failed)

**Current Code:**
- Tries to use App API Key first, then falls back to OAuth tokens
- But App API Key fails with 401
- OAuth tokens don't exist because installation callback never ran

**Questions for Whop Docs:**
1. **Can App API Keys create products?**
   - What permissions/scopes are needed?
   - How to grant product creation permission to App API Key?

2. **Or must we use OAuth tokens?**
   - If yes, how do we get OAuth tokens during installation?
   - What's the correct OAuth flow for Whop Apps?

3. **What's the correct endpoint for creating products?**
   - We're using: `POST /api/v2/products`
   - Is this correct for Whop Apps?

---

## ISSUE #3: COMPANY TABLE EMPTY

**Symptom:**
- Database `Company` table has 0 rows
- Users exist but have `companyId = null`
- No OAuth tokens stored on companies

**Why:**
- Installation callback never runs
- So companies are never created
- So tokens are never saved

**This is a symptom, not the root cause.**
- Fix installation → companies will be created automatically

---

## WHAT WE'VE TRIED

### ✅ What Works:
- Callback route code is complete and correct
- Manual OAuth initiation route exists (`/api/auth/initiate`)
- Database schema supports companies and users
- Product creation logic is correct (just needs tokens)

### ❌ What Doesn't Work:
- Automatic installation doesn't trigger callback
- App API Key can't create products (401 error)
- No companies exist (because installation failed)

### 🔍 What We Need to Know:
1. **Correct installation flow for Whop Apps**
   - OAuth callback? Webhook? Something else?

2. **How to get OAuth tokens during installation**
   - What's the correct redirect URL?
   - What parameters does Whop send?

3. **App API Key permissions**
   - Can it create products?
   - How to grant permissions?

---

## SPECIFIC QUESTIONS FOR WHOP DOCUMENTATION

### Installation Flow:
1. When a user installs a Whop App from the marketplace, what happens?
2. Does Whop redirect to a callback URL? If yes, what URL format?
3. Does Whop send a webhook event? If yes, what event type?
4. What's the difference between Whop App installation and standard OAuth flow?

### OAuth for Whop Apps:
1. Do Whop Apps use OAuth for authentication?
2. What's the correct OAuth flow for Whop Apps?
3. What redirect URL should be configured?
4. What parameters does Whop send to the callback?

### API Permissions:
1. Can App API Keys create products via `/api/v2/products`?
2. What permissions/scopes are needed?
3. How to grant product creation permission to App API Key?
4. Or must we use OAuth tokens for product creation?

### Webhooks:
1. Is there an `app.installed` webhook event?
2. Should we handle installation via webhook instead of OAuth?
3. What webhook events exist for app lifecycle?

---

## CURRENT CODE STRUCTURE

### Callback Route: `app/api/auth/callback/route.ts`
- Handles OAuth callback
- Exchanges code for tokens
- Fetches companies: `GET /api/v5/me/companies`
- Creates Company records
- Links users to companies
- **But never gets called during installation**

### Product Creation: `app/api/products/create-with-plan/route.ts`
- Creates product in database
- Tries to create Whop product: `POST /api/v2/products`
- Fails with 401 (no permission)
- Needs OAuth tokens (which don't exist because installation failed)

### Webhook Handler: `app/api/webhook/route.ts`
- Exists but only handles `payment.succeeded` and `payment.refunded`
- No installation event handling

---

## EXPECTED BEHAVIOR

### When Installation Works:
1. User clicks "Install" in Whop marketplace
2. Whop redirects to `/api/auth/callback?code=xxxxx`
3. Callback exchanges code for OAuth tokens
4. Callback fetches user's companies
5. Callback creates Company records in database
6. Callback links user to company
7. Callback saves OAuth tokens
8. User can now create products (using OAuth tokens)

### Current Reality:
1. User clicks "Install"
2. ❌ Nothing happens (no callback)
3. ❌ No companies created
4. ❌ No tokens saved
5. ❌ Product creation fails with 401

---

## WHAT WE NEED FROM WHOP DOCS

**Primary Question:**
**How does Whop App installation work, and how do we get OAuth tokens during installation?**

**Secondary Questions:**
- Can App API Keys create products, or must we use OAuth tokens?
- What's the correct installation flow for Whop Apps?
- Should we use OAuth callback or webhook for installation?

**Please search Whop documentation for:**
1. "Whop App installation flow"
2. "OAuth for Whop Apps"
3. "App API Key permissions"
4. "Product creation API"
5. "App installation webhook"
6. "Redirect URL for Whop Apps"

