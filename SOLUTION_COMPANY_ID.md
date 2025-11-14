# Solution: Missing companyId in Token

## Problem

**Token only contains:**
- `appId`: present
- `userId`: present  
- `companyId`: **MISSING**
- `company_id`: **MISSING**
- `experienceId`: **MISSING**

**Result:** Cannot create Whop products (requires `company_id`)

---

## Solution 1: Use WHOP_FALLBACK_COMPANY_ID (Quick Fix)

### Steps:

1. **Find your Whop Company ID:**
   - Go to your Whop dashboard
   - Your company ID is in the URL or settings (format: `biz_xxxxx`)
   - Or check Whop API: `GET /api/v5/me/companies` (if you have OAuth token)

2. **Set in Vercel:**
   - Go to Vercel Dashboard → Your Project → Settings → Environment Variables
   - Add: `WHOP_FALLBACK_COMPANY_ID` = `biz_xxxxx` (your actual company ID)
   - Save and redeploy

3. **Test:**
   - Try creating a product again
   - Should see: `[whopAuth] Using fallback companyId from env`
   - Product creation should work

---

## Solution 2: Fetch Company from Whop API (Better)

If we can't use fallback, we might need to:
1. Use the iframe token to call Whop API
2. Fetch user's companies: `GET /api/v5/me/companies`
3. Use the first company's ID

**But:** The iframe token (`x-whop-user-token`) might not have permission to call this endpoint.

---

## Solution 3: Get Company from Experience (If Available)

If the app is accessed via an Experience:
- Experience might have `experienceId` in token
- We could fetch experience details: `GET /api/v5/experiences/{experienceId}`
- Extract `company_id` from experience

**But:** Token doesn't have `experienceId` either.

---

## Immediate Action

**Set `WHOP_FALLBACK_COMPANY_ID` in Vercel:**
1. Get your company ID (check Whop dashboard)
2. Add to Vercel environment variables
3. Redeploy
4. Test product creation

This will make product creation work immediately.

