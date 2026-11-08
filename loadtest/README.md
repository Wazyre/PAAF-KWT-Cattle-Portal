# Load test (Locust)

Simulates thousands of farmers signing in and browsing the farmer portal at once. Each simulated farmer opens the entry page, starts a sign-in, polls for the approval every 2 seconds (like the real page), then keeps opening the farmer portal.

**Only run it against a separate TEST copy of the portal.** The test copy runs in mock PACI mode (anyone can sign in), so never turn that on for the real portal. The test never contacts PACI, Sahel or e-services.

## 1. Set up the test copy

On the machine you want to measure, next to the real portal (or instead of it, while the real one is stopped):

1. Create a second database, e.g. `sheep_portal_loadtest`. Its name must contain `test` or `load`; the seed script refuses anything else.
2. Start a second copy of the portal on another port with these settings (environment variables, not the real `.env`):
   ```
   DATABASE_URL=postgresql://sheep:sheep@127.0.0.1:5432/sheep_portal_loadtest?schema=public
   PACI_MODE=mock
   PACI_MOCK_DELAY_SECONDS=15      # how long a simulated person takes to approve (the real time is about 10-30 s)
   SESSION_SECRET=anything-for-the-test
   ```
   then `npx prisma db push`, `npm run build` and `npx next start -p 3100`.
3. Fill that database with fake farmers (60% with a submitted declaration):
   ```
   npm run loadtest:seed -- --count 4000 --declared 60
   ```
   They have civil IDs `900000000000`, `900000000010`, … that can never be real. `npm run loadtest:seed -- --remove` deletes them again.

## 2. Run Locust

Install it once (`pip install locust`), ideally on a **different computer** than the portal, so the test itself does not steal the portal's CPU. One Locust process tops out around 1,000 requests per second, so use several workers for thousands of users. From the project folder:

```
# the web screen: open http://localhost:8089, enter 4000 users and a spawn rate of 100
locust -f loadtest/locustfile.py -H http://<portal-pc>:3100

# or without a screen, with 6 worker processes (start the workers first, one window each; use the same number below)
set LOADTEST_WORKERS=6
locust -f loadtest/locustfile.py --worker
locust -f loadtest/locustfile.py --master --expect-workers 6 --headless -H http://<portal-pc>:3100 -u 4000 -r 100 -t 5m --csv results
```

`LOADTEST_WORKERS` must equal the number of workers (it stops two workers from using the same civil ID). `LOADTEST_CITIZENS` (default 4000) must not exceed the number you seeded.

## 3. Read the results

- **Failures** should stay near 0%. Failures of the sign-in start with `HTTP 429` mean the test is reusing civil IDs or addresses, not that the portal is slow.
- **sign-in: total** should be the approval delay plus a few seconds (about 21 s with a 15 s delay and the typing pause).
- **farmer portal** and **sign-in: status poll**: watch the 95th and 99th percentiles, not the average.
- On the portal PC, watch CPU, memory and the PostgreSQL connection count in Task Manager while it runs.

## What this does not test

Submitting declarations (writes to the database), the investigator portals, the real PACI and e-services calls (in live mode the portal asks e-services about every waiting person every 4 seconds), HTTPS, and the forwarding server. Test those separately.
