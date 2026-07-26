# Sprout Pilot

Sprout Pilot is a one-zone plant monitoring and attended watering prototype. A
Particle Photon 2 reports soil moisture and safety inputs; this web dashboard
shows moisture history, local weather context, alerts, policy, and bounded
manual watering state.

Current V0 is **monitoring plus attended manual doses only**. Automatic and
unattended watering remain disabled until hardware interlocks, calibration, and
physical fault tests pass.

## Run the interactive demo

Requirements: Node.js `>=22.13.0` and npm.

```sh
npm ci
npm run demo
```

Open the local URL printed by the server, usually
[`http://localhost:3000`](http://localhost:3000). Demo mode needs no database,
Particle account, token, or connected hardware.

Use the **Plant scenario** picker to show:

- Healthy plant
- Dry soil
- Active watering
- Rain suppression
- Low reservoir
- Leak detection
- Soil-probe fault
- Offline controller

Demo data is visibly labeled. Watering and policy controls are read-only, the
local D1 binding is omitted, and write APIs fail before any Particle dispatch.
The same interactive example is available at `/demo` while using normal local
development.

## Run normal local development

Apply the local D1 migration, then start the app:

```sh
npm run db:local
npm run dev
```

With no real telemetry, the dashboard safely falls back to labeled mock data.
To exercise telemetry or other write APIs, copy `.dev.vars.example` to
`.dev.vars`, replace `INGEST_TOKEN` with a long random local value, and set:

```text
ALLOW_INSECURE_LOCAL_CONTROL=true
ALLOW_REMOTE_WATERING=false
```

The local control bypass is accepted only for loopback requests. Never enable it
in hosting.

Do not add Particle credentials until the hardware and attended test gates in
[`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) have passed.

## Verify the software

```sh
npm run typecheck
npm run lint
npm test
```

Firmware logic can be tested on the host without a Photon 2:

```sh
make -C firmware test CXX=clang++
```

## Project map

- `app/` — dashboard pages and API routes
- `lib/contracts.ts` — shared API and dashboard types
- `lib/server/` — validation, storage, weather, Particle bridge, and safety rules
- `db/` and `drizzle/` — D1 schema and migration
- `firmware/` — Photon 2 application and host-side safety tests
- `config/` — Particle webhook template
- `docs/PARTS.md` — prototype bill of materials
- `docs/WIRING.md` — wiring and hardware interlocks
- `docs/CLOUD_SETUP.md` — D1, secrets, telemetry, and Particle setup
- `docs/LOWER_MODEL_HANDOFF.md` — packetized implementation and test handoff

## Safety boundary

- Never connect a pump directly to GPIO.
- Pump output must default off during boot, reset, OTA, and faults.
- Hardware float cutoff, fuse, flyback protection, and MOSFET input pull-down
  remain mandatory.
- Tank, leak, sensor, or storage faults inhibit and stop watering locally.
- Weather may display, delay, or veto. It never starts a pump.
- Browser code never receives Particle or ingest secrets.
- Demo data never authorizes watering.
- Live dashboard reads and all control routes fail closed unless a protected
  authenticated identity is on `DASHBOARD_ALLOWED_EMAILS`, or the loopback-only
  local development bypass is explicitly enabled.

See [`docs/WIRING.md`](docs/WIRING.md) before connecting power or water.
