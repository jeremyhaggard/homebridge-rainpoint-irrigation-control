# Changelog

All notable changes to **homebridge-rainpoint-irrigation-control**.

## 1.1.0 — 2026-08-29

Stable release of the control path that is working in a live HomeKit install.

### Tested hardware (live)

| Device | Model | Result |
|---|---|---|
| Wi‑Fi gateway | **HWG023WBRF** (`mid` 360058) | Discovery + relay OK |
| 2-zone BLE hose timer (pool hose + zone 2) | **HTV210B** (`deviceId` 503026, addr 1) | ON/OFF both zones via `controlWorkModeDP` |
| 1-zone hose / mister timer | RF-style timer on same hub (addr 2) | ON/OFF via `controlWorkMode` |

Not validated in this release: second “Coop” gateway and any hose on that hub.

### Highlights

- Empty/ghost cloud devices are skipped (no Homebridge crash)
- Status polling no longer throws on a missing device list
- HTV210B uses the RainPoint Home BLE command format
- Older RF timers keep the original `controlWorkMode` path
- Control requests are logged (URL + body) so failures are diagnosable

---

## 1.0.5 — 2026-08-29

- HTV210B control body matches the official app: `param` (little-endian duration hex), `dpCode`
- `hid` sent as an HTTP header on `controlWorkModeDP` (not in JSON)
- Confirmed Pool hose + Zone 2 ON/OFF

## 1.0.4 — 2026-08-29

- Prefer `controlWorkModeDP` for HTV210B / multi-zone valves
- Log model, device id, hub id, address, and port on every command

## 1.0.3 — 2026-08-29

- Send `mid` and `hid` as strings
- Retry `controlWorkModeDP` after `controlWorkMode` code 3
- Always log control URL and request body

## 1.0.2 — 2026-08-29

- Fix poll crash: `Cannot read properties of undefined (reading 'length')`
- Skip empty cloud placeholder devices (example: mid 238899)

## 1.0.1 — 2026-08-29

- First successful npm publish (1.0.0 was already reserved)

## 1.0.0 — 2026-08-29

- Initial public plugin
- RainPoint Home login, discovery, irrigation valves
- Config UI for email, password, region, poll interval
- Unique platform id `RainpointIrrigationControl`
