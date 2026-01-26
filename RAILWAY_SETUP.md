# Railway Environment Variables Setup

## Required Variables

Copy your local `.env` values and add them to Railway dashboard:

1. Go to: https://railway.app/project/bundles/settings
2. Click on "Variables" tab
3. Add these variables:

```
SHOP=eeu1vq-iu.myshopify.com
SHOPIFY_ADMIN_API_ACCESS_TOKEN=<your_token_from_local_.env>
SHOPIFY_API_KEY=<your_api_key>
SHOPIFY_API_SECRET=<your_api_secret>
SHOPIFY_APP_URL=https://bundles-production.up.railway.app
SESSION_SECRET=<random_string_at_least_32_chars>
NODE_ENV=production
PORT=3000
```

## After adding variables:

Railway will automatically redeploy. Wait 2-3 minutes for the new deployment.

## Alternative: Use Railway CLI

```bash
# Set each variable individually
railway variables --kv
# Then paste: SHOP=eeu1vq-iu.myshopify.com

# Repeat for each variable
```

## Check current variables:

```bash
railway variables
```
