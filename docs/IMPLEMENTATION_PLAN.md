# Sprout Pilot implementation plan

## Goal

Build one low-cost, Wi-Fi watering zone that measures soil moisture, shows status/history in a web dashboard, and can deliver a bounded dose of water. The device must stay safe when Wi-Fi, cloud services, a sensor, or the application fails.

## Platform decision

Use a **Particle Photon 2** for the prototype and move to the **Particle P2 module on a custom PCB** only after field trials. Photon 2 costs about the same as an Arduino Nano ESP32, but keeps the firmware, provisioning, OTA, and fleet path close to the production target.

“Arduino” is both an ecosystem and a family of boards; it is not the direct opposite of Particle. A Nano ESP32 plus Arduino framework is the lower-lock-in path. Revisit that option before a production PCB if expected fleet size makes Particle's recurring cloud cost larger than the engineering savings.

Decision checkpoint after a 3–5 device, 4–6 week pilot:

- Keep Particle/P2 when managed OTA, provisioning, and fleet diagnostics matter more than cloud cost.
- Move to ESP32-S3 when unit volume is high enough to fund secure provisioning, OTA, backend operations, and support internally.
- Move to Particle cellular hardware when deployment Wi-Fi is not dependable.

## V0 scope

Included:

- One soil moisture probe and one peristaltic pump.
- Normally-closed reservoir float and leak input.
- Local pump cutoff, dose cap, daily cap, minimum interval, sensor plausibility checks, and fault lockout.
- Particle telemetry and a bounded remote `water` function.
- Web dashboard with current state, moisture history, weather context, policy settings, and manual watering.
- Local/mock data mode so the dashboard works before hardware or cloud credentials exist.

Deferred:

- Fully automatic watering. V0 starts in monitor mode; manual doses are enabled only after calibration and safety tests.
- Multi-zone valves, customer accounts, mobile onboarding, notifications, flow meter, and production weather provider agreement.
- Mains wiring inside the enclosure.

## Delivery phases

### Phase 0 — bench proof

1. Assemble Photon 2, sensor, MOSFET driver, pump, float, leak input, and low-voltage supplies.
2. Keep pump outlet in a measuring cup, not a plant.
3. Flash firmware and verify every boot/reset/OTA path leaves pump off.
4. Record pump flow in mL/s at the real tubing length and lift height.
5. Record sensor raw values in representative dry and fully watered soil.

Exit criteria:

- Pump never turns on during power-up or reset.
- Float-open and leak-active each stop an active dose immediately.
- One commanded dose is within ±15% of measured target volume.
- Invalid or disconnected moisture sensor cannot trigger watering.

### Phase 1 — one indoor plant

1. Run monitor-only for seven days and compare readings with manual soil checks.
2. Enable manual doses with a conservative 20–50 mL limit.
3. Keep automatic mode disabled; review moisture response after every dose.
4. Validate dashboard history, stale-device state, alerts, and offline recovery.

Exit criteria:

- No unexpected pump starts.
- Sensor readings are useful despite normal watering and temperature changes.
- Leak/empty-tank simulations create a latched lockout and visible alert.
- Device remains safe through 24 hours without Wi-Fi.

### Phase 2 — guarded automatic pilot

1. Enable automatic mode for one plant only.
2. Require completed calibration, healthy float/leak inputs, fresh sensor data, minimum interval, and daily cap.
3. Use forecast rain only to delay watering; forecast data must never cause watering.
4. Observe for 30 days before adding zones or unattended outdoor use.

Exit criteria:

- No limit/interlock bypass in fault-injection tests.
- Moisture reaches the target band without runoff or persistent saturation.
- Cloud or weather outages do not change local safety behavior.

### Phase 3 — production decision

1. Pilot 3–5 units at real sites for 4–6 weeks.
2. Measure Wi-Fi onboarding success, disconnect time, telemetry volume, sensor drift, pump wear, current, and enclosure condensation.
3. Freeze P2 versus ESP32-S3 and Wi-Fi versus cellular using real fleet and support costs.
4. Design custom PCB with protected inputs, actuator current/flow sensing, watchdog, fused outputs, manufacturing test points, and certified radio module.
5. Complete product EMC, radio integration, electrical safety, ingress, and environmental validation.

## System boundaries

```text
soil / tank / leak
        |
        v
Photon 2 local safety state machine ----> MOSFET driver ----> pump
        |
        | bundled telemetry / bounded command
        v
Particle Cloud <---- server-only token ---- dashboard API + D1
                                           |
                                           +---- cached weather context
                                           |
                                           +---- browser dashboard
```

Device owns physical safety. Backend owns history, dashboard access, weather caching, and command authorization. Browser never receives a Particle access token. Weather may suppress or delay a future automatic dose, but cannot energize the pump.

## Data and command contracts

- Telemetry schema: `lib/contracts.ts`, versioned as `1`.
- Manual command: dashboard sends `{ commandId, zoneId, doseMl, expiresAt }` to `POST /api/water`; IDs make retries recognizable and commands expire after 60 seconds.
- Backend invokes Particle function `water` with `<commandId>|<doseMl>|<expiresAtEpoch>`.
- Firmware accepts only a valid integer dose within its local cap and returns a positive code on acceptance or a documented negative rejection code.
- Policy changes go to `PATCH /api/policy`; local firmware limits still win if cloud policy is unsafe.

## Prototype success metrics

- Safety: zero unintended activations; 100% stop response for tank/leak tests.
- Delivery: dose error within ±15% before adding a flow meter.
- Sensing: calibrated moisture trend follows wet/dry cycles; stale or implausible values are flagged.
- Connectivity: safe for at least 24 hours offline; reconnect without duplicate watering.
- Cost: core controller/sensor/pump electronics near $75; complete recommended bench unit about $110–170 before shipping, depending on enclosure and plumbing already owned.
