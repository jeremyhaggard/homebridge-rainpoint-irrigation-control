"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HomGarCloud = void 0;
const https_1 = __importDefault(require("https"));
const crypto_1 = __importDefault(require("crypto"));
const constants_1 = require("./device-kinds");
const sensor_decode_1 = require("./sensor-decode");
// =============================================================================
// RainPoint Home (HomGar cloud API) constants — module-private, used only by
// this client. Mirrors how RainPointTyClient keeps its own protocol constants
// colocated and private rather than in the shared constants.ts.
// =============================================================================
const API_BASE_URL = 'https://region{areaCode}.homgarus.com:1443/';
const API_VERSION = '1.16.1065';
const APP_CODE = '2';
const SCENE_TYPE = '1';
const AREA_CODE_CN = '0';
const AREA_CODE_INTERNATIONAL = '3';
// controlWorkMode `mode` field values (verified against the battle-tested
// ha-rainpoint integration): 1 = open valve, 0 = close valve.
const CONTROL_MODE_CLOSE = 0;
const CONTROL_MODE_OPEN = 1;
function getBaseUrl(region) {
    const areaCode = region === 'CN' ? AREA_CODE_CN : AREA_CODE_INTERNATIONAL;
    return API_BASE_URL.replace('{areaCode}', areaCode);
}
function md5(input) {
    return crypto_1.default.createHash('md5').update(input, 'utf8').digest('hex');
}
class HomGarCloud {
    constructor(config, log) {
        this.config = config;
        this.log = log;
        this.token = '';
        this.refreshTokenValue = '';
        this.tokenExpired = 0;
        this.hid = '';
        /**
         * Cache of normalized devices from the last getDevices() call. Required so
         * control + status requests can resolve each accessory id to its hub mid,
         * the hub's deviceName/productKey (needed in every controlWorkMode +
         * multipleDeviceStatus request body), and the sub-device addr.
         */
        this.deviceCache = new Map();


        this.baseUrl = getBaseUrl(config.region || config.regionHome || 'US');
    }

    isEmptyPlaceholder(raw) {
        const n = String((raw && raw.name) || '').trim();
        const m = String((raw && (raw.model || raw.displayModel)) || '').trim();
        return !n && !m;
    }
    async login() {
        // areaCode is the phone dial code (e.g. "1" US, "86" CN), sourced from the
        // configured countryCode. Matches ha-rainpoint's country_codes mapping.
        const areaCode = this.config.countryCode || '1';
        const hashedPassword = md5(this.config.password);
        // Deterministic deviceId per (email, areaCode) — same as ha-rainpoint, so
        // re-logins don't rotate the server-side session identity.
        const deviceId = md5(`${this.config.email}${areaCode}`);
        const response = await this.request('POST', '/auth/basic/app/login', {
            areaCode,
            phoneOrEmail: this.config.email,
            password: hashedPassword,
            deviceId,
        }, false);
        this.token = response.data.token;
        this.refreshTokenValue = response.data.refreshToken;
        // tokenExpired is a relative duration in SECONDS; combine with the server
        // `ts` (ms) to get an absolute expiry. Comparing Date.now() against the
        // raw seconds value (the old behavior) always evaluates true and forced a
        // refresh before every request.
        this.tokenExpired = response.ts + response.data.tokenExpired * 1000;
        this.log.info('Logged in to RainPoint Home API as %s', this.config.email);
    }
    async ensureAuthenticated() {
        // Refresh 5 minutes before expiry (matches ha-rainpoint).
        if (Date.now() >= this.tokenExpired - 5 * 60 * 1000) {
            await this.refreshAccessToken();
        }
    }
    async refreshAccessToken() {
        try {
            const response = await this.request('POST', '/app/refreshToken', { refreshToken: this.refreshTokenValue }, false);
            this.token = response.data.token;
            this.refreshTokenValue = response.data.refreshToken;
            this.tokenExpired = response.ts + response.data.tokenExpired * 1000;
            this.log.debug('Refreshed RainPoint Home access token');
        }
        catch (error) {
            this.log.error('Failed to refresh token, re-authenticating...');
            await this.login();
        }
    }
    setHome(homeId) {
        this.hid = homeId;
    }
    async getHomes() {
        const response = await this.request('GET', '/app/member/appHome/list');
        return response.data.map(h => ({ id: h.hid, name: h.homeName }));
    }
    async getDevices() {
        const response = await this.request('GET', `/app/device/getDeviceByHid?hid=${encodeURIComponent(this.hid)}`);
        this.log.debug('[Cloud] API returned %d raw device(s) for home %s', response.data?.length ?? 0, this.hid);
        const devices = [];
        this.deviceCache.clear();
        for (const device of response.data) {
            if (this.isEmptyPlaceholder(device)) {
                this.log.warn('[Cloud] Ignoring empty cloud placeholder (mid=%s)', device.mid ?? device.sid ?? '?');
                continue;
            }

            const deviceType = (0, constants_1.classifyModel)(device.model);
            if (deviceType === constants_1.KIND_HUB) {
                this.log.debug('[Cloud] Gateway device: %s (model=%s, mid=%s) — caching for sub-device resolution', device.name, device.model, device.mid);
                // Cache the gateway so sub-device status/control can resolve the hub's
                // deviceName and productKey (fetchHubStatuses + resolveControlTarget both
                // look up the hub from deviceCache by its mid). Don't add the gateway
                // itself to the devices list — platform.ts has no accessory for it.
                // But DO process its subDevices: a HWG023 hub with HTV113 RF sub-devices
                // would otherwise yield 0 accessories (issue #1).
                const gatewayNorm = this.normalizeDevice(device, 0, device.name, false);
                this.deviceCache.set(gatewayNorm.id, gatewayNorm);
                if (device.subDevices) {
                    for (const sub of device.subDevices) {
                        const subZoneNames = this.parsePortDescribe(sub.portDescribe, sub.portNumber);
                        const subNorm = this.normalizeDevice(sub, sub.addr, sub.name || device.name, true, device.mid, subZoneNames);
                        devices.push(subNorm);
                        this.deviceCache.set(subNorm.id, subNorm);
                    }
                }
                continue;
            }
            const zoneNames = this.parsePortDescribe(device.portDescribe, device.portNumber);
            if (deviceType === constants_1.KIND_SENSOR) {
                const mainNorm = this.normalizeDevice(device, 0, device.name, false);
                devices.push(mainNorm);
                this.deviceCache.set(mainNorm.id, mainNorm);
                if (device.subDevices) {
                    for (const sub of device.subDevices) {
                        const subNorm = this.normalizeDevice(sub, sub.addr, sub.name || device.name, true, device.mid);
                        devices.push(subNorm);
                        this.deviceCache.set(subNorm.id, subNorm);
                    }
                }
                continue;
            }
            const mainNorm = this.normalizeDevice(device, 0, device.name, false, undefined, zoneNames);
            devices.push(mainNorm);
            this.deviceCache.set(mainNorm.id, mainNorm);
            if (device.subDevices) {
                for (const sub of device.subDevices) {
                    const subZoneNames = this.parsePortDescribe(sub.portDescribe, sub.portNumber);
                    const subNorm = this.normalizeDevice(sub, sub.addr, sub.name || device.name, true, device.mid, subZoneNames);
                    devices.push(subNorm);
                    this.deviceCache.set(subNorm.id, subNorm);
                }
            }
        }
        this.log.debug('[Cloud] Normalized %d device(s) after filtering gateways', devices.length);
        return devices;
    }
    async getDeviceStatuses(deviceIds) {
        const result = new Map();
        if (deviceIds.length === 0)
            return result;
        // Ensure the device cache is populated (control + status resolution depend
        // on knowing each id's hub, addr, deviceName and productKey).
        if (this.deviceCache.size === 0) {
            await this.getDevices();
        }
        // Resolve the unique set of hub mids to query. A sub-device's status is
        // delivered inside its hub's status response (keyed by addr), so we only
        // ever query hubs — never sub-device sids directly.
        const hubEntries = new Map();
        for (const id of deviceIds) {
            const dev = this.deviceCache.get(id);
            const hubId = dev?.parentId ?? id;
            if (hubEntries.has(hubId))
                continue;
            const hub = this.deviceCache.get(hubId);
            hubEntries.set(hubId, {
                mid: hubId,
                deviceName: hub?.deviceName ?? '',
                productKey: hub?.productId ?? '',
            });
        }
        const hubStatuses = await this.fetchHubStatuses([...hubEntries.values()]);
        for (const id of deviceIds) {
            const dev = this.deviceCache.get(id);
            if (!dev) {
                result.set(id, this.emptyStatus(id, false));
                continue;
            }
            const hubId = dev.parentId ?? id;
            const hs = hubStatuses.get(hubId);
            // Sub-devices read their payload from the hub's byAddr map (addr);
            // main devices read the hub's own `state` payload.
            const payload = dev.isSubDevice
                ? (hs?.byAddr.get(dev.addr) ?? null)
                : (hs?.state ?? null);
            const fallbackOnline = hs?.online ?? false;
            result.set(id, this.decodeDeviceStatus(id, dev, payload, fallbackOnline));
        }
        return result;
    }
    async turnZoneOn(deviceId, port, durationSeconds) {
        const { hubId, hub, addr } = this.resolveControlTarget(deviceId);
        await this.controlWorkMode({
            mid: hubId,
            addr,
            deviceName: hub.deviceName,
            productKey: hub.productId,
            port,
            mode: CONTROL_MODE_OPEN,
            duration: durationSeconds ?? 0,
            hid: this.hid,
        });
    }
    async turnZoneOff(deviceId, port) {
        const { hubId, hub, addr } = this.resolveControlTarget(deviceId);
        await this.controlWorkMode({
            mid: hubId,
            addr,
            deviceName: hub.deviceName,
            productKey: hub.productId,
            port,
            mode: CONTROL_MODE_CLOSE,
            duration: 0,
            hid: this.hid,
        });
    }
    /**
     * Resolve a device id (main or sub) to the controlWorkMode target triple:
     * the hub mid + hub record (for deviceName/productKey) + the addr to send.
     * Sub-devices address their own addr; main devices address addr 0.
     */
    resolveControlTarget(deviceId) {
        const dev = this.deviceCache.get(deviceId);
        if (!dev)
            throw new Error(`Device ${deviceId} not found`);
        const hubId = dev.parentId ?? deviceId;
        const hub = this.deviceCache.get(hubId);
        if (!hub)
            throw new Error(`Hub ${hubId} not found for device ${deviceId}`);
        const addr = dev.isSubDevice ? dev.addr : 0;
        return { hubId, hub, addr };
    }
    normalizeDevice(device, addr, name, isSubDevice, parentId, zoneNames) {
        const portNumber = device.portNumber || 1;
        return {
            id: String(isSubDevice ? device.sid : device.mid),
            name,
            model: device.model,
            productId: device.productKey ?? '',
            deviceName: device.deviceName ?? '',
            online: device.enabled !== 0,
            portNumber,
            portDescribe: zoneNames ?? this.parsePortDescribe(device.portDescribe, portNumber),
            deviceType: (0, constants_1.classifyModel)(device.model),
            isSubDevice,
            parentId: parentId != null ? String(parentId) : undefined,
            addr,
        };
    }
    parsePortDescribe(portDescribe, portNumber) {
        if (!portDescribe) {
            return Array.from({ length: portNumber }, (_, i) => `Zone ${i + 1}`);
        }
        const parts = portDescribe.split('|');
        return Array.from({ length: portNumber }, (_, i) => parts[i]?.trim() || `Zone ${i + 1}`);
    }
    emptyStatus(deviceId, online) {
        return {
            deviceId,
            online,
            zones: [],
            moisture: null,
            temperature: null,
            battery: null,
        };
    }
    /**
     * Decode a raw payload string into a NormalizedDeviceStatus, routing by
     * device type/model. Valve-class devices yield zones; sensor-class devices
     * yield moisture/temperature/battery.
     */
    decodeDeviceStatus(deviceId, dev, payload, fallbackOnline) {
        if (!payload) {
            return this.emptyStatus(deviceId, fallbackOnline);
        }
        const deviceType = dev.deviceType;
        if (deviceType === constants_1.KIND_VALVE
            || deviceType === constants_1.DEVICE_TYPE_CONTROLLER
            || deviceType === constants_1.DEVICE_TYPE_IRRIGATION
            || deviceType === constants_1.DEVICE_TYPE_HUB_DEVICE
            || deviceType === constants_1.DEVICE_TYPE_HUB_TIMER) {
            const decoded = (0, sensor_decode_1.decodeValve)(payload);
            const zones = [];
            for (let port = 1; port <= dev.portNumber; port++) {
                const z = decoded.zones.get(port);
                zones.push({
                    port,
                    name: dev.portDescribe[port - 1] ?? `Zone ${port}`,
                    isOn: z?.open ?? false,
                    remainingDuration: z?.durationSeconds ?? 0,
                });
            }
            return {
                deviceId,
                online: decoded.hubOnline ?? fallbackOnline,
                zones,
                moisture: null,
                temperature: null,
                battery: null,
            };
        }
        if (deviceType === constants_1.KIND_SENSOR || deviceType.startsWith('HWS')) {
            const decoded = (0, sensor_decode_1.parseSensorPayload)(payload, dev.model);
            return {
                deviceId,
                online: true,
                zones: [],
                moisture: decoded.moisture,
                temperature: decoded.temperature,
                battery: decoded.battery,
            };
        }
        return this.emptyStatus(deviceId, fallbackOnline);
    }
    /**
     * Fetch status for a set of hubs. Uses multipleDeviceStatus for >1 hub,
     * single getDeviceStatus for 1. The multipleDeviceStatus request body is
     * {"devices":[{"deviceName","mid","productKey"},...]} — NOT {"MIDS":[...]}.
     */
    async fetchHubStatuses(hubs) {
        const result = new Map();
        if (hubs.length === 0)
            return result;
        if (hubs.length === 1) {
            const data = await this.getDeviceStatus(hubs[0].mid);
            result.set(hubs[0].mid, this.extractSingleHubStatus(data));
            return result;
        }
        const response = await this.request('POST', '/app/device/multipleDeviceStatus', { devices: hubs });
        for (const multi of response.data) {
            const byAddr = new Map();
            let state = null;
            for (const param of multi.status) {
                const id = param.id;
                if (id === 'state' || id === 'State') {
                    state = param.value;
                    continue;
                }
                if (id.startsWith('D')) {
                    const addr = parseInt(id.substring(1), 10);
                    if (!Number.isNaN(addr) && param.value) {
                        byAddr.set(addr, param.value);
                    }
                }
            }
            result.set(multi.mid, {
                online: byAddr.size > 0 || state !== null,
                byAddr,
                state,
            });
        }
        return result;
    }
    extractSingleHubStatus(data) {
        const byAddr = new Map();
        const state = data.state || null;
        // The API returns sub-device payloads in a `subDeviceStatus` array:
        //   [{"id":"D01","time":...,"value":"10#..."}, ...]
        // Each entry's `id` is a D-prefixed addr (D01, D21, etc.) with a
        // `value` containing the raw payload for that sub-device.
        const statusArray = data.subDeviceStatus ?? [];
        for (const param of statusArray) {
            const id = param.id;
            if (id === 'state' || id === 'State') {
                continue;
            }
            if (id.startsWith('D')) {
                const addr = parseInt(id.substring(1), 10);
                if (!Number.isNaN(addr) && param.value) {
                    byAddr.set(addr, param.value);
                }
            }
        }
        const connected = data.connected;
        const online = (typeof connected === 'string' ? connected !== '0' : true) || byAddr.size > 0;
        return { online, byAddr, state };
    }
    async getDeviceStatus(mid) {
        const response = await this.request('GET', `/app/device/getDeviceStatus?mid=${encodeURIComponent(mid)}`);
        return response.data;
    }
    async controlWorkMode(params) {
        try {
            await this.request('POST', '/app/device/controlWorkMode', params);
        }
        catch (error) {
            // Code 4 = device already in the requested state (idempotent). The
            // battle-tested integration treats this as success, not an error.
            const code = error.code;
            if (code === 4) {
                this.log.debug('controlWorkMode: device already in requested state (code 4)');
                return;
            }
            throw error;
        }
    }
    async request(method, path, body, requireAuth = true, retried = false) {
        if (requireAuth) {
            await this.ensureAuthenticated();
        }
        // Auth headers match ha-rainpoint: auth, lang, appCode, version, sceneType.
        const headers = {
            'Content-Type': 'application/json',
            'lang': 'en',
            'version': API_VERSION,
            'appCode': APP_CODE,
            'sceneType': SCENE_TYPE,
        };
        if (requireAuth && this.token) {
            headers['auth'] = this.token;
        }
        const url = new URL(path, this.baseUrl);
        const urlStr = url.toString();
        const requestBody = body ? JSON.stringify(body) : undefined;
        this.log.debug('%s %s', method, urlStr);
        if (requestBody) {
            this.log.debug('Request body: %s', requestBody);
        }
        // API error codes that indicate the token was rejected (expired/invalid).
        // On these codes we force a fresh login and retry the request once.
        const REAUTH_CODES = new Set([1001, 1004]);
        return new Promise((resolve, reject) => {
            const urlObj = new URL(urlStr);
            const options = {
                hostname: urlObj.hostname,
                port: urlObj.port || 443,
                path: urlObj.pathname + urlObj.search,
                method,
                headers,
                rejectUnauthorized: false,
            };
            const req = https_1.default.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.code !== 0) {
                            // On token-rejection codes, force re-auth and retry once.
                            if (REAUTH_CODES.has(parsed.code) && requireAuth && !retried) {
                                this.log.warn('API returned code %d (%s) — re-authenticating...', parsed.code, parsed.msg);
                                this.token = '';
                                this.tokenExpired = 0;
                                this.login().then(() => {
                                    resolve(this.request(method, path, body, requireAuth, true));
                                }).catch(reject);
                                return;
                            }
                            const error = new Error(`API error ${parsed.code}: ${parsed.msg}`);
                            error.code = parsed.code;
                            reject(error);
                            return;
                        }
                        this.log.debug('Response: %s', data.substring(0, 500));
                        resolve(parsed);
                    }
                    catch (e) {
                        reject(new Error(`Failed to parse API response: ${e}`));
                    }
                });
            });
            req.on('error', (e) => {
                reject(new Error(`HTTP request failed: ${e.message}`));
            });
            req.setTimeout(20000, () => {
                req.destroy(new Error('Request timed out'));
            });
            if (requestBody) {
                req.write(requestBody);
            }
            req.end();
        });
    }
}
exports.HomGarCloud = HomGarCloud;
//# sourceMappingURL=HomGarCloud.js.map