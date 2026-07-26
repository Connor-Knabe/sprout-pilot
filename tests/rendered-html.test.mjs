import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { env as workerEnv } from "./cloudflare-workers-stub.mjs";

let workerPromise;

async function getWorker() {
  workerPromise ??= (async () => {
    const workerUrl = new URL("../dist/server/index.js", import.meta.url);
    workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
    return (await import(workerUrl.href)).default;
  })();
  return workerPromise;
}

async function request(path = "/", init = {}) {
  const worker = await getWorker();
  return worker.fetch(
    new Request(`http://localhost${path}`, init),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Sprout Pilot shell and metadata", async () => {
  const response = await request("/", {
    headers: { accept: "text/html" },
  });

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Sprout Pilot \| Plant watering dashboard<\/title>/i);
  assert.match(html, /Reading your plant/);
  assert.match(html, /Loading soil moisture, weather, and pump safety state/);
  assert.match(html, /\/og\.png/);
  assert.doesNotMatch(html, /Your site is taking shape|react-loading-skeleton/i);
});

test("server-renders the dedicated interactive demo route", async () => {
  const response = await request("/demo", {
    headers: { accept: "text/html" },
  });

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>Interactive demo \| Sprout Pilot<\/title>/i);
  assert.match(html, /Reading your plant/);
});

test("dashboard API returns the typed demo snapshot without a configured D1", async () => {
  const response = await request("/api/dashboard", {
    headers: { accept: "application/json" },
  });

  assert.equal(response.status, 200);
  const snapshot = await response.json();
  assert.equal(snapshot.device.id, "demo-device");
  assert.equal(snapshot.zone.id, "zone-1");
  assert.equal(snapshot.policy.mode, "monitor");
  assert.equal(snapshot.policy.calibrated, false);
  assert.ok(Array.isArray(snapshot.readings));
  assert.ok(snapshot.readings.length >= 12);
  assert.match(snapshot.weather.condition, /mock/i);
});

test("explicit demo scenarios are deterministic and invalid names fail closed", async () => {
  const leakResponse = await request("/api/dashboard?demo=leak", {
    headers: { accept: "application/json" },
  });

  assert.equal(leakResponse.status, 200);
  const leak = await leakResponse.json();
  assert.equal(leak.device.id, "demo-device");
  assert.equal(leak.zone.leakDetected, true);
  assert.ok(leak.alerts.some((alert) => alert.id === "demo-leak"));

  const invalidResponse = await request("/api/dashboard?demo=unknown", {
    headers: { accept: "application/json" },
  });
  assert.equal(invalidResponse.status, 400);
  const invalid = await invalidResponse.json();
  assert.equal(invalid.error.code, "invalid_demo_scenario");
});

test("telemetry ingress is default-deny without its server secret", async () => {
  const response = await request("/api/telemetry", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });

  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.error.code, "ingest_not_configured");
});

test("write APIs fail before dispatch when D1 is absent", async () => {
  const policyResponse = await request("/api/policy", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      mode: "monitor",
      dryThresholdPercent: 30,
      targetMoisturePercent: 45,
      doseMl: 50,
      minimumHoursBetweenRuns: 6,
      dailyLimitMl: 250,
      rainSuppressionEnabled: true,
    }),
  });

  assert.equal(policyResponse.status, 503);
  const policyBody = await policyResponse.json();
  assert.equal(policyBody.error.code, "control_auth_not_configured");

  const waterResponse = await request("/api/water", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      commandId: "019f9727-309c-74e0-9900-aae42606c4f7",
      zoneId: "zone-1",
      doseMl: 50,
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
    }),
  });

  assert.equal(waterResponse.status, 503);
  const waterBody = await waterResponse.json();
  assert.equal(waterBody.error.code, "control_auth_not_configured");
});

test("dashboard controls require an allowlisted trusted identity", async (t) => {
  workerEnv.REQUIRE_DASHBOARD_AUTH = "true";
  workerEnv.DASHBOARD_ALLOWED_EMAILS = "owner@example.test";
  t.after(() => {
    delete workerEnv.REQUIRE_DASHBOARD_AUTH;
    delete workerEnv.DASHBOARD_ALLOWED_EMAILS;
  });

  const body = JSON.stringify({
    mode: "monitor",
    dryThresholdPercent: 30,
    targetMoisturePercent: 45,
    doseMl: 50,
    minimumHoursBetweenRuns: 6,
    dailyLimitMl: 250,
    rainSuppressionEnabled: true,
  });

  const missingIdentity = await request("/api/policy", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body,
  });
  assert.equal(missingIdentity.status, 401);

  const deniedIdentity = await request("/api/policy", {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "oai-authenticated-user-email": "other@example.test",
    },
    body,
  });
  assert.equal(deniedIdentity.status, 403);

  const crossSite = await request("/api/policy", {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "oai-authenticated-user-email": "owner@example.test",
      origin: "https://attacker.example",
    },
    body,
  });
  assert.equal(crossSite.status, 403);

  const allowedIdentity = await request("/api/policy", {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "oai-authenticated-user-email": "OWNER@example.test",
      origin: "http://localhost",
    },
    body,
  });
  assert.equal(allowedIdentity.status, 503);
  const allowedBody = await allowedIdentity.json();
  assert.equal(allowedBody.error.code, "database_unavailable");
});

test("build packages site config, migration, and social preview", async () => {
  const [hosting, migration] = await Promise.all([
    readFile(new URL("../dist/.openai/hosting.json", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../dist/.openai/drizzle/0000_silky_pyro.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.deepEqual(JSON.parse(hosting), { d1: "DB", r2: null });
  assert.match(migration, /CREATE TABLE `telemetry_events`/);
  assert.match(migration, /CREATE TABLE `watering_events`/);
  await access(new URL("../public/og.png", import.meta.url));
  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
});
