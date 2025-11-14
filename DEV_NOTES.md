# Development Notes - LinkVault Whop App

## Authentication Flow

### Iframe Auth (Primary Method)

**How it works:**
- App runs inside Whop iframe
- Whop automatically sends `x-whop-user-token` header on every request
- We verify this token using `@whop-apps/sdk`'s `validateToken()`
- No OAuth flow required for basic app functionality

**Implementation:**
- Use `verifyWhopUser()` from `lib/whopAuth.ts` in all protected API routes
- Returns `{ userId, companyId, email, ... }` or `null`
- Reject requests if `verifyWhopUser()` returns `null`

**Example:**
```typescript
import { verifyWhopUser } from "@/lib/whopAuth";

export async function POST(req: NextRequest) {
  const whopUser = await verifyWhopUser();
  if (!whopUser) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  
  // Use whopUser.userId, whopUser.companyId, etc.
}
```

### OAuth (Optional - For Advanced Features)

**When to use:**
- OAuth callback (`/api/auth/callback`) is kept for future "Connect Whop" button
- Not required for basic app installation
- Can be used for features that need broader API access

**Current status:**
- OAuth callback route exists but is not used for installation
- Installation works via iframe auth automatically

---

## API Authentication

### App API Key

**Usage:**
- Used for server-side Whop API calls (creating products, plans, etc.)
- Stored in `WHOP_API_KEY` environment variable
- Must have required permissions (see below)

**Example:**
```typescript
const apiKey = process.env.WHOP_API_KEY;
const response = await fetch("https://api.whop.com/api/v2/products", {
  headers: {
    Authorization: `Bearer ${apiKey}`,
  },
});
```

### Required Permissions

**App must have these permissions in Whop dashboard:**
- `products:create` - To create Whop products
- `plans:create` - To create Whop plans
- `access_pass:create` - To create access passes (if needed)
- `access_pass:basic:read` - To read access passes (if needed)

**How to add permissions:**
1. Go to Whop Developer Dashboard
2. Select your app
3. Go to "Permissions" tab
4. Click "Add permissions"
5. Select required permissions
6. Save and reinstall app

**Runtime check:**
- `verifyAppPermissions()` in `lib/whopAuth.ts` checks if `WHOP_API_KEY` is configured
- API routes return helpful errors if permissions are missing

---

## Product Creation Flow

### Endpoint: `POST /api/products/create-with-plan`

**Steps:**
1. Verify user via iframe token (`verifyWhopUser()`)
2. Get or create user in database
3. Get or create company (if `companyId` in token)
4. Get or create Whop product (using App API Key)
5. Create product in our database
6. Create Whop plan (using App API Key)
7. Link plan to product

**Authentication:**
- User: Verified via iframe token
- API calls: Use App API Key (`WHOP_API_KEY`)

**Error handling:**
- 401: Invalid iframe token → User not authenticated
- 403: Missing app permissions → Need to add permissions in Whop dashboard
- 500: Other errors → Check logs

---

## Company Management

### Automatic Company Creation

**When:**
- First request from a user with `companyId` in iframe token
- Company record is automatically created/upserted

**How:**
- `getOrCreateCompany()` function in `create-with-plan/route.ts`
- Creates company with `whopCompanyId` from token
- Links user to company

**No OAuth required:**
- Company info comes from iframe token
- No need to fetch companies via OAuth API

---

## Environment Variables

### Required:
- `WHOP_API_KEY` - App API Key for server-side API calls
- `WHOP_APP_ID` - App ID (used by iframe SDK)
- `DATABASE_URL` - PostgreSQL connection string

### Optional:
- `WHOP_CLIENT_ID` - For OAuth (if using OAuth features)
- `WHOP_CLIENT_SECRET` - For OAuth (if using OAuth features)
- `NEXT_PUBLIC_WHOP_REDIRECT_URL` - For OAuth callback (if using OAuth)

---

## Common Issues

### 401 "Authentication required"
**Cause:** Invalid or missing `x-whop-user-token` header
**Solution:** Ensure app is accessed from within Whop iframe

### 403 "Missing app permissions"
**Cause:** App API Key doesn't have required permissions
**Solution:** Add permissions in Whop dashboard → Permissions → Add required permissions

### 401 "The API Key supplied does not have permission"
**Cause:** App API Key missing or wrong permissions
**Solution:** 
1. Check `WHOP_API_KEY` is set in Vercel
2. Add `products:create` and `plans:create` permissions in Whop dashboard
3. Reinstall app after adding permissions

### Company table empty
**Cause:** Companies are created on-demand when users make requests
**Solution:** This is normal - companies are created automatically when needed

---

## Migration from OAuth to Iframe Auth

**What changed:**
- Removed dependency on OAuth callback for installation
- Switched to iframe token verification
- Using App API Key instead of OAuth tokens for API calls

**What stayed:**
- OAuth callback route exists (for future use)
- Database schema unchanged
- Product creation logic similar (just different auth)

**Benefits:**
- Simpler installation (no OAuth flow needed)
- More reliable (iframe token always available)
- Better for Whop Apps (native iframe support)

---

## Testing

### Test iframe auth:
1. Open app in Whop iframe
2. Make API request (e.g., create product)
3. Should work automatically (token in header)

### Test App API Key:
1. Check `WHOP_API_KEY` is set in Vercel
2. Try creating a product
3. Should use App API Key for Whop API calls

### Test permissions:
1. Remove a permission in Whop dashboard
2. Try creating a product
3. Should get 403 error with helpful message

