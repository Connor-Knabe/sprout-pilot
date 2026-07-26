# Sprout Pilot V0: lower-capability-model handoff

This document is a complete handoff for a friend supervising a less capable coding model. It is intentionally repetitive and explicit. Do not give the model every work packet at once. Give it the master prompt, then exactly one packet at a time. Do not advance until that packet's acceptance checks pass.

## 1. Freeze the scope

Finish a **one-zone, attended prototype** using:

- Particle Photon 2.
- One analog capacitive soil sensor.
- One peristaltic pump through a fused MOSFET driver.
- A separate normally-closed hardware float in the MOSFET control path.
- A second normally-closed tank-status float on `D3`.
- A leak input on `D4`.
- A web dashboard with soil moisture, weather context, alerts, policy, and bounded manual watering.
- D1 storage, Particle telemetry ingestion, and honest command history.

V0 supports **monitoring and attended manual doses only**. Automatic watering, unattended operation, multi-zone control, public deployment, and production hardware are separate future work. Weather may display, delay, or veto future behavior; it must never start a pump.

## 2. How the friend should run the handoff

1. Make a recoverable backup or authorized checkpoint before letting another model edit anything. The Git repository currently has no commits and every project file is untracked.
2. Give the model the master prompt below.
3. Give it one numbered packet only.
4. Require its completion report in the supplied format.
5. Independently inspect its diff and command output.
6. Advance only when every acceptance check passes.
7. A human performs all secret entry, cloud authorization, purchasing, wiring, flashing, and powered water tests.

If the model starts redesigning the system, adding automatic watering, deleting tests, or claiming hardware success, stop the session.

## 3. Copy-paste master prompt

Paste this once before Packet 0:

```text
You are finishing an existing project named Sprout Pilot in this repository. Do not recreate or replace it.

Read docs/LOWER_MODEL_HANDOFF.md completely. Complete only the work packet I give you. Read every file named by that packet immediately before editing it. Search for existing helpers and contracts before adding new ones. Make small surgical edits in the repository's existing style.

Hard rules:
- Never run git clean, git reset, git checkout, or bulk deletion. This repository has no commits and every project file is currently untracked.
- Never delete, skip, weaken, or rewrite a failing test merely to make it pass.
- Never add type/lint/security suppressions to hide an error.
- Never expose or print secrets. Never commit .dev.vars, Particle tokens, ingest tokens, or device credentials.
- Never deploy, create a cloud integration, upload source, compile in Particle Cloud, flash a device, or energize a pump without explicit operator authorization for that exact action.
- Never enable automatic watering. V0 is monitor/manual only.
- Never connect a pump directly to GPIO. Never remove the fuse, flyback protection, hardware float cutoff, leak input, or hardware pump-input pull-down.
- Never allow weather or cloud availability to energize a pump.
- Never automatically retry an ambiguous watering command.
- Never claim code, hardware, cloud, or physical behavior was verified unless you executed that exact verification and saw it pass.

Safety invariants:
- D2 and the MOSFET input default LOW during boot, reset, OTA, and failure.
- Device-side limits win over UI/backend settings.
- Tank, leak, sensor, or storage faults inhibit start and stop an active run.
- EEPROM reservation and verification happen before D2 can become HIGH.
- Commands use unique IDs and short expiries; duplicates never deliver a second dose.
- Browser code never receives Particle or ingest secrets.
- Delivered water remains unknown/null unless measured by a flow sensor.

For the packet:
1. State the contract and files you will touch.
2. Reproduce the current behavior before editing when fixing a failure.
3. Implement the smallest correct change.
4. Run every listed acceptance command.
5. Re-read the final diff as a hostile reviewer.
6. Stop on any failed command or stop condition. Report the exact error; do not continue into another packet.

End with:
- Packet completed:
- Files changed:
- Behavior changed:
- Commands executed and results:
- Safety invariants rechecked:
- Known limits:
- Ready for next packet: yes/no
```

## 4. Current repository truth

### Implemented

- Dashboard: `app/components/SproutDashboard.tsx`, `app/globals.css`, `app/layout.tsx`.
- APIs: `app/api/dashboard`, `telemetry`, `water`, `policy`, and alert acknowledgement.
- Shared contracts: `lib/contracts.ts`.
- Backend validation, safety, storage, Particle dispatch, and weather: `lib/server/`.
- D1 schema and initial migration: `db/`, `drizzle/0000_silky_pyro.sql`.
- Photon 2 firmware and host tests: `firmware/`.
- BOM, wiring, cloud setup, and architecture: `docs/`.
- Particle telemetry webhook template: `config/particle-webhook.template.json`.
- Social preview: `public/og.png`; do not regenerate it.
- Hardware-isolated local demo: `npm run demo`, `/demo`, and eight mock scenarios.
- Real project README, ignored TypeScript build state, and clean npm install.

### Verified on July 25, 2026

These passed:

```sh
npm run typecheck
npm run lint
npm test
npm run db:local
make -C firmware test CXX=clang++
```

Observed results:

- TypeScript passed.
- ESLint passed.
- Built-Worker integration tests passed: 7 tests.
- Mock-dashboard and watering unit tests passed: 16 tests.
- Firmware host tests passed: 97 assertions.
- Production web build passed and found the main page, demo page, and five API routes.
- Local D1 migration command completed with no pending migrations.

Packets 3 and 6 below are complete. Keep their acceptance checks as regression
coverage; do not reimplement them unless one of those checks fails.

### Known unfinished or unsafe areas

1. Firmware stops moisture sampling while the pump runs, so real sensor disconnection cannot reach the controller's runtime sensor-fault path.
2. A reset returns the controller to idle and bypasses the in-memory 60-second cooldown.
3. An unchanged sensor fault can force telemetry every five seconds instead of every five minutes.
4. Backend accepts command TTL up to five minutes; firmware accepts only 60 seconds.
5. Backend/UI can configure a daily limit above the firmware's fixed 250 mL limit.
6. Firmware publishes `plant.command-result.v1`, but no backend endpoint consumes terminal results. Commands remain `queued` indefinitely.
7. Alert acknowledgement API exists, but dashboard has no acknowledgement control.
8. Weather is fetched and displayed, but `weather_snapshots` is read without storing fresh provider results.
9. Firmware has not been cloud-compiled, flashed, or tested with hardware.
10. A floating unplugged `A0` may still appear electrically plausible. Disconnect detection needs physical proof.
11. If the MCU freezes while D2 is HIGH, the pump can run until the hardware tank float opens. V0 must remain attended with a limited reservoir. Unattended production needs an independent timer/watchdog plus flow or current feedback.

## 5. Definition of done for V0

Software is done only when:

- `npm ci`, typecheck, lint, build, all web tests, and all firmware host tests pass.
- API/UI/firmware limits agree.
- Telemetry is idempotently stored.
- An accepted water command becomes `running`, then `completed` or `interrupted` from a real device result event.
- Unknown delivery volume remains `null`; the UI does not imply measured flow.
- Dashboard alert acknowledgement works and does not clear a physical fault.
- Weather uses shared D1 cache/fallback and cannot start watering.
- Root README describes the real project and exact commands.
- No secrets, generated state, or stale starter dependency remains.

Firmware is code-complete only when:

- Host tests cover active-run sensor failure, boot cooldown, persistent budget corruption, duplicate commands, TTL, runtime, daily cap, and telemetry rate limiting.
- A host-compatible official Particle CLI reports its version.
- The operator explicitly authorizes source upload, and Photon 2 cloud compile succeeds.

Physical prototype is done only when a human verifies:

- Pump input never pulses HIGH on boot, reset, Wi-Fi reconnect, or OTA.
- Separate hardware float removes the MOSFET command independently of firmware.
- Tank, leak, and proven sensor-disconnect faults stop an active run.
- Wi-Fi loss does not prevent the local runtime cutoff.
- Reboot does not bypass cooldown.
- Measured dose is within ±15% after calibration.
- All tests remain attended with the outlet over a measuring cup before using a plant.

## 6. Work packets

### Packet 0 — Human checkpoint and orientation

Owner action before model edits:

- Create a recoverable backup or explicitly authorized initial Git checkpoint.
- Keep a copy of `public/og.png` and all current source files.
- Confirm no secret file will be included.

Model reads:

- `docs/LOWER_MODEL_HANDOFF.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/WIRING.md`
- `docs/PARTS.md`
- `docs/ADR-001-controller-platform.md`
- `docs/CLOUD_SETUP.md`
- `lib/contracts.ts`
- `firmware/README.md`

Model runs:

```sh
git status --short
node --version
npm --version
npm ci
npm run typecheck
npm run lint
node --import tsx --test tests/watering.test.ts
npm run build
make -C firmware test CXX=clang++
npm test
npm ls --depth=0
```

Acceptance:

- Node meets `>=22.13.0`.
- Typecheck, lint, focused backend tests, build, and firmware tests pass.
- `npm test` passes every built-Worker and unit test.
- `npm ls --depth=0` reports no extraneous dependency.
- No source file changes merely from verification.

Stop if any additional failure appears.

### Packet 1A — Detect sensor failure during an active run

Files to read first:

- `firmware/src/main.cpp`
- `firmware/src/core/moisture_filter.*`
- `firmware/src/core/watering_controller.*`
- `firmware/tests/host_tests.cpp`
- `docs/WIRING.md`

Contract:

- ADC plausibility continues to be checked during pump operation.
- Motor-noisy readings during a run do not enter the moisture trend filter or change the displayed moisture percentage.
- A confirmed invalid/disconnected sensor stops the pump and latches sensor lockout within a documented maximum latency.
- A single noisy sample must not cause a false lockout.

Implementation guidance:

- Move consecutive-sample plausibility tracking into a small platform-independent core type so host tests exercise real logic.
- Continue scheduled raw ADC checks while pumping.
- Feed the moisture median/smoothing path only while pump is off.
- Start with a conservative two-or-three-invalid-sample confirmation and document the resulting latency.
- Do not claim unplug detection is reliable from range checking alone. Packet 9 physically proves it and may require a verified input-bias resistor.

Acceptance:

```sh
make -C firmware clean
make -C firmware test CXX=clang++
```

Tests must demonstrate healthy/noisy samples, confirmed invalid samples, active-run stop, and unchanged trend data during pumping.

### Packet 1B — Prevent reset from bypassing cooldown

Files:

- `firmware/src/core/watering_controller.*`
- `firmware/src/main.cpp`
- `firmware/tests/host_tests.cpp`
- `firmware/README.md`

Contract:

- Every boot begins with pump output OFF and at least the local 60-second command hold.
- A command during boot hold is rejected as cooldown.
- A command becomes eligible only after the hold expires and all other checks pass.

Prefer an explicit controller boot-hold method/state over hidden timing in `main.cpp`. Do not weaken the persisted daily cap or duplicate protection.

Acceptance:

```sh
make -C firmware clean
make -C firmware test CXX=clang++
```

Tests must simulate a new controller after a dose and prove immediate follow-up is rejected.

### Packet 1C — Stop repeated fault-event flooding

Files:

- `firmware/src/main.cpp`
- `firmware/src/core/telemetry.*`
- `firmware/tests/host_tests.cpp`
- `firmware/README.md`

Contract:

- First validity/fault transition publishes promptly.
- An unchanged fault follows the five-minute cadence.
- Recovery publishes promptly.
- State transitions remain prompt.

Extract a pure scheduler/helper if necessary so host tests prove the behavior. Do not test Particle internals.

Acceptance: host tests pass and include transition, unchanged-fault, recovery, and timer-wrap cases.

### Packet 2 — Align UI, API, and firmware limits

Files:

- `lib/server/validation.ts`
- `lib/server/watering.ts`
- `app/components/SproutDashboard.tsx`
- `tests/watering.test.ts`
- New `tests/validation.test.ts`
- `docs/CLOUD_SETUP.md`
- `firmware/README.md`

Required V0 values:

- Browser command expiry: now + 30 seconds.
- Backend maximum TTL: 60 seconds.
- Backend manual dose: 10–100 mL.
- Firmware manual dose: 5–100 mL; local limit wins.
- Backend/UI daily policy maximum: 250 mL.
- Firmware daily cap: 250 mL.
- Browser-generated command ID: UUID.

Add tests for expired, 61-second, and valid 30-second commands; malformed UUID; dose boundaries; target moisture at least five points above dry threshold; and daily limit boundaries.

Use a test command that avoids the `tsx` CLI IPC behavior:

```sh
node --import tsx --test tests/*.test.ts
```

Acceptance:

```sh
npm run typecheck
npm run lint
node --import tsx --test tests/*.test.ts
make -C firmware test CXX=clang++
```

### Packet 3 — Cloudflare Worker integration-test harness (completed)

Files:

- `package.json`
- `tests/rendered-html.test.mjs`
- New test-only loader/stub files if required

Reproduce first:

```sh
npm run build
node --test tests/rendered-html.test.mjs
```

Contract:

- Test the built worker without changing production environment access.
- Preserve root HTML, demo dashboard, default-deny telemetry, packaged migration, and social-preview assertions.
- Correct the API error assertion to `body.error.code === "ingest_not_configured"`.

Preferred narrow solution:

- Add a test-only Node ESM loader that maps `cloudflare:workers` to a stub module exporting `env = {}`.
- Register the loader only for built-worker tests.
- Alternatively spawn `vinext start --hostname 127.0.0.1 --port <test port>`, make HTTP requests, and always terminate it. Use this only if the loader cannot faithfully execute the built worker.

Do not modify `db/index.ts`, production routes, or assertions merely to satisfy plain Node. Do not skip the three failing tests.

Also change `test:unit` to use `node --import tsx --test ...` so the test command does not require the `tsx` CLI IPC server.

Acceptance:

```sh
npm test
npm run typecheck
npm run lint
```

All tests pass with every original behavior assertion retained.

### Packet 4 — Complete the watering command lifecycle

Current problem: Particle HTTP acceptance queues a row, but terminal firmware results are never ingested. Dashboard history therefore lies by omission.

Files:

- `lib/contracts.ts`
- `db/schema.ts`
- A new additive Drizzle migration
- `lib/server/validation.ts`
- `lib/server/plant-repository.ts`
- `app/api/water/route.ts`
- New `app/api/command-result/route.ts`
- `firmware/src/main.cpp`
- Relevant firmware core files and host tests
- New command-result webhook template under `config/`
- API/unit tests and cloud docs

Data contract first. Add a versioned command-result envelope containing:

- Unique event ID.
- Command ID.
- Device ID.
- Recorded timestamp.
- Status: `running`, `completed`, `interrupted`, or `rejected`.
- Reason or `null`.
- Requested mL.
- Delivered mL: always `null` until a flow sensor exists.

Required behavior:

1. Successful Particle function acceptance updates `queued → running`.
2. Firmware publishes `completed` only when runtime ends normally.
3. Firmware publishes `interrupted` for tank, leak, confirmed sensor, or storage lockout.
4. New endpoint requires the same protected ingest secret pattern as telemetry.
5. Result events are stored by event ID for deduplication/audit.
6. Only legal forward status transitions update the watering row.
7. Duplicate events do nothing extra.
8. An unknown command produces a visible server alert/diagnostic but returns a non-retrying 2xx webhook response.
9. Ambiguous Particle dispatch remains rejected/unknown and is never retried automatically.

Do not infer physical water delivery from elapsed time. Timed completion is not measured flow.

Acceptance:

- Unit tests prove every legal/illegal transition and deduplication.
- Firmware host tests prove normal and interrupted terminal events.
- An injected completion moves one dashboard event to `completed` with `deliveredMl: null`.
- All web and firmware checks pass.

### Packet 5A — Add alert acknowledgement UI

Files:

- `app/components/SproutDashboard.tsx`
- Existing alert acknowledgement route
- UI/integration tests

Add an accessible per-alert acknowledgement button for live data. Disable it for demo data and while saving. Show success/error state and refresh data. Acknowledging an alert only changes dashboard acknowledgement; it must never clear a firmware lockout or imply a physical fault is gone.

Acceptance: one API request, button state is safe, demo is disabled, keyboard behavior works, and tests/build pass.

### Packet 5B — Use D1 as shared weather cache

Files:

- `lib/server/weather.ts`
- `lib/server/plant-repository.ts`
- `app/api/dashboard/route.ts`
- Weather tests

The schema already has `weather_snapshots`, and dashboard reads it. Store successful provider snapshots. Use a fresh stored snapshot before making another provider request; on timeout/provider error, use the latest stored snapshot; if none exists, keep labeled mock fallback.

Inject clock/fetch dependencies in tests. Never call the real weather network in automated tests. Weather remains display-only and cannot change pump state.

Acceptance: cache hit, cache miss, provider error, and no-config tests pass; D1 does not receive excessive writes.

### Packet 6 — Documentation and generated-state cleanup (completed)

Files:

- `README.md`
- `.gitignore`
- `package.json` only if adding a verified aggregate command

Actions:

- Replace starter README with Sprout Pilot goal, manual-only safety scope, architecture, quick start, directory map, firmware host/cloud commands, physical gate, known limitations, and links to existing docs.
- Add `/tsconfig.tsbuildinfo` to `.gitignore`.
- Ensure `npm ci` removes the extraneous `react-loading-skeleton` folder.
- Make all documented commands exactly match `package.json` and `firmware/Makefile`.
- Leave unused starter examples/assets alone unless the owner explicitly authorizes cleanup after `rg` proves they are unused.

Acceptance:

```sh
rg -n "vinext-starter|Your site is taking shape|react-loading-skeleton" README.md app package.json package-lock.json
npm ls --depth=0
npm test
npm run typecheck
npm run lint
make -C firmware test CXX=clang++
git diff --check
```

Expected: no stale starter text/dependency, no extraneous package, and all checks green.

### Packet 7 — Safe local D1/API smoke test

Human creates `.dev.vars` from `.dev.vars.example`, inserts a long random local `INGEST_TOKEN`, and keeps Particle credentials empty. The model must never print the secret.

Run:

```sh
npm run db:local
npm run dev
```

Prefer adding a safe local smoke script that generates current timestamps/UUIDs and refuses to run when Particle credentials or `ALLOW_REMOTE_WATERING=true` are present.

Exercise in order:

1. Dashboard shows labeled demo data before real telemetry.
2. Missing ingest token returns the documented error.
3. Fresh healthy telemetry returns created/accepted.
4. Repeated event ID deduplicates.
5. Monitor mode rejects water.
6. Policy changes to manual.
7. Fresh healthy telemetry plus a unique 30-second command is accepted only by mock dispatch; no external Particle request occurs.
8. Simulated terminal result updates history.
9. Stale telemetry, tank low, leak, pump busy, sensor fault, oversized dose, boot/minimum interval, and daily cap each reject.

Acceptance: statuses and response shapes match contracts; dashboard changes from demo to real data; no cloud request or physical actuation occurs.

### Packet 8 — Make firmware host verification repeatable

Files:

- `firmware/Makefile`
- `firmware/README.md`

Add a separate sanitizer target using Clang AddressSanitizer and UndefinedBehaviorSanitizer. Keep the normal strict `-Wall -Wextra -Werror -pedantic` target.

Acceptance:

```sh
make -C firmware clean
make -C firmware test CXX=clang++
make -C firmware test-sanitize CXX=clang++
```

Both pass with the expanded assertion count. Do not suppress sanitizer findings.

### Packet 9 — Human-only sensor disconnect proof

No remote watering yet. Pump branch remains disconnected.

Human tests connected, shorted, and unplugged `A0` for at least 30 seconds each. Record raw readings. Acceptance:

- Unplugged/shorted state consistently becomes `sensorStatus=fault` within the documented latency.
- Fault prevents a start and would stop an active run.

If unplugged `A0` floats within the plausible range, stop. Select and electrically verify an appropriate high-value input-bias network against the sensor output and Photon 2 ADC requirements. Then update `docs/WIRING.md`, `docs/PARTS.md`, firmware thresholds, and tests. Never invent a resistor value without verifying loaded sensor voltage and disconnect behavior.

### Packet 10 — Explicit Particle cloud-compile gate

Cloud compile uploads source to Particle. The model must ask the operator for explicit approval immediately before this action.

First require a host-compatible official CLI:

```sh
particle --version
```

It must print a valid version promptly. Current local binary may be x86_64 on an arm64 host; resolve that through the official installation path. Do not use an unknown binary or work around authentication/permission failures.

After explicit approval only:

```sh
particle compile photon2 firmware --target 6.4.1 --saveTo firmware/plant-waterer.bin
```

Acceptance:

- Compile succeeds for Photon 2 with no unsupported-API error.
- Host tests still pass.
- Binary path and checksum are recorded.
- Device is not flashed yet.

Stop on CLI hang, authentication failure, target uncertainty, warning requiring interpretation, or compile error.

### Packet 11 — Human-only unpowered wiring proof

Follow `docs/WIRING.md` and `docs/PARTS.md`. Keep pump power disconnected.

Required:

- Listed enclosed low-voltage supply; no mains in the enclosure.
- Fuse and flyback-protected MOSFET driver.
- `D2 → separate NC hardware float → MOSFET In`.
- Hardware pull-down from MOSFET input to ground.
- Second NC status float on `D3`.
- Leak input on `D4`.
- Soil sensor on `A0`, powered by 3.3 V, never above 3.3 V.
- Common/star ground and separated motor/sensor wiring.
- USB and externally powered VUSB never active together.

Human acceptance with a multimeter:

- MOSFET input remains LOW through boot/reset.
- Opening hardware float prevents a HIGH input independently of firmware.
- Status float and leak states read correctly.
- A0 never exceeds 3.3 V.

Stop immediately on unexpected voltage, heat, smell, or ambiguous pin state.

### Packet 12 — Human-authorized flash and dry electrical tests

The operator chooses and confirms the exact official flash command/device target. The model must not invent it.

Keep pump power disconnected. After flashing, verify:

- D2/MOSFET input LOW on boot, reset, Wi-Fi reconnect, and OTA.
- Tank open, leak active, sensor fault, and storage fault all keep output LOW.
- Boot hold prevents an immediate command after reset.
- Telemetry cadence does not flood during a persistent fault.

Any HIGH pulse is a hard stop. Disconnect power and investigate before continuing.

### Packet 13 — Human-only attended wet bench test

Pump outlet goes into a measuring cup, never a plant. Use a limited reservoir whose entire volume cannot cause unacceptable damage.

Test matrix:

1. Power-up/reset/OTA: no activation.
2. Smallest command: one bounded activation.
3. Open software status float during run: stop and lockout.
4. Open separate hardware float during run: immediate electrical stop.
5. Trigger leak during run: stop and lockout.
6. Unplug sensor during run: confirmed stop within documented latency.
7. Disconnect Wi-Fi during run: local runtime still stops pump.
8. Repeat UUID: no second dose.
9. Expired UUID: no activation.
10. Runtime and daily caps reject excessive requests.
11. Power loss mid-run: output remains off after reboot and boot hold applies.

Any unintended activation means disconnect pump power and stop work.

Calibration:

- Measure at least five 30-second runs at real tubing length/lift.
- Use median volume to calculate mL/min.
- Update firmware calibration only from those measurements.
- Require requested-dose error within ±15%.

### Packet 14 — Particle/dashboard integration

Only after Packets 0–13 pass. This remains attended cup testing.

Human configures server secrets and both telemetry/command-result webhooks. Keep `ALLOW_REMOTE_WATERING=false` initially.

Acceptance before commands:

- Real telemetry reaches D1.
- Dashboard online/stale/offline state is correct.
- Faults create alerts.
- Weather failure yields stored or labeled fallback.
- Result events update command history honestly.

Then the human may temporarily set `ALLOW_REMOTE_WATERING=true` for one 10–20 mL attended dose. Acceptance: one synchronous controller acceptance, one physical run, one terminal DB state, no duplicate run. Disable remote watering again afterward.

Do not expose this dashboard publicly without real user/site authorization, rate limiting, server secrets, and audit logging.

### Packet 15 — Seven-day plant trial

- Monitor only for seven days.
- Record dry and fully watered raw sensor values in the actual pot.
- Update endpoints only from measurements.
- Keep automatic mode disabled.
- Enable attended manual 20–50 mL doses only after trend review.
- Prove 24 hours offline remains safe.

Exit criteria:

- Zero unintended starts.
- Moisture trend follows real wet/dry cycles.
- Stale/fault states display correctly.
- Manual dose remains within ±15%.
- Leak and tank lockouts remain reliable.

## 7. Automatic and production work are not part of this handoff

Do not expose automatic mode merely because the dashboard has a policy option. Current firmware does not connect the automatic policy evaluator to `main.cpp`, calibration is not persisted end-to-end, and server policy is not synchronized to the device.

A later reviewed milestone needs all of:

- Persisted, pot-specific calibrated endpoints.
- Device-side policy synchronization and versioning.
- Several consecutive dry readings plus hysteresis.
- Locally persisted minimum interval and daily cap.
- Weather as a fresh-data veto only.
- Independent maximum-on timer/watchdog.
- Flow or actuator-current feedback.
- Offline, sensor-loss, stuck-output, power-cycle, and OTA tests.
- Thirty-day guarded pilot, then 3–5 units for 4–6 weeks.
- Authentication, per-site authorization, rate limiting, audit logs, alerting, remote secret management, and product compliance work.

Production hardware may use a P2 module only after field evidence and fleet economics justify Particle. High-volume cost may favor ESP32-S3, but that transfers secure provisioning, OTA, backend operations, and support to the product team.

## 8. Supervisor completion ledger

After each packet, append a row outside the source code or in an owner-approved tracking document:

| Packet | Commit/checkpoint | Commands passed | Human proof | Open risk | Approved next |
|---|---|---|---|---|---|
| 0 | — | — | backup made | — | no |

Never mark a human proof from a model statement. Record only what the human directly observed.
