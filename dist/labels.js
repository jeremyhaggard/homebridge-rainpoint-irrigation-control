"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.zoneLabel = zoneLabel;

/**
 * Build a stable, non-empty HomeKit display name for a zone.
 */
function zoneLabel(device, port, flat) {
  const zones = Array.isArray(device.portDescribe) ? device.portDescribe : [];
  const zonePart = (zones[port - 1] || "").trim() || `Zone ${port}`;
  const parent = (device.name || "").trim() || device.model || "Valve";
  if (flat) {
    return device.portNumber > 1 ? `${parent}: ${zonePart}` : parent;
  }
  return zonePart;
}
