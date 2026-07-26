# Prototype parts

Prices are approximate single-unit US prices checked in July 2026. Shipping, tax, reservoir, and tools are excluded.

## Recommended cheap-but-reusable build

| Qty | Part | Purpose | Approx. price |
|---:|---|---|---:|
| 1 | [Particle Photon 2](https://store.particle.io/products/photon-2) | Wi-Fi controller, OTA, Particle Cloud | $17.95 |
| 1 | [DFRobot SEN0308 IP65 capacitive soil sensor](https://www.dfrobot.com/product-2054.html/) | 0–2.9 V analog moisture signal | $14.90 |
| 1 | [Adafruit 12 V peristaltic pump](https://www.adafruit.com/product/1150) | Isolated, predictable small water doses | $24.95 |
| 1 | [Adafruit MOSFET driver 5648](https://www.adafruit.com/product/5648) | Safe 3.3 V control of pump current; flyback diode included | $3.95 |
| 1 | [Pololu D24V10F5 5 V buck](https://www.pololu.com/product/2831) | Converts 12 V supply to Photon power | $12.95 |
| 1 | UL/ETL-listed 12 VDC, at least 1 A Class 2 adapter | Low-voltage power source | $10–15 |
| 2 | Normally-closed vertical float switches | One hardware pump-enable cutoff plus one status input | $6–16 |
| 1 | 3.3 V/open-collector leak board or tray contact | Leak lockout | $4–10 |
| 1 | 100 kΩ resistor | Keeps MOSFET input off during boot | <$1 |
| 1 | Inline fuse holder + 1 A slow-blow fuse | Pump branch protection | $3–6 |
| — | Food-safe tubing, check valve, inline filter, dripper, wire, terminals | Water path and wiring | $12–25 |
| 1 | Covered reservoir and splash-resistant vented enclosure | Water and electronics separation | $10–25 |

Expected total: **about $110–170**, depending on enclosure and plumbing already on hand. Core electronics, pump, and sensor total about **$75**.

## Absolute cheapest bench substitution

A generic capacitive probe, 5 V peristaltic pump, MOSFET module with flyback protection, and 5 V/2 A listed adapter can reduce the build to roughly $50–75. This is useful for a cup-on-bench proof, but generic probes and pumps vary widely. Keep the same float, leak input, fuse, check valve, and hardware pull-down. Replace questionable wet-side parts before unattended use.

Do not replace the MOSFET driver with a relay board unless its input is explicitly compatible with 3.3 V logic and its boot state is verified off. A pump must never connect directly to a Photon GPIO.

## Optional additions after V0 works

- [DFRobot weatherproof SHT31 probe](https://www.dfrobot.com/product-2160.html): local air temperature/humidity; about $19.90.
- VEML7700 breakout: light trend; about $5. Lux is not plant PAR/PPFD.
- Small pulse flow sensor: verifies real delivery and detects dry/clogged tubing.
- Physical emergency-stop switch wired in series with pump power.
- ADS1115 ADC: helpful for multiple analog probes or long, noisy sensor wiring; not required for one short SEN0308 lead.

## Tools

- Multimeter.
- Wire stripper, small screwdriver, heat-shrink, and crimper or soldering iron.
- Measuring cup or gram scale for pump calibration; 1 gram water is approximately 1 mL near room temperature.
- Laptop, data-capable micro-USB cable, and Particle account/CLI.

## Production replacements

Do not ship the breadboard build. A production pilot should use a custom PCB with a Particle P2 module, hardware-protected actuator output, fused connector, current or flow feedback, protected sensor inputs, watchdog, secure manufacturing test flow, and an IP-rated enclosure. Final product still needs system-level compliance testing even when the radio module is certified.
