# One-zone prototype wiring

## Safety first

This design uses low-voltage DC only. Keep mains voltage outside the project enclosure by using a listed, enclosed wall adapter. Use GFCI/RCD protection near water.

Never connect the pump to a GPIO pin. Never omit the pump fuse, MOSFET flyback protection, common ground, normally-closed tank cutoffs, or 100 kΩ pump-input pull-down. Keep the first tests attended with the pump outlet over a measuring cup.

The Photon 2 VUSB pin can accept regulated 5 V only when the USB connector is not powered. Disconnect the 12 V supply before attaching a computer USB cable. Never power VUSB and USB at the same time.

## Pin map

| Photon 2 pin | Connection | Electrical behavior |
|---|---|---|
| `A0` | SEN0308 yellow signal | Analog input, 0–2.9 V expected; never exceed 3.3 V |
| `3V3` | SEN0308 red | Sensor power |
| `GND` | SEN0308 black | Sensor ground |
| `D2` | Hardware-cutoff NC float, then MOSFET driver `In` | `HIGH` runs pump only while the separate series float remains closed |
| `D3` | Status NC float, other lead to GND | `LOW` healthy; `HIGH` means tank low, broken wire, or unplugged switch |
| `D4` | Leak output/contact, other lead to GND | `HIGH` dry; leak device must pull low when wet |
| `VUSB` | Regulated 5 V buck output | Photon power input; USB must be disconnected |
| `D0` / `D1` | Reserved for SDA/SCL | Optional local temperature/humidity or light sensor later |

Photon 2 GPIO is not 5 V tolerant. Power the soil sensor from `3V3`, not 5 V. Any optional sensor output connected to GPIO must stay between GND and 3.3 V.

## Power and pump wiring

```text
listed 12 VDC adapter + ---- 1 A fuse ----+---- MOSFET driver V+
                                          |
                                          +---- 12 V -> 5 V buck IN+

listed 12 VDC adapter - ------------------+---- MOSFET driver GND
                                          +---- buck IN-
                                          +---- Photon GND

buck OUT+ (regulated 5 V) --------------------- Photon VUSB
buck OUT- ------------------------------------- Photon GND

Photon D2 ---- NC hardware float ---- MOSFET driver In
                                      |
                                      +---- 100 kΩ ---- GND

Photon D3 ---- NC status float ------ GND

pump red/positive ---------- MOSFET output terminal +
pump black/negative -------- MOSFET output terminal -
```

The first float is a low-current hardware enable in series with the MOSFET signal. Opening it prevents the driver input from going high even if firmware fails. The second float reports the same low-level condition to `D3`; using separate contacts avoids hiding tank status whenever `D2` is low. Mount both at the minimum safe water level and test each independently.

The specified MOSFET board connects its `+` terminal to `V+` and switches its `-` terminal to ground. Its built-in flyback diode protects the switching circuit. If a different driver is used, verify its pinout, 3.3 V trigger level, current rating, and flyback protection from that manufacturer's documentation.

Route pump current directly back to the supply/star ground. Do not pass pump current through the Photon breadboard ground rail. Keep motor wires away from the analog sensor cable.

## Water path

```text
covered reservoir -> inline filter -> pump -> check valve -> tube -> dripper
       |
       +-> NC float switch near minimum safe level

electronics enclosure sits above and away from reservoir
leak contact sits in tray below plumbing, not inside soil
```

Add an anti-siphon air gap when reservoir level can sit above the dripper. Secure the outlet so it cannot fall out of the pot. Never connect this prototype directly to potable water plumbing.

## First power-up sequence

1. Leave the pump's 12 V branch disconnected. Wire and flash the Photon over USB.
2. Verify `D2` measures low at boot, reset, Wi-Fi reconnect, and firmware update.
3. Confirm dashboard reports tank fault when the NC float circuit opens.
4. Confirm dashboard reports leak when `D4` is connected to ground.
5. Power the SEN0308 from 3.3 V and confirm `A0` remains below 3.3 V in air and soil.
6. Disconnect USB. Connect the regulated 5 V buck output to VUSB, then power the 12 V adapter.
7. Put the pump inlet in water and outlet in a measuring cup. Run the smallest manual dose while watching the system.
8. Open the float switch and trigger the leak input during separate active doses; each must stop the pump immediately.
9. Measure at least five 30-second pump runs and set the firmware flow calibration from the median delivered volume.
10. Perform dry- and wet-soil sensor calibration before enabling any moisture-based decision.

## Calibration notes

Calibrate in the same soil mix, pot density, insertion depth, and orientation used by the plant. Record a stable dry threshold and a stable value after fully watering and draining the pot. Do not use one internet calibration value for every soil type.

Sensor disconnect, out-of-range value, low tank, or leak must inhibit watering. Weather data is advisory only and must not bypass any local interlock.
