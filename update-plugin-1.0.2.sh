#!/usr/bin/env bash
# Apply 1.0.2 poll fix and publish to GitHub + npm
# Run from INSIDE your homebridge-rainpoint-irrigation-control folder
#   chmod +x update-plugin-1.0.2.sh
#   ./update-plugin-1.0.2.sh
set -euo pipefail

echo "Working directory: $(pwd)"
if [[ ! -f package.json ]] || ! grep -q "homebridge-rainpoint-irrigation-control" package.json; then
  echo "ERROR: Run this script from inside the homebridge-rainpoint-irrigation-control folder."
  exit 1
fi

# --- Write fixed cloud.js getDeviceStatuses + platform refresh ---
python3 << 'PY'
from pathlib import Path

# Fix cloud.js
cloud = Path("dist/api/cloud.js")
c = cloud.read_text()
old = """    async getDeviceStatuses(deviceIds) {
        const result = new Map();
        if (deviceIds.length === 0)
            return result;
        // Ensure the device cache is populated (control + status resolution depend
        // on knowing each id's hub, addr, deviceName and productKey).
        if (this.deviceCache.size === 0) {
            await this.getDevices();
        }"""
new = """    async getDeviceStatuses(deviceIds) {
        const result = new Map();
        // Ensure the device cache is populated (control + status resolution depend
        // on knowing each id's hub, addr, deviceName and productKey).
        if (this.deviceCache.size === 0) {
            await this.getDevices();
        }
        // Platform may call with no args — poll every non-hub device in the cache.
        if (!deviceIds || !Array.isArray(deviceIds)) {
            deviceIds = [];
            for (const [id, dev] of this.deviceCache) {
                if (dev && dev.deviceType !== constants_1.KIND_HUB) {
                    deviceIds.push(id);
                }
            }
        }
        if (deviceIds.length === 0)
            return result;"""
if old in c:
    c = c.replace(old, new, 1)
    cloud.write_text(c)
    print("Patched dist/api/cloud.js")
elif "Platform may call with no args" in c:
    print("cloud.js already patched")
else:
    print("WARNING: expected block not found in cloud.js — file may already differ")

# Fix platform.js
plat = Path("dist/platform.js")
p = plat.read_text()
old_p = """  async refreshStatuses() {
    const map = await this.cloud.getDeviceStatuses();
    if (!map) return;"""
new_p = """  async refreshStatuses() {
    const ids = [...this.knownIds];
    let map;
    try {
      map = await this.cloud.getDeviceStatuses(ids.length ? ids : undefined);
    } catch (err) {
      this.log.warn("Status fetch failed: %s", err.message || err);
      return;
    }
    if (!map) return;"""
if old_p in p:
    plat.write_text(p.replace(old_p, new_p, 1))
    print("Patched dist/platform.js")
elif "Status fetch failed" in p:
    print("platform.js already patched")
else:
    print("WARNING: expected block not found in platform.js")

# Bump version
import json
pkg_path = Path("package.json")
pkg = json.loads(pkg_path.read_text())
pkg["version"] = "1.0.2"
pkg_path.write_text(json.dumps(pkg, indent=2) + "\n")
print("version -> 1.0.2")
PY

echo
echo "=== Git commit & push ==="
git add -A
git status
git commit -m "Fix status poll crash when deviceIds is omitted (v1.0.2)" || echo "(nothing new to commit)"
git tag -f v1.0.2
git push origin main
git push origin v1.0.2 --force

echo
echo "=== Publish to npm ==="
npm publish --access public

echo
echo "DONE. In Homebridge UI:"
echo "  Plugins → homebridge-rainpoint-irrigation-control → Update (1.0.2) → Restart"
echo
