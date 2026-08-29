"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IrrigationPlatform = void 0;

const settings_1 = require("./settings");
const cloud_1 = require("./api/cloud");
const device_kinds_1 = require("./api/device-kinds");
const labels_1 = require("./labels");
const valve_handler_1 = require("./valve-handler");
const sensor_handler_1 = require("./sensor-handler");
const system_handler_1 = require("./system-handler");

class IrrigationPlatform {
  constructor(log, config, api) {
    this.log = log;
    this.config = config || {};
    this.api = api;
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    this.accessories = [];
    this.handlers = new Map();
    this.statusMap = new Map();
    this.knownIds = new Set();
    this.pollTimer = null;

    this.flatValves = !!this.config.flatValves;
    this.debug = !!this.config.debugmode;
    this.pollSeconds = Math.max(
      device_kinds_1.MIN_POLL_INTERVAL,
      Number(this.config.pollInterval) || device_kinds_1.DEFAULT_POLL_INTERVAL,
    );
    this.homeIndex = Number(this.config.homeIndex) || 0;

    const email = this.config.email || "";
    const password = this.config.password || "";
    if (!email || !password) {
      this.log.error("email and password are required");
    }

    this.cloud = new cloud_1.HomGarCloud(
      {
        email,
        password,
        region: this.config.regionHome || "US",
        homeIndex: this.homeIndex,
      },
      this.log,
    );

    api.on("didFinishLaunching", () => {
      this.bootstrap().catch((err) => {
        this.log.error("Startup failed: %s", err.message || err);
      });
    });
  }

  configureAccessory(accessory) {
    this.accessories.push(accessory);
  }

  statusFor(deviceId) {
    return this.statusMap.get(String(deviceId));
  }

  async bootstrap() {
    this.log.info("Rainpoint Irrigation Control starting (poll %ss)", this.pollSeconds);
    await this.cloud.login();
    const homes = await this.cloud.getHomes();
    if (!homes.length) {
      this.log.warn("No homes on this account");
      return;
    }
    const home = homes[Math.min(this.homeIndex, homes.length - 1)];
    this.cloud.setHome(home.id);
    this.log.info("Home: %s", home.name || home.id);

    const devices = await this.cloud.getDevices();
    this.log.info("Discovered %d controllable device(s)", devices.length);
    this.knownIds.clear();

    for (const device of devices) {
      this.adopt(device);
    }

    this.pruneStale();
    this.startPoll();
  }

  /**
   * Skip cloud junk rows that would crash HomeKit (empty displayName).
   */
  isGhost(device) {
    const name = String(device.name || "").trim();
    const model = String(device.model || "").trim();
    return !name && !model;
  }

  adopt(device) {
    if (this.isGhost(device)) {
      this.log.warn("Skipping ghost device id=%s", device.id);
      return;
    }
    if (!String(device.name || "").trim()) {
      device.name = String(device.model || `Device ${device.id}`).trim();
    }

    this.knownIds.add(String(device.id));
    this.log.debug(
      "Device %s (%s) type=%s ports=%s sub=%s",
      device.name,
      device.model,
      device.deviceType,
      device.portNumber,
      device.isSubDevice,
    );

    if (device.deviceType === device_kinds_1.KIND_HUB) {
      return;
    }
    if (device.deviceType === device_kinds_1.KIND_SENSOR || String(device.deviceType).startsWith("HCS")) {
      this.registerSensor(device);
      return;
    }
    if (this.flatValves) {
      this.registerFlat(device);
    } else {
      this.registerSystem(device);
    }
  }

  registerFlat(device) {
    const ports = Math.max(1, device.portNumber || 1);
    for (let port = 1; port <= ports; port++) {
      const name = labels_1.zoneLabel(device, port, true);
      this.registerValve(device, port, name);
    }
  }

  registerValve(device, port, name) {
    const key = `v_${device.id}_p${port}`;
    const uuid = this.api.hap.uuid.generate(key);
    let accessory = this.accessories.find((a) => a.UUID === uuid);
    const context = {
      deviceId: String(device.id),
      port,
      name,
      model: device.model,
      deviceType: device.deviceType,
    };
    if (accessory) {
      accessory.context = context;
      this.api.updatePlatformAccessories([accessory]);
    } else {
      accessory = new this.api.platformAccessory(name, uuid);
      accessory.context = context;
      this.api.registerPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [accessory]);
      this.accessories.push(accessory);
      this.log.info("Added valve: %s", name);
    }
    this.handlers.set(key, new valve_handler_1.ValveHandler(this, accessory, context));
  }

  registerSensor(device) {
    const key = `s_${device.id}`;
    const uuid = this.api.hap.uuid.generate(key);
    const name = device.name;
    let accessory = this.accessories.find((a) => a.UUID === uuid);
    const context = {
      deviceId: String(device.id),
      port: 0,
      name,
      model: device.model,
      deviceType: device.deviceType,
    };
    if (accessory) {
      accessory.context = context;
      this.api.updatePlatformAccessories([accessory]);
    } else {
      accessory = new this.api.platformAccessory(name, uuid);
      accessory.context = context;
      this.api.registerPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [accessory]);
      this.accessories.push(accessory);
      this.log.info("Added sensor: %s", name);
    }
    this.handlers.set(key, new sensor_handler_1.SensorHandler(this, accessory, context));
  }

  registerSystem(device) {
    const key = `sys_${device.id}`;
    const uuid = this.api.hap.uuid.generate(key);
    const name = device.name;
    let accessory = this.accessories.find((a) => a.UUID === uuid);
    const context = {
      deviceId: String(device.id),
      port: 0,
      name,
      model: device.model,
      deviceType: device.deviceType,
      zoneNames: device.portDescribe || [],
    };
    if (accessory) {
      accessory.context = context;
      this.api.updatePlatformAccessories([accessory]);
    } else {
      accessory = new this.api.platformAccessory(name, uuid);
      accessory.context = context;
      this.api.registerPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [accessory]);
      this.accessories.push(accessory);
      this.log.info("Added irrigation system: %s", name);
    }
    this.handlers.set(key, new system_handler_1.SystemHandler(this, accessory, context, device));
  }

  pruneStale() {
    const live = new Set();
    for (const key of this.handlers.keys()) {
      live.add(this.api.hap.uuid.generate(key));
    }
    const stale = this.accessories.filter((a) => !live.has(a.UUID));
    if (stale.length) {
      this.log.info("Removing %d stale accessory(ies)", stale.length);
      this.api.unregisterPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, stale);
      this.accessories = this.accessories.filter((a) => live.has(a.UUID));
    }
  }

  startPoll() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    const tick = async () => {
      try {
        await this.refreshStatuses();
      } catch (err) {
        this.log.warn("Poll error: %s", err.message || err);
      }
    };
    this.pollTimer = setInterval(tick, this.pollSeconds * 1000);
    tick();
  }

  async refreshStatuses() {
    const ids = [...this.knownIds];
    let map;
    try {
      map = await this.cloud.getDeviceStatuses(ids.length ? ids : undefined);
    } catch (err) {
      this.log.warn("Status fetch failed: %s", err.message || err);
      return;
    }
    if (!map) return;
    // cloud client returns Map or object depending on version — normalize
    if (map instanceof Map) {
      for (const [id, status] of map) {
        this.statusMap.set(String(id), status);
      }
    } else if (typeof map === "object") {
      for (const id of Object.keys(map)) {
        this.statusMap.set(String(id), map[id]);
      }
    }
    for (const handler of this.handlers.values()) {
      if (typeof handler.refresh === "function") handler.refresh();
    }
  }
}

exports.IrrigationPlatform = IrrigationPlatform;
