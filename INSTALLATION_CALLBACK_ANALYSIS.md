# Installation Callback Analysis - Why Companies Are Empty

## CRITICAL FINDING

**The callback route does NOT create Company records!**

Looking at `app/api/auth/callback/route.ts`:
- ✅ Has `fetchWhopCompanies()` function (line 114)
- ❌ **NEVER CALLS IT**
- ✅ Creates/updates User records (line 277)
- ❌ **NEVER creates Company records**

---

## 1. COMPLETE INSTALLATION CALLBACK

### File: `app/api/auth/callback/route.ts` (335 lines)

**What it DOES:**
1. Line 157: `GET` handler starts
2. Line 160: Gets `code` parameter from URL
3. Line 183: If no `code`, tries `validateToken()` (for Whop Apps)
4. Line 239: Exchanges OAuth code for tokens
5. Line 247: Fetches Whop user info
6. Line 257: Tries to create Whop product (may fail)
7. Line 277: Creates/updates **User** record only
8. Line 314: Redirects to `/experience`

**What it DOESN'T do:**
- ❌ Never calls `fetchWhopCompanies()` (line 114 - function exists but unused)
- ❌ Never creates Company records
- ❌ Never links user to company

---

## 2. THE MISSING CODE

### Function that exists but is never called:

**Line 114-128:** `fetchWhopCompanies()`
```typescript
async function fetchWhopCompanies(accessToken: string): Promise<WhopCompany[]> {
  const response = await fetch("https://api.whop.com/api/v5/me/companies", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  // ... returns companies array
}
```

**This function is NEVER called in the callback!**

### What should happen (but doesn't):

After line 248 (fetching user), we should:
1. Call `fetchWhopCompanies(access_token)` to get user's companies
2. For each company, upsert a Company record
3. Link user to the first company
4. Create Whop product for that company

**Current code (line 250):**
```typescript
// SOLUTION 1: Create Whop product per user (not per company)
// ❌ This comment shows company logic was removed!
```

---

## 3. WHY COMPANIES AREN'T CREATED

### Root Cause: "Solution 1" removed company logic

The callback was modified to use "Solution 1" which:
- Creates products per user (not per company)
- Stores `whopProductId` on User model
- Makes `companyId` optional
- **Removed all company creation code**

### Evidence in code:

**Line 250:** Comment says "Create Whop product per user (not per company)"
**Line 304:** Comment says "companyId is now optional (Solution 1 - no company requirement)"
**Line 277:** User upsert doesn't set `companyId` (it's null)

---

## 4. HOW USERS ARE CREATED

### In OAuth Callback (`app/api/auth/callback/route.ts`):

**Line 277-294:** User upsert
```typescript
const user = await prisma.user.upsert({
  where: { whopUserId: whopUser.id },
  create: {
    whopUserId: whopUser.id,
    role: "seller",
    whopProductId: whopProductId ?? undefined,
    whopAccessToken: access_token,
    whopRefreshToken: refresh_token,
    tokenExpiresAt,
    // ❌ companyId is NOT set here!
  },
  update: {
    // ❌ companyId is NOT updated here!
  },
});
```

**Result:** Users created with `companyId = null`

### In Product Creation (`app/api/products/create-with-plan/route.ts`):

**Line 228-245:** Creates user on first use
```typescript
if (!user) {
  user = await prisma.user.create({
    data: {
      whopUserId,
      role: "seller",
      companyId: null, // ❌ Always null!
    },
  });
}
```

**Result:** Users created with `companyId = null`

---

## 5. IS THE CALLBACK BEING CALLED?

### Check Vercel Logs for:

**When app is installed, look for:**
```
[OAuth Callback] ====== CALLBACK CALLED ======
```

**If you see this log:**
- ✅ Callback is being called
- Check for errors after this log
- Check if token exchange succeeds

**If you DON'T see this log:**
- ❌ Callback is NOT being called
- Redirect URL might be wrong
- Whop might not be redirecting to callback

### Possible scenarios:

**Scenario 1: Callback not called**
- Redirect URL in Whop dashboard is wrong
- Whop Apps don't use OAuth callback for installation
- Installation happens via webhook instead

**Scenario 2: Callback called but fails**
- Token exchange fails (line 239)
- Product creation fails (line 257) - caught but continues
- User created but company never created

**Scenario 3: Callback succeeds but no companies**
- ✅ This is what's happening!
- Callback creates users but never creates companies
- Company creation code was removed

---

## 6. THE FIX

### Option 1: Restore Company Creation (Recommended)

Add company creation back to the callback:

```typescript
// After line 248 (fetching user)
console.log("[OAuth Callback] Fetching user's companies...");
const whopCompanies = await fetchWhopCompanies(access_token);
console.log("[OAuth Callback] Companies fetched", { count: whopCompanies.length });

// Upsert companies
const companyRecords = [];
for (const whopCompany of whopCompanies) {
  const company = await prisma.company.upsert({
    where: { whopCompanyId: whopCompany.id },
    create: {
      whopCompanyId: whopCompany.id,
      name: whopCompany.name,
      whopAccessToken: access_token,
      whopRefreshToken: refresh_token,
      tokenExpiresAt,
    },
    update: {
      whopAccessToken: access_token,
      whopRefreshToken: refresh_token,
      tokenExpiresAt,
    },
  });
  companyRecords.push(company);
}

// Link user to first company
const firstCompany = companyRecords[0];
if (firstCompany) {
  // Create product for company (not user)
  let companyWhopProductId = firstCompany.whopProductId;
  if (!companyWhopProductId) {
    try {
      companyWhopProductId = await ensureCompanyProduct(access_token);
      await prisma.company.update({
        where: { id: firstCompany.id },
        data: { whopProductId: companyWhopProductId },
      });
    } catch (error) {
      console.error("[OAuth Callback] Failed to create company product", error);
    }
  }

  // Update user with companyId
  await prisma.user.update({
    where: { id: user.id },
    data: { companyId: firstCompany.id },
  });
}
```

### Option 2: Keep User-Based Approach

If we want to keep Solution 1 (user-based):
- Remove Company model entirely
- Use `user.whopProductId` for all products
- Don't create companies at all

---

## 7. TESTING THE INSTALLATION

### Steps to test:

1. **Uninstall LinkVault** from your test community
2. **Check Vercel logs** - should see no callback logs
3. **Reinstall LinkVault**
4. **Watch Vercel logs** for:
   - `[OAuth Callback] ====== CALLBACK CALLED ======`
   - Any errors after this
5. **Check database** after installation:
   - User table: Should have new user
   - Company table: Should have new company (if we fix it)

### What to look for in logs:

**Success case:**
```
[OAuth Callback] ====== CALLBACK CALLED ======
[OAuth Callback] Exchanging code for tokens...
[OAuth Callback] Token exchange successful
[OAuth Callback] Fetching Whop user...
[OAuth Callback] Whop user fetched
[OAuth Callback] Creating Whop product for user...
[OAuth Callback] User Whop product created
[OAuth Callback] User upserted
```

**Failure case:**
```
[OAuth Callback] ====== CALLBACK CALLED ======
[OAuth Callback] Token exchange error details { status: 401, ... }
```

**Not called case:**
```
(No logs at all)
```

---

## 8. HYPOTHESIS

**Most likely scenario:**

1. ✅ Callback IS being called (users exist)
2. ✅ Token exchange succeeds (users have tokens)
3. ❌ Company creation code was removed (Solution 1)
4. ❌ Users created with `companyId = null`
5. ❌ Companies never created

**Solution:** Restore company creation code in callback

---

## NEXT STEPS

1. **Check Vercel logs** during installation
2. **Confirm callback is being called** (look for log line 165)
3. **Restore company creation code** (Option 1 above)
4. **Test installation again**
5. **Verify Company table has records**

