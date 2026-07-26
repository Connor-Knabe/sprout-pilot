# ADR-001: Photon 2 prototype, P2 production candidate

- Status: accepted for prototype
- Review date: after 3–5 field units complete 4–6 weeks

## Context

The prototype needs Wi-Fi, remote telemetry, safe command delivery, OTA updates, and a path from development board to a product module. Lowest board price is not the only cost: provisioning, firmware rollout, fleet health, authentication, and backend operations become product work.

## Decision

Build V0 on Particle Photon 2. If the pilot succeeds and fleet economics remain acceptable, use the Particle P2 module on a custom production PCB.

## Why

- Photon 2 is approximately $17.95, close to Arduino Nano ESP32 pricing.
- Photon 2 and P2 share the Particle Device OS platform, reducing—but not eliminating—porting work.
- Particle provides managed device identity, cloud connection, OTA, and fleet tooling.
- A local safety state machine still works without Wi-Fi or cloud access.

## Consequences

- Dashboard, user authorization, historical data, weather caching, and customer onboarding remain our responsibility.
- Particle cloud cost and data-operation limits must be modeled using measured telemetry frequency.
- Browser code must never hold Particle product credentials.
- Photon 2 is a prototype board, not the final PCB.
- Production migration still requires separate product configuration, firmware builds, hardware validation, and end-product compliance testing.

## Rejected for V0

- **Arduino UNO R4 WiFi:** easy learning board, but larger 5 V architecture and weaker production-module path for this device.
- **Nano ESP32:** excellent low-lock-in option, but requires us to own more provisioning, OTA, and fleet infrastructure. Reconsider if scale makes Particle fees unattractive.
- **Cellular Particle module:** unnecessary cost until a real site proves Wi-Fi unreliable.
- **Direct custom PCB:** premature before sensor, pump, enclosure, and user behavior are validated.
