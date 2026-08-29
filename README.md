# Rainpoint Irrigation Control

Homebridge platform plugin for **RainPoint / HomGar** irrigation hubs, hose timers, and soil sensors.

## Highlights

- Built for the RainPoint **Home** cloud (`region*.homgarus.com`)
- **Ignores empty/ghost cloud devices** that break other plugins (`displayName` assertion)
- Lean platform: one poll loop, minimal accessory churn
- Optional flat Valve layout or grouped IrrigationSystem
- Unique platform id — can run beside other RainPoint plugins without renaming them

## Install

```bash
cd /var/lib/homebridge
# unzip this package here so the folder is:
# /var/lib/homebridge/homebridge-rainpoint-irrigation-control/
npm install ./homebridge-rainpoint-irrigation-control
```

Restart Homebridge after install.

## Config

Platform name must be **`RainpointIrrigationControl`**:

```json
{
  "platform": "RainpointIrrigationControl",
  "name": "Rainpoint Irrigation",
  "email": "your-email@example.com",
  "password": "your-password",
  "regionHome": "US",
  "pollInterval": 30,
  "flatValves": false,
  "debugmode": true
}
```

| Option | Default | Notes |
|--------|---------|--------|
| email / password | — | RainPoint Home account |
| regionHome | US | `US` or `CN` |
| homeIndex | 0 | First home if you have several |
| pollInterval | 30 | Seconds (minimum 10) |
| flatValves | false | Standalone valves vs IrrigationSystem |
| debugmode | false | Verbose logs |

## Tested devices

Live HomeKit testing (2026-08-29):

| Model | Role | Control |
|---|---|---|
| HWG023WBRF | Wi‑Fi gateway | Discovery / relay |
| HTV210B | 2-zone BLE hose timer | Both zones ON/OFF |
| 1-zone RF timer (misters) | Same hub | ON/OFF |

See [CHANGELOG.md](CHANGELOG.md) for version history.

## Tips

- Prefer a **child bridge** for isolation.
- If control returns API `4004`, confirm the zone works in the RainPoint Home app and that the same account is not actively logged in on the phone (or use a household member account for Homebridge).
- Official package updates will not overwrite this local install.

## License

Apache-2.0. Cloud protocol behavior aligns with public HomGar / RainPoint Home API usage.
