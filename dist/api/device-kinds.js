"use strict";
// =============================================================================
// Shared constants — used by both the RainPoint Home (HomGar cloud) and
// RainPoint TY (Tuya) clients. Provider-agnostic only.
// =============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEVICE_TYPE_HUB_TIMER = exports.DEVICE_TYPE_HUB_DEVICE = exports.DEVICE_TYPE_IRRIGATION = exports.DEVICE_TYPE_WATER_STATION = exports.KIND_HUB = exports.KIND_VALVE = exports.KIND_SENSOR = exports.DEVICE_TYPE_CONTROLLER = exports.MIN_POLL_INTERVAL = exports.DEFAULT_POLL_INTERVAL = void 0;
exports.classifyModel = classifyModel;
// Polling thresholds (platform-level; apply regardless of provider).
exports.DEFAULT_POLL_INTERVAL = 30;
exports.MIN_POLL_INTERVAL = 10;
// Device-type detection (model prefix -> device class). Both clients use this.
exports.DEVICE_TYPE_CONTROLLER = 'HCC';
exports.KIND_SENSOR = 'HCS';
exports.KIND_VALVE = 'HTV';
exports.KIND_HUB = 'HWG';
exports.DEVICE_TYPE_WATER_STATION = 'HWS';
exports.DEVICE_TYPE_IRRIGATION = 'HIS';
// WiFi hub-as-device controllers (no subDevices; the hub itself is the valve).
// e.g. HIC801W, HIC819W, HTP159W — controllable via controlWorkMode/controlWorkModeDP.
exports.DEVICE_TYPE_HUB_DEVICE = 'HIC';
exports.DEVICE_TYPE_HUB_TIMER = 'HTP';
function classifyModel(model) {
    const prefix = model.replace(/[\d_]+.*/, '').toUpperCase();
    if (prefix.startsWith('HCC'))
        return exports.DEVICE_TYPE_CONTROLLER;
    if (prefix.startsWith('HCS'))
        return exports.KIND_SENSOR;
    if (prefix.startsWith('HTV'))
        return exports.KIND_VALVE;
    if (prefix.startsWith('HTP'))
        return exports.DEVICE_TYPE_HUB_TIMER;
    if (prefix.startsWith('HWG'))
        return exports.KIND_HUB;
    if (prefix.startsWith('HWS'))
        return exports.DEVICE_TYPE_WATER_STATION;
    if (prefix.startsWith('HIS'))
        return exports.DEVICE_TYPE_IRRIGATION;
    if (prefix.startsWith('HIC'))
        return exports.DEVICE_TYPE_HUB_DEVICE;
    return prefix;
}
//# sourceMappingURL=constants.js.map