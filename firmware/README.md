# Photon 2 plant-waterer firmware

One-zone prototype firmware. Sensor sampling and all control logic are non-blocking. Firmware boots in `monitor` mode: automatic policy never starts a pump. An explicit, unexpired `water` command can start one bounded manual dose.

## Wiring contract

Use only low-voltage DC near water. Keep the listed hardware cutoffs; firmware cannot make an unprotected MOSFET gate safe during boot, a crash, or damaged wiring.

- `A0` <- capacitive soil sensor analog output. Power sensor from Photon 2 `3V3`, not `5V`; share GND. A0 must never exceed 3.3 V.
- `D2` -> **separate normally-closed hardware tank float** -> MOSFET-driver input. Put a 100 kOhm resistor from the driver input to GND. `HIGH` commands pump ON. Float opening must remove the ON signal without firmware.
- `D3` <- second normally-closed tank-status float to GND, configured `INPUT_PULLUP`. `LOW` means water present; `HIGH` means low tank, broken wire, or unplugged float.
- `D4` <- leak module/open-collector output to GND, configured `INPUT_PULLUP`. `HIGH` means dry; `LOW` means leak.
- Pump uses its own fused 12 V rail and a MOSFET driver rated for motor current. Put a flyback diode across a brushed DC pump unless the selected driver already includes one. Photon and pump grounds join at one point.

Never drive a pump from a GPIO. Use a GFCI/RCD-protected outlet for the external certified power brick, drip loops, a covered reservoir, and a catch tray.

## Fixed prototype limits

- Default estimated soil calibration: dry `3000`, wet `1400`; automatic mode remains unavailable because this is not a pot calibration.
- Soil sample: every 5 seconds while pump is off; median-of-5 plus exponential smoothing.
- Pump calibration: `100 mL/min`. Measure your pump and edit `defaultControllerConfig()` before relying on dose volume.
- Manual dose: 5-100 mL.
- Max pump runtime: 180 seconds.
- Daily reserved volume: 250 mL, persisted before D2 can turn on.
- Cooldown: 60 seconds.
- Command TTL: at most 60 seconds.
- Low tank, leak, sensor loss during a run, or EEPROM verification failure forces pump OFF and latches lockout.

## Particle functions

`water` accepts exactly:

```text
<commandId>|<doseMl>|<expiresAtEpoch>
```

`commandId` is a canonical 36-character UUID-shaped ID, `doseMl` is an integer, and `expiresAtEpoch` is UTC epoch seconds. Entire argument must be 63 characters or fewer. Backend should create a unique ID, set expiry to current time + 30 seconds, and never retry a timed-out command automatically. Device requires valid Particle time, rejects already-expired commands, and rejects expiries over 60 seconds away.

Return codes:

- `1`: accepted
- `-1`: malformed argument
- `-2`: invalid command ID
- `-3`: dose outside 5-100 mL
- `-4`: device clock invalid
- `-5`: expired
- `-6`: expiry over 60 seconds away
- `-7`: pump busy
- `-8`: cooldown active
- `-9`: tank low/open status wire
- `-10`: leak detected
- `-11`: soil sensor fault
- `-12`: daily volume limit
- `-13`: duplicate command ID
- `-14`: other lockout
- `-15`: paused mode
- `-16`: requested runtime exceeds local cap or invalid pump calibration
- `-17`: EEPROM write verification failed; pump remains off (corrupt records also boot into storage lockout)

`clear_fault` accepts literal `reset`. It returns `1` only after tank, leak, and sensor inputs are healthy. Storage lockouts require reboot/inspection.

## Events

`plant.telemetry.v1` publishes every 5 minutes plus state/fault transitions. Normal cadence costs about 8,640 Data Operations/device/month. Payload matches dashboard `TelemetryEnvelopeV1`; temperature, humidity, and light are `null` in this cheap build.

```json
{"version":1,"eventId":"device-boot-epoch-sequence","deviceId":"...","sequence":1,"recordedAt":"2026-07-25T12:00:00Z","firmwareVersion":"0.1.0","moistureRaw":2200,"moisturePercent":50.0,"airTemperatureC":null,"relativeHumidityPercent":null,"lightLux":null,"tankLow":false,"leakDetected":false,"pumpActive":false,"sensorStatus":"ok","faultCode":null}
```

`plant.command-result.v1` publishes accepted/rejected status, reason, dose, and controller state. Particle function return code remains authoritative if result-event publish fails.

## Build and test

Host logic tests require only `clang++` and `make`:

```sh
cd firmware
make test
```

Cloud compile for Photon 2:

```sh
particle compile photon2 firmware --target 6.4.1 --saveTo firmware/plant-waterer.bin
```

Run that command from repository root. Flash only after wiring D2 gate pull-down and hardware float cutoff.
