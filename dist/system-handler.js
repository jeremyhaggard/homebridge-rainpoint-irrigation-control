"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SystemHandler = void 0;

const DEFAULT_DURATION_SEC = 300;

class SystemHandler {
  constructor(platform, accessory, meta, device) {
    this.platform = platform;
    this.accessory = accessory;
    this.meta = meta;
    this.device = device;
    this.zoneServices = new Map();
    this.log = platform.log;

    const { Service, Characteristic } = platform;
    const info = accessory.getService(Service.AccessoryInformation)
      || accessory.addService(Service.AccessoryInformation);
    info
      .setCharacteristic(Characteristic.Manufacturer, "RainPoint")
      .setCharacteristic(Characteristic.Model, meta.model || "Irrigation")
      .setCharacteristic(Characteristic.SerialNumber, String(meta.deviceId));

    this.primary = accessory.getService(Service.IrrigationSystem)
      || accessory.addService(Service.IrrigationSystem, meta.name);
    this.primary.setCharacteristic(Characteristic.Name, meta.name);
    this.primary.setCharacteristic(
      Characteristic.Active,
      Characteristic.Active.ACTIVE,
    );
    this.primary.setCharacteristic(
      Characteristic.ProgramMode,
      Characteristic.ProgramMode.NO_PROGRAM_SCHEDULED,
    );
    this.primary.setCharacteristic(
      Characteristic.InUse,
      Characteristic.InUse.NOT_IN_USE,
    );

    const ports = Math.max(1, device.portNumber || 1);
    for (let port = 1; port <= ports; port++) {
      this.ensureZone(port);
    }
  }

  zoneName(port) {
    const names = this.meta.zoneNames || [];
    const z = (names[port - 1] || "").trim();
    return z || `Zone ${port}`;
  }

  ensureZone(port) {
    const { Service, Characteristic } = this.platform;
    const label = this.zoneName(port);
    const existing = this.accessory.services.find(
      (s) => s.UUID === Service.Valve.UUID && s.subtype === `zone${port}`,
    );
    const svc = existing || this.accessory.addService(Service.Valve, label, `zone${port}`);
    svc.setCharacteristic(Characteristic.Name, label);
    svc.setCharacteristic(Characteristic.ValveType, Characteristic.ValveType.IRRIGATION);
    svc.setCharacteristic(Characteristic.ServiceLabelIndex, port);

    svc.getCharacteristic(Characteristic.Active)
      .onGet(() => this.zoneActive(port))
      .onSet(async (value) => {
        const on = value === Characteristic.Active.ACTIVE;
        const duration = svc.getCharacteristic(Characteristic.SetDuration).value || DEFAULT_DURATION_SEC;
        await this.command(port, on, Number(duration) || DEFAULT_DURATION_SEC);
      });

    svc.getCharacteristic(Characteristic.InUse).onGet(() => this.zoneActive(port));

    if (!svc.testCharacteristic(Characteristic.SetDuration)) {
      svc.addCharacteristic(Characteristic.SetDuration);
    }
    svc.getCharacteristic(Characteristic.SetDuration)
      .setProps({ minValue: 60, maxValue: 3600, minStep: 60 });

    if (!svc.testCharacteristic(Characteristic.RemainingDuration)) {
      svc.addCharacteristic(Characteristic.RemainingDuration);
    }
    svc.getCharacteristic(Characteristic.RemainingDuration)
      .onGet(() => this.zoneRemaining(port));

    this.zoneServices.set(port, svc);
  }

  zoneStatus(port) {
    const st = this.platform.statusFor(this.meta.deviceId);
    if (!st || !st.zones) return null;
    return st.zones.find((z) => z.port === port) || null;
  }

  zoneActive(port) {
    const z = this.zoneStatus(port);
    return z && z.isOn
      ? this.platform.Characteristic.Active.ACTIVE
      : this.platform.Characteristic.Active.INACTIVE;
  }

  zoneRemaining(port) {
    const z = this.zoneStatus(port);
    return z && z.remainingDuration > 0 ? Math.floor(z.remainingDuration) : 0;
  }

  async command(port, on, durationSec) {
    const label = this.zoneName(port);
    this.log.info("[%s / %s] %s (%ss)", this.meta.name, label, on ? "ON" : "OFF", durationSec);
    try {
      if (on) {
        await this.platform.cloud.turnZoneOn(this.meta.deviceId, port, durationSec);
      } else {
        await this.platform.cloud.turnZoneOff(this.meta.deviceId, port);
      }
      const svc = this.zoneServices.get(port);
      if (svc) {
        svc.updateCharacteristic(
          this.platform.Characteristic.Active,
          on ? this.platform.Characteristic.Active.ACTIVE : this.platform.Characteristic.Active.INACTIVE,
        );
        svc.updateCharacteristic(
          this.platform.Characteristic.InUse,
          on ? this.platform.Characteristic.InUse.IN_USE : this.platform.Characteristic.InUse.NOT_IN_USE,
        );
        svc.updateCharacteristic(
          this.platform.Characteristic.RemainingDuration,
          on ? durationSec : 0,
        );
      }
    } catch (err) {
      this.log.error("[%s / %s] Control failed: %s", this.meta.name, label, err.message || err);
    }
  }

  refresh() {
    let anyOn = false;
    for (const [port, svc] of this.zoneServices) {
      const active = this.zoneActive(port);
      if (active === this.platform.Characteristic.Active.ACTIVE) anyOn = true;
      svc.updateCharacteristic(this.platform.Characteristic.Active, active);
      svc.updateCharacteristic(
        this.platform.Characteristic.InUse,
        active === this.platform.Characteristic.Active.ACTIVE
          ? this.platform.Characteristic.InUse.IN_USE
          : this.platform.Characteristic.InUse.NOT_IN_USE,
      );
      svc.updateCharacteristic(
        this.platform.Characteristic.RemainingDuration,
        this.zoneRemaining(port),
      );
    }
    this.primary.updateCharacteristic(
      this.platform.Characteristic.InUse,
      anyOn
        ? this.platform.Characteristic.InUse.IN_USE
        : this.platform.Characteristic.InUse.NOT_IN_USE,
    );
  }
}

exports.SystemHandler = SystemHandler;
