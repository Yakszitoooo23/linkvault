# TEST INSTALLATION NOW - Step by Step

## IMMEDIATE ACTION REQUIRED

**Goal:** Verify if `/api/auth/callback` is being called during installation

---

## STEP 1: Open Vercel Logs

1. Go to: https://vercel.com/dashboard
2. Select your project: `linkvault` or `whop-digisell-starter`
3. Click **"Logs"** tab
4. **Keep this tab open** - you'll watch it in real-time

---

## STEP 2: Clear/Note Current Time

- Note the current time in Vercel logs
- Or clear logs if possible
- This helps you see only new logs

---

## STEP 3: Install the App

1. Go to: `https://whop.com/apps/app_SQKFXgC8in232g/install/`
2. Click **"Install"** button
3. Approve permissions if asked
4. **Watch Vercel logs immediately**

---

## STEP 4: Check for Callback Log

### Look for this EXACT log:

```
[OAuth Callback] ====== CALLBACK CALLED ======
```

### If you see it:
- ✅ **Callback IS being called**
- Copy ALL logs from this point forward
- Send them to Claude
- We'll debug why companies aren't being created

### If you DON'T see it:
- ❌ **Callback is NOT being called**
- Redirect URL in Whop dashboard is wrong
- Or Whop Apps don't use OAuth callback
- Check redirect URL: `https://linkvault-five.vercel.app/api/auth/callback`

---

## STEP 5: Check What Happens

### If callback is called, look for:

1. **Token exchange:**
   ```
   [OAuth Callback] Exchanging code for tokens...
   [OAuth Callback] Token exchange successful
   ```
   - ✅ If you see this: Token exchange works
   - ❌ If you see error: Check credentials

2. **Company fetching:**
   ```
   [OAuth Callback] Fetching user's companies...
   [OAuth Callback] Companies fetched { count: X }
   ```
   - ✅ If count > 0: Companies found
   - ❌ If count = 0: User has no companies

3. **Company creation:**
   ```
   [OAuth Callback] Upserting companies...
   [OAuth Callback] Company upserted { companyId: "...", whopCompanyId: "biz_xxx" }
   ```
   - ✅ If you see this: Company created
   - ❌ If you don't: Company creation failed

4. **User linking:**
   ```
   [OAuth Callback] User upserted { companyId: "...", companiesCreated: 1 }
   ```
   - ✅ If companyId exists: User linked
   - ❌ If companyId is null: Linking failed

---

## STEP 6: Report Back

**Tell Claude:**

1. **Did you see `[OAuth Callback] ====== CALLBACK CALLED ======`?**
   - Yes / No

2. **If yes, what happened after?**
   - Copy all logs from that point
   - Include any errors

3. **If no, what did you see?**
   - Any other logs?
   - Any errors?
   - What URL did you get redirected to?

---

## ALTERNATIVE: Test Callback Route Directly

If installation doesn't trigger callback, test it manually:

1. **Visit:** `https://linkvault-five.vercel.app/api/auth/initiate`
2. **This should:** Redirect to Whop OAuth
3. **After approval:** Should redirect to callback
4. **Watch Vercel logs** during this flow

---

## WHAT TO SEND TO CLAUDE

After testing, send:

```
INSTALLATION TEST RESULTS:

1. Callback called? YES/NO
2. If YES, logs:
   [paste all logs from "[OAuth Callback] ====== CALLBACK CALLED ======" onwards]

3. If NO:
   - What URL did installation redirect to?
   - Any errors in browser console?
   - Any logs in Vercel at all?

4. Redirect URL in Whop dashboard:
   [paste the exact redirect URL]
```

