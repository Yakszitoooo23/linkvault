# Installation Diagnostic - FIX INSTALLATION FIRST

## ✅ CALLBACK ROUTE EXISTS

**File:** `app/api/auth/callback/route.ts` (413 lines)

**Location:** `app/api/auth/callback/route.ts`

**Status:** ✅ Route exists and has company creation logic

---

## 1. WHAT THE CALLBACK DOES

The callback route (`app/api/auth/callback/route.ts`) should:

1. **Line 157:** Receives GET request with `?code=xxx` parameter
2. **Line 239:** Exchanges OAuth code for access/refresh tokens
3. **Line 247:** Fetches Whop user info
4. **Line 254:** Fetches user's companies from Whop API
5. **Line 274:** Creates/updates Company records in database
6. **Line 306:** Creates Whop product for company
7. **Line 342:** Creates/updates User record
8. **Line 347:** Links user to company (`companyId`)
9. **Line 392:** Redirects to `/experience`

**This should create Company records, but Company table is empty = callback isn't working**

---

## 2. INSTALLATION FLOW

### When user clicks "Install" at:
`https://whop.com/apps/app_SQKFXgC8in232g/install/`

**Expected flow:**
1. User clicks "Install"
2. Whop shows permission screen
3. User approves
4. **Whop redirects to:** `https://linkvault-five.vercel.app/api/auth/callback?code=xxxxx`
5. Our callback route handles it
6. Company records created

**If this isn't happening, the redirect URL is wrong in Whop dashboard**

---

## 3. TEST INSTALLATION NOW

### Step 1: Check Vercel Logs

1. Go to Vercel Dashboard → Your Project → Logs
2. Clear logs (or note current time)
3. Go to: `https://whop.com/apps/app_SQKFXgC8in232g/install/`
4. Click "Install"
5. Watch Vercel logs in real-time

### Step 2: Look for this log

**If callback is called, you'll see:**
```
[OAuth Callback] ====== CALLBACK CALLED ======
```

**If you see this:**
- ✅ Callback is being called
- Check what happens after this log
- Look for errors

**If you DON'T see this:**
- ❌ Callback is NOT being called
- Redirect URL in Whop dashboard is wrong
- Or Whop Apps don't use OAuth callback

---

## 4. CHECK REDIRECT URL IN WHOP DASHBOARD

### Required Settings:

1. **Go to:** Whop Developer Dashboard → Your App → OAuth Settings
2. **Redirect URI should be:** `https://linkvault-five.vercel.app/api/auth/callback`
3. **Must match exactly** (no trailing slash, correct domain)

### Check Vercel Environment Variables:

1. **Go to:** Vercel Dashboard → Your Project → Settings → Environment Variables
2. **Check:** `NEXT_PUBLIC_WHOP_REDIRECT_URL`
3. **Should be:** `https://linkvault-five.vercel.app/api/auth/callback`

---

## 5. WHAT TO LOOK FOR IN VERCEL LOGS

### Success Case (Callback Called):
```
[OAuth Callback] ====== CALLBACK CALLED ====== {
  timestamp: "2025-01-XX...",
  hasCode: true,
  hasError: false,
  allParams: { code: "xxxxx" }
}
[OAuth Callback] Exchanging code for tokens...
[OAuth Callback] Token exchange successful
[OAuth Callback] Fetching Whop user...
[OAuth Callback] Whop user fetched
[OAuth Callback] Fetching user's companies...
[OAuth Callback] Companies fetched { count: 1 }
[OAuth Callback] Upserting companies...
[OAuth Callback] Company upserted { companyId: "...", whopCompanyId: "biz_xxx" }
[OAuth Callback] User upserted { companyId: "...", companiesCreated: 1 }
```

### Failure Case 1 (No Code):
```
[OAuth Callback] ====== CALLBACK CALLED ====== {
  hasCode: false,
  hasError: false
}
[OAuth Callback] Missing authorization code and no token data available
```

### Failure Case 2 (Token Exchange Fails):
```
[OAuth Callback] ====== CALLBACK CALLED ======
[OAuth Callback] Exchanging code for tokens...
[OAuth Callback] Token exchange error details {
  status: 401,
  errorPayload: { ... }
}
```

### Failure Case 3 (No Companies):
```
[OAuth Callback] Companies fetched { count: 0 }
[OAuth Callback] No companies found for user
[OAuth Callback] User created without companyId
```

### Not Called Case:
```
(No logs at all - callback route never hit)
```

---

## 6. IF CALLBACK ISN'T CALLED

### Possible Reasons:

1. **Redirect URL wrong in Whop dashboard**
   - Check Whop Developer Dashboard → OAuth Settings
   - Must be: `https://linkvault-five.vercel.app/api/auth/callback`

2. **Whop Apps don't use OAuth callback**
   - For Whop Apps, installation might use webhooks instead
   - Check for webhook handler: `app/api/webhooks/whop/route.ts`

3. **App installation doesn't trigger OAuth**
   - Whop Apps might install silently
   - Need to manually trigger OAuth via `/api/auth/initiate`

---

## 7. IF CALLBACK IS CALLED BUT FAILS

### Check for these errors:

1. **Token exchange fails (401/400)**
   - `WHOP_CLIENT_ID` / `WHOP_CLIENT_SECRET` wrong
   - Or `WHOP_APP_ID` / `WHOP_API_KEY` wrong
   - Check Vercel environment variables

2. **No companies found**
   - User might not have companies
   - API endpoint might be wrong
   - Check: `GET /api/v5/me/companies`

3. **Company creation fails**
   - Database error
   - Prisma schema mismatch
   - Check Vercel logs for Prisma errors

---

## 8. MANUAL TEST

### Test the callback route directly:

1. **Visit:** `https://linkvault-five.vercel.app/api/auth/test-callback`
2. **Should return:** JSON with instructions
3. **This confirms:** Route exists and is accessible

### Test OAuth initiation:

1. **Visit:** `https://linkvault-five.vercel.app/api/auth/initiate`
2. **Should redirect:** To Whop OAuth page
3. **After approval:** Should redirect back to callback

---

## 9. NEXT STEPS

### If callback is NOT called:
1. Check redirect URL in Whop dashboard
2. Check if Whop Apps use webhooks instead
3. Try manual OAuth: `/api/auth/initiate`

### If callback IS called but fails:
1. Check Vercel logs for exact error
2. Fix token exchange (check credentials)
3. Fix company fetching (check API endpoint)
4. Fix company creation (check database)

### If callback succeeds but no companies:
1. Check if user has companies in Whop
2. Check API endpoint: `/api/v5/me/companies`
3. Check if companies array is empty

---

## 10. CRITICAL: DO NOT FIX PRODUCT CREATION

**Until installation works:**
- ❌ Don't fix 401 errors in product creation
- ❌ Don't change token selection logic
- ❌ Don't modify `create-with-plan` route

**Focus ONLY on:**
- ✅ Getting callback called
- ✅ Getting companies created
- ✅ Getting tokens saved

**Once companies exist with tokens, 401 errors will automatically be fixed**

