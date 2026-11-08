"""Locust load test for the Sheep Portal: many farmers signing in and using the farmer portal at once.

Each simulated farmer:  opens the entry page -> types a civil ID -> starts the sign-in -> polls the status every 2 s until
"approved" (like the real page) -> opens the farmer portal -> keeps browsing it until the test ends.

ONLY run this against a TEST instance: PACI_MODE=mock, its own empty database filled by `npm run loadtest:seed`.
It never talks to PACI, Sahel or e-services. See loadtest/README.md.

Settings (environment variables):
  LOADTEST_CITIZENS   how many fake farmers were seeded (default 4000); every simulated person uses a different one
  LOADTEST_WORKERS    how many Locust worker processes you start (default 1); needed so workers do not share civil IDs
  LOADTEST_MAX_WAIT   seconds a person waits for approval before giving up (default 130)
"""
import itertools
import os
import random
import time

from locust import HttpUser, between, task

CITIZENS = int(os.getenv("LOADTEST_CITIZENS", "4000"))
MAX_WAIT = int(os.getenv("LOADTEST_MAX_WAIT", "130"))
WORKERS = int(os.getenv("LOADTEST_WORKERS", "1"))
_next_person = itertools.count()


def civil_id(i: int) -> str:
    return str(900000000000 + i * 10)  # same numbering as scripts/loadtest-seed.ts


class Farmer(HttpUser):
    wait_time = between(5, 15)  # think time between page views once signed in

    def on_start(self):
        # Each worker process counts on its own, so worker k takes IDs k, k+WORKERS, k+2*WORKERS, ... (never the same twice).
        worker = getattr(self.environment.runner, "worker_index", 0) or 0
        self.civil = civil_id((next(_next_person) * WORKERS + worker) % CITIZENS)
        # The portal limits sign-ins per client address (as it must in production), so every simulated person gets their own
        # address, the way the forwarding server reports real visitors in X-Forwarded-For.
        n = int(self.civil) // 10 % 16_000_000
        self.ip = f"10.{(n >> 16) & 255}.{(n >> 8) & 255}.{n & 255}"
        self.client.headers.update({"X-Forwarded-For": self.ip})
        self.signed_in = False
        self.sign_in()

    # ---------------------------------------------------------------- the sign-in
    def sign_in(self):
        began = time.time()
        self.client.get("/", name="entry page")
        time.sleep(random.uniform(2, 6))  # typing the civil ID

        with self.client.post(
            "/api/auth/start",
            json={"civilId": self.civil},
            headers={"Origin": self.host.rstrip("/")},
            name="sign-in: start",
            catch_response=True,
        ) as start:
            body = start.json() if start.headers.get("content-type", "").startswith("application/json") else {}
            if start.status_code != 200 or not body.get("attempt"):
                start.failure(f"HTTP {start.status_code} {body.get('error', '')}")
                return
            attempt = body["attempt"]

        deadline = time.time() + MAX_WAIT
        while time.time() < deadline:
            time.sleep(2)  # the real page polls every 2 seconds
            with self.client.get(f"/api/auth/status?attempt={attempt}", name="sign-in: status poll", catch_response=True) as poll:
                if poll.status_code != 200:
                    poll.failure(f"HTTP {poll.status_code}")
                    continue
                status = poll.json().get("status")
                if status == "PENDING":
                    continue
                if status != "APPROVED":
                    poll.failure(f"sign-in ended as {status}")
                    return
                self.signed_in = True
                break
        else:
            self.environment.events.request.fire(
                request_type="FLOW", name="sign-in: total", response_time=(time.time() - began) * 1000,
                response_length=0, exception=Exception("timed out waiting for approval"), context={},
            )
            return

        self.environment.events.request.fire(
            request_type="FLOW", name="sign-in: total", response_time=(time.time() - began) * 1000,
            response_length=0, exception=None, context={},
        )
        self.client.get("/farmer", name="farmer portal")

    # --------------------------------------------------------------- after signing in
    @task(5)
    def view_farmer_portal(self):
        if self.signed_in:
            self.client.get("/farmer", name="farmer portal")

    @task(1)
    def view_home(self):
        if self.signed_in:
            self.client.get("/", name="home (portal list)")
