"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValveHandler = void 0;

const DEFAULT_DURATION_SEC = 300;

class ValveHandler {
  constructor(platform, accessory, meta) {
    this.platform = platform;
    this.accessory = accessory;
    this.meta = meta;
    this.log = platform.log;

    const { Service, Characteristic } = platform;
    const info = accessory.getService(Service.AccessoryInformation)
      || accessory.addService(Service.AccessoryInformation);
    info
      .setCharacteristic(Characteristic.Manufacturer, "RainPoint")
      .setCharacteristic(Characteristic.Model, meta.model || "Valve")
      .setCharacteristic(Characteristic.SerialNumber, `${meta.deviceId}-p${meta.port}`);

    this.service = accessory.getService(Service.Valve)
      || accessory.addService(Service.Valve, meta.name);
    this.service.setCharacteristic(Characteristic.Name, meta.name);
    this.service.setCharacteristic(Characteristic.ValveType, Characteristic.ValveType.IRRIGATION);

    this.service.getCharacteristic(Characteristic.Active)
      .onGet(() => this.currentActive())
      .onSet(async (value) => {
        const on = value === Characteristic.Active.ACTIVE;
        const duration = this.service.getCharacteristic(Characteristic.SetDuration).value || DEFAULT_DURATION_SEC;
        await this.apply(on, Number(duration) || DEFAULT_DURATION_SEC);
      });

    this.service.getCharacteristic(Characteristic.InUse)
      .onGet(() => this.currentActive());

    if (!this.service.testCharacteristic(Characteristic.SetDuration)) {
      this.service.addCharacteristic(Characteristic.SetDuration);
    }
    this.service.getCharacteristic(Characteristic.SetDuration)
      .setProps({ minValue: 60, maxValue: 3600, minStep: 60 })
      .onGet(() => this.service.getCharacteristic(Characteristic.SetDuration).value || DEFAULT_DURATION_SEC);

    if (!this.service.testCharacteristic(Characteristic.RemainingDuration)) {
      this.service.addCharacteristic(Characteristic.RemainingDuration);
    }
    this.service.getCharacteristic(Characteristic.RemainingDuration)
      .onGet(() => this.remaining());
  }

  zoneStatus() {
    const st = this.platform.statusFor(this.meta.deviceId);
    if (!st || !st.zones) return null;
    return st.zones.find((z) => z.port === this.meta.port) || null;
  }

  currentActive() {
    const z = this.zoneStatus();
    return z && z.isOn
      ? this.platform.Characteristic.Active.ACTIVE
      : this.platform.Characteristic.Active.INACTIVE;
  }

  remaining() {
    const z = this.zoneStatus();
    return z && z.remainingDuration > 0 ? Math.floor(z.remainingDuration) : 0;
  }

  async apply(on, durationSec) {
    this.log.info("[%s] %s (port %s, %ss)", this.meta.name, on ? "ON" : "OFF", this.meta.port, durationSec);
    try {
      if (on) {
        await this.platform.cloud.turnZoneOn(this.meta.deviceId, this.meta.port, durationSec);
      } else {
        await this.platform.cloud.turnZoneOff(this.meta.deviceId, this.meta.port);
      }
      this.service.updateCharacteristic(
        this.platform.Characteristic.Active,
        on ? this.platform.Characteristic.Active.ACTIVE : this.platform.Characteristic.Active.INACTIVE,
      );
      this.service.updateCharacteristic(
        this.platform.Characteristic.InUse,
        on ? this.platform.Characteristic.InUse.IN_USE : this.platform.Characteristic.InUse.NOT_IN_USE,
      );
      this.service.updateCharacteristic(
        this.platform.Characteristic.RemainingDuration,
        on ? durationSec : 0,
      );
    } catch (err) {
      this.log.error("[%s] Control failed: %s", this.meta.name, err.message || err);
    }
  }

  refresh() {
    const active = this.currentActive();
    this.service.updateCharacteristic(this.platform.Characteristic.Active, active);
    this.service.updateCharacteristic(
      this.platform.Characteristic.InUse,
      active === this.platform.Characteristic.Active.ACTIVE
        ? this.platform.Characteristic.InUse.IN_USE
        : this.platform.Characteristic.InUse.NOT_IN_USE,
    );
    this.service.updateCharacteristic(this.platform.Characteristic.RemainingDuration, this.remaining());
  }
}

exports.ValveHandler = ValveHandler;
