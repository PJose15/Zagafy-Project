# Backup Strategy

Phase 5.12. Production database backup and recovery procedures.

---

## Recovery Targets

| Metric | Target | Mechanism |
|--------|--------|-----------|
| **RPO** (Recovery Point Objective) | 1 hour | Neon PITR with WAL archiving |
| **RTO** (Recovery Time Objective) | 4 hours | Neon branch restore + DNS update |

---

## 1. Neon Point-in-Time Recovery (PITR)

Neon provides automatic PITR via WAL (Write-Ahead Log) archiving.

**Coverage:**
- Free tier: 7 days of history
- Pro tier: 30 days of history

**Verification steps:**
1. Open Neon Console -> select the project
2. Go to **Branches** -> click the main branch
3. Click **Restore** -> select a point in time from the past 24 hours
4. Neon creates a new branch at that point in time
5. Connect to the restored branch and verify data:
   ```sql
   SELECT count(*) FROM users;
   SELECT count(*) FROM stories;
   SELECT count(*) FROM chapters;
   ```
6. Compare counts against production to confirm restore is complete
7. Delete the test branch when done

**Status:** Verify in Neon Dashboard that PITR is active for your plan tier.

---

## 2. Weekly Logical Export

A `pg_dump` runs every Sunday at 03:00 UTC via GitHub Actions, uploading
a gzipped SQL file to Cloudflare R2.

**Files:**
- `scripts/backup-db.sh` — backup script (pg_dump + R2 upload + 90-day pruning)
- `.github/workflows/backup.yml` — weekly cron trigger

**Required GitHub Secrets:**

| Secret | Value |
|--------|-------|
| `DATABASE_URL` | Neon connection string |
| `R2_BUCKET` | R2 bucket name (e.g., `zagafy-backups`) |
| `R2_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` |
| `R2_ACCESS_KEY_ID` | R2 API token access key |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret key |

**Setup:**
1. Create an R2 bucket in Cloudflare Dashboard
2. Create an R2 API token with Object Read & Write permissions
3. Add the 5 secrets above to GitHub repo -> Settings -> Secrets -> Actions
4. Manually trigger the workflow to verify: Actions -> Weekly Database Backup -> Run workflow

**Retention:** Backups older than 90 days are automatically pruned.

---

## 3. Restore Procedures

### From Neon PITR (preferred — fastest)

1. Open Neon Console -> Branches -> main branch -> **Restore**
2. Select the target timestamp
3. Neon creates a restore branch with a new connection string
4. Update `DATABASE_URL` in Vercel environment variables
5. Redeploy the app
6. Verify data integrity (see verification queries above)
7. Once confirmed, promote the restore branch to main

**Estimated RTO:** 15-30 minutes.

### From Weekly Logical Backup (disaster recovery)

Use this when Neon PITR is unavailable or data loss exceeds the PITR window.

1. Download the backup from R2:
   ```bash
   aws s3 cp s3://zagafy-backups/weekly/zagafy-backup-<timestamp>.sql.gz ./backup.sql.gz \
     --endpoint-url https://<account>.r2.cloudflarestorage.com
   ```

2. Create a new Neon project (or branch):
   ```bash
   # Via Neon CLI or Dashboard
   neonctl branches create --name restore-$(date +%Y%m%d)
   ```

3. Restore:
   ```bash
   gunzip -c backup.sql.gz | psql "${NEW_DATABASE_URL}"
   ```

4. Verify data integrity
5. Update `DATABASE_URL` in Vercel and redeploy

**Estimated RTO:** 1-4 hours depending on database size.

---

## 4. Quarterly Restore Drill

Perform a restore drill every quarter to verify backups are usable.

**Checklist:**
- [ ] Download most recent weekly backup from R2
- [ ] Create a temporary Neon branch
- [ ] Restore the backup into the branch
- [ ] Run verification queries (user count, story count, chapter count)
- [ ] Compare against production counts
- [ ] Test the app against the restored database (update DATABASE_URL locally)
- [ ] Document results below
- [ ] Delete the temporary branch

**Drill Log:**

| Date | Type | Result | Notes |
|------|------|--------|-------|
| — | — | — | First drill pending after R2 setup |

---

## 5. What Is NOT Backed Up

- **IndexedDB (client-side):** User manuscripts stored locally before sync. Users are responsible for their local data. The sync engine (`/api/sync/push`) is the mechanism to persist client data to the server.
- **Stripe data:** Stripe is the source of truth for billing. Subscription state is mirrored in our `users` table but can be reconstructed from Stripe webhooks.
- **PostHog / Sentry data:** Analytics and error tracking are stored in their respective SaaS platforms, not in our database.
