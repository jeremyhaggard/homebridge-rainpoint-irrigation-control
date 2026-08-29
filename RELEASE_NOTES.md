# GitHub Release — v1.1.0

Copy everything below the line into the GitHub Release description.

---

## Rainpoint Irrigation Control 1.1.0

Working HomeKit control for RainPoint Home hubs and hose timers.

### Tested with

- **HWG023WBRF** Wi‑Fi gateway
- **HTV210B** 2-zone BLE hose timer (both zones ON/OFF)
- 1-zone RF mister / hose timer on the same gateway (ON/OFF)

### What’s in this release

- Skip empty/ghost cloud devices that crashed other plugins
- Stable status polling
- HTV210B uses `controlWorkModeDP` with app-correct `param` + `hid` header
- Older timers still use `controlWorkMode`
- Control commands logged for troubleshooting

### Install

In Homebridge UI search **homebridge-rainpoint-irrigation-control** and install **1.1.0**, or:

`npm install -g homebridge-rainpoint-irrigation-control@1.1.0`

Platform name: `RainpointIrrigationControl`

### Notes

- RainPoint Home account email/password are entered in plugin settings only (not stored in the repo)
- A second gateway on the same account is discovered but was not control-tested in this release
- If the phone app and Homebridge share one login, force-close the app if commands start failing
