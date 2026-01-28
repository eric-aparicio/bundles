# Railway Cron Configuration for Bi-Weekly Inventory Sync

## Overview

This guide explains how to configure Railway to automatically run the bi-weekly inventory sync every 1st and 15th of the month.

---

## Method 1: Railway Cron Jobs (Recommended)

### Step 1: Open Railway Dashboard

1. Go to https://railway.app/dashboard
2. Select your project: **bundles-production**
3. Click on your service: **bundles**

### Step 2: Add Cron Job

1. Click on **"Settings"** tab
2. Scroll to **"Cron Jobs"** section (or create new Cron service)
3. Click **"Add Cron Job"**

### Step 3: Configure Schedule

**Schedule (Cron Expression):**

```
0 0 1,15 * *
```

**Explanation:**

- `0` - Minute: 0 (at the start of the hour)
- `0` - Hour: 0 (midnight UTC)
- `1,15` - Day of month: 1st and 15th
- `*` - Month: Every month
- `*` - Day of week: Any day

**This runs twice per month:**

- 1st of every month at 00:00 UTC
- 15th of every month at 00:00 UTC

### Step 4: Set Command

**Command:**

```bash
npm run sync-inventory
```

or directly:

```bash
node cron-sync-inventory.js
```

### Step 5: Environment Variables

Ensure these variables are set in Railway:

- `DATABASE_URL` - PostgreSQL connection string
- `SHOP` - Your Shopify shop domain
- `SHOPIFY_ADMIN_API_ACCESS_TOKEN` - Admin API token

These should already be configured from your main service.

### Step 6: Save and Enable

1. Click **"Save"**
2. Toggle the cron job to **"Enabled"**
3. ✅ Done!

---

## Method 2: External Cron Service (Alternative)

If Railway doesn't support cron jobs in your plan, use an external service:

### Option A: EasyCron (easycron.com)

1. Sign up at https://www.easycron.com
2. Create new cron job:
   - **URL:** `https://bundles-production.up.railway.app/api/trigger-sync-inventory`
   - **Schedule:** Day 1,15 at 00:00
3. Add authentication header if needed

### Option B: Cron-Job.org (cron-job.org)

1. Sign up at https://cron-job.org
2. Create cron job:
   - **URL:** `https://bundles-production.up.railway.app/api/trigger-sync-inventory`
   - **Schedule:** `0 0 1,15 * *`
3. Enable notifications for failures

**Note:** For external services, you'll need to create an endpoint that triggers the sync. See "Trigger Endpoint" section below.

---

## Trigger Endpoint (For External Cron Services)

If using external cron, add this to `server.js`:

```javascript
// Trigger bi-weekly inventory sync (for external cron services)
app.post("/api/trigger-sync-inventory", async (req, res) => {
  try {
    // Optional: Add authentication
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Import and run sync
    const { syncInventoryBiWeekly } = await import("./cron-sync-inventory.js");

    // Run in background (don't wait for completion)
    syncInventoryBiWeekly().catch(console.error);

    res.json({
      success: true,
      message: "Sync started",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error triggering sync:", error);
    res.status(500).json({ error: error.message });
  }
});
```

Add `CRON_SECRET` to Railway environment variables for security.

---

## Testing the Cron Job

### Test Locally

```bash
cd c:\Users\iriza\bundles-v2
npm run sync-inventory
```

**Expected output:**

```
================================================================================
🔄 BI-WEEKLY INVENTORY SYNC
================================================================================
📅 Date: 2026-01-28T10:00:00.000Z
🏪 Shop: your-shop.myshopify.com

📦 Products in database: 568

⚙️  Processing 12 batches (50 products each)

📊 Batch 1/12 (products 1-50)
   ✅ 10 products synced...
   ...
   ✅ Batch 1 completed (50/568)

...

================================================================================
✅ SYNC COMPLETED
================================================================================
⏱️  Duration: 284.50 seconds
📦 Products updated: 568/568

📅 Next sync scheduled: 2/12/2026 12:00:00 AM
================================================================================
```

### Test via Railway CLI

```bash
railway run npm run sync-inventory
```

### Check Logs in Railway

1. Go to Railway Dashboard → bundles → **Logs**
2. Filter by: `BI-WEEKLY INVENTORY SYNC`
3. Verify sync completed successfully

---

## Monitoring

### View Sync History

Connect to PostgreSQL and query:

```sql
SELECT
  type,
  status,
  "productsCount",
  duration,
  "createdAt",
  metadata
FROM "SyncLog"
WHERE type = 'bi_weekly_sync'
ORDER BY "createdAt" DESC
LIMIT 10;
```

### Check Last Sync

```sql
SELECT
  status,
  "productsCount",
  "createdAt",
  metadata->>'nextSync' as next_sync
FROM "SyncLog"
WHERE type = 'bi_weekly_sync'
ORDER BY "createdAt" DESC
LIMIT 1;
```

### Sync Success Rate

```sql
SELECT
  status,
  COUNT(*) as count,
  AVG(duration) as avg_duration_ms
FROM "SyncLog"
WHERE type = 'bi_weekly_sync'
GROUP BY status;
```

---

## Troubleshooting

### Cron Job Not Running

**Check:**

1. Cron job is **enabled** in Railway
2. Schedule expression is correct: `0 0 1,15 * *`
3. Command is correct: `npm run sync-inventory`
4. Service has necessary environment variables

**Test manually:**

```bash
railway run npm run sync-inventory
```

### Rate Limit Errors

If you see "429 Too Many Requests":

1. The script already handles this with 10-second pauses
2. Reduce batch size in `cron-sync-inventory.js`:
   ```javascript
   const batchSize = 25; // Reduced from 50
   ```
3. Increase delay between requests:
   ```javascript
   await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 second instead of 500ms
   ```

### Partial Sync

If sync status is `partial`:

1. Check SyncLog metadata for errors:
   ```sql
   SELECT metadata->>'errors' FROM "SyncLog"
   WHERE type = 'bi_weekly_sync' AND status = 'partial'
   ORDER BY "createdAt" DESC LIMIT 1;
   ```
2. Products with errors will be skipped
3. Run manual sync again: `npm run sync-inventory`

### Database Connection Issues

```
Error: Can't reach database server
```

**Fix:**

1. Check `DATABASE_URL` is set in Railway
2. Verify PostgreSQL service is running
3. Check network connectivity

---

## Performance

**Estimated sync time:**

- **100 products:** ~50 seconds
- **500 products:** ~4 minutes
- **1000 products:** ~8 minutes

**API calls:**

- 1 request per product
- Rate limit: 2 req/sec (500ms delay)
- Well below Shopify's 4 req/sec limit

**Cost savings:**

- **Before:** Real-time sync = ~10,000 API calls/day
- **After:** Bi-weekly sync = ~1,000 API calls/month
- **Reduction:** ~97% fewer API calls

---

## Next Sync

To check when the next sync will run:

```sql
SELECT
  metadata->>'nextSync' as next_sync_date
FROM "SyncLog"
WHERE type = 'bi_weekly_sync'
ORDER BY "createdAt" DESC
LIMIT 1;
```

Or view in logs after each sync:

```
📅 Next sync scheduled: 2/15/2026 12:00:00 AM
```

---

## Summary

✅ **Schedule:** 1st and 15th of every month at midnight UTC  
✅ **Command:** `npm run sync-inventory`  
✅ **Monitoring:** Check `SyncLog` table  
✅ **API calls reduced:** ~97%  
✅ **Automatic:** No manual intervention needed

**Your inventory will stay fresh with minimal API usage!**
