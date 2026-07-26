# Dashboard, D1, weather, and Particle setup

## Local dashboard

Requirements: Node.js 22.13 or newer and npm.

For a deterministic, read-only example with no D1 binding or hardware access:

```sh
npm ci
npm run demo
```

Use the scenario picker to preview healthy, dry, watering, weather, tank, leak,
sensor-fault, and offline states. Demo write APIs fail before Particle dispatch.

For normal local API development:

```sh
npm run db:local
cp .dev.vars.example .dev.vars
npm run dev
```

Open the URL printed by the server, normally `http://localhost:3000`. Normal
development intentionally shows labeled demo data until a real telemetry row
exists. `npm run db:local` is repeatable and applies the generated D1 migrations
to project-local Wrangler state.

Generate a long random `INGEST_TOKEN` and place it only in `.dev.vars` or a deployed secret store. Do not commit `.dev.vars`, Particle access tokens, or device credentials.

For local API development, set `ALLOW_INSECURE_LOCAL_CONTROL=true`. That bypass
is accepted only for loopback requests and must never be enabled in hosting.

## Real weather

Set `WEATHER_LATITUDE` and `WEATHER_LONGITUDE` in server environment. The backend fetches Open-Meteo at most once per 30 minutes per running instance and falls back to labeled demo weather on missing config, timeout, or provider error.

Weather is dashboard context only in V0. It does not start the pump. A future automatic policy may use fresh forecast data only to suppress or delay watering.

Review the weather provider's commercial license and attribution terms before selling the product.

## Telemetry ingress smoke test

With the local server running and the same secret set in `.dev.vars`:

```sh
curl -X POST http://localhost:3000/api/telemetry \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_INGEST_TOKEN' \
  --data '{
    "version": 1,
    "eventId": "test-device:1",
    "deviceId": "test-device",
    "sequence": 1,
    "recordedAt": "2026-07-25T12:00:00Z",
    "firmwareVersion": "0.1.0",
    "moistureRaw": 2200,
    "moisturePercent": 50,
    "airTemperatureC": null,
    "relativeHumidityPercent": null,
    "lightLux": null,
    "tankLow": false,
    "leakDetected": false,
    "pumpActive": false,
    "sensorStatus": "ok",
    "faultCode": null
  }'
```

Use a current `recordedAt` value; commands are blocked when telemetry or its measurement timestamp is more than 10 minutes old. Reposting the same `eventId` is safely deduplicated.

## Particle telemetry webhook

Firmware publishes private event `plant.telemetry.v1`. In Particle Console:

1. Define Particle integration environment variables `SPROUT_API_BASE_URL` and `SPROUT_INGEST_TOKEN`.
2. Paste `config/particle-webhook.template.json` into a custom webhook template.
3. Point `SPROUT_API_BASE_URL` at the HTTPS dashboard origin without a trailing slash.
4. Use the same long secret for deployed server `INGEST_TOKEN` and Particle `SPROUT_INGEST_TOKEN`.
5. Send a test event and confirm a `204` response in integration logs.

The `?source=particle` response is intentionally empty so it does not create an unnecessary `hook-response` event. Do not subscribe firmware to the telemetry webhook response.

## Remote watering

Server-side environment variables:

```text
PARTICLE_DEVICE_ID=<24-character device id>
PARTICLE_ACCESS_TOKEN=<server-only token>
ALLOW_REMOTE_WATERING=true
```

The browser never receives the Particle token. `POST /api/water` validates fresh real telemetry, operating mode, tank/leak/pump/sensor state, configured dose, minimum interval, daily limit, command UUID, and expiry. It then calls Particle function `water` with:

```text
<commandId>|<doseMl>|<expiresAtEpoch>
```

Firmware re-checks its own physical inputs, TTL, duplicate ID, dose/runtime cap, cooldown, and persisted daily cap before energizing D2.

Keep `ALLOW_REMOTE_WATERING=false` until all attended tests in `docs/WIRING.md` pass. Do not enable it on a public dashboard without real user authentication. If hosting supplies and protects `oai-authenticated-user-email`, set `REQUIRE_DASHBOARD_AUTH=true` and `DASHBOARD_ALLOWED_EMAILS` to a comma-separated allowlist. Live dashboard reads, policy changes, alert acknowledgement, and watering then require an allowed identity. Without that trusted-header contract, add the deployment's supported authentication layer first.

## Production deployment gate

This repository is configured for a Cloudflare D1 binding named `DB`, but it has not been published. Before any public deployment:

- Configure trusted user authentication and an exact account allowlist per plant/site.
- Store Particle and ingest tokens as server secrets.
- Apply D1 migrations to the remote database.
- Rate-limit write and telemetry routes.
- Rotate short-lived or narrowly scoped Particle tokens.
- Add audit logs and command completion reconciliation.
- Verify webhook origin/secret handling and alerting.
- Complete pump, leak, tank, offline, reset, and OTA fault tests on physical hardware.
