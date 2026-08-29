"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SensorHandler = void 0;

class SensorHandler {
  constructor(platform, accessory, meta) {
    this.platform = platform;
    this.accessory = accessory;
    this.meta = meta;

    const { Service, Characteristic } = platform;
    const info = accessory.getService(Service.AccessoryInformation)
      || accessory.addService(Service.AccessoryInformation);
    info
      .setCharacteristic(Characteristic.Manufacturer, "RainPoint")
      .setCharacteristic(Characteristic.Model, meta.model || "Sensor")
      .setCharacteristic(Characteristic.SerialNumber, String(meta.deviceId));

    this.humidity = accessory.getService(Service.HumiditySensor)
      || accessory.addService(Service.HumiditySensor, meta.name);
    this.humidity.setCharacteristic(Characteristic.Name, meta.name);
    this.humidity.getCharacteristic(Characteristic.CurrentRelativeHumidity)
      .onGet(() => this.moisture());

    this.temperature = accessory.getService(Service.TemperatureSensor);
    this.battery = accessory.getService(Service.Battery);
  }

  status() {
    return this.platform.statusFor(this.meta.deviceId);
  }

  moisture() {
    const st = this.status();
    const v = st && st.moisture != null ? Number(st.moisture) : 0;
    return Math.max(0, Math.min(100, v));
  }

  refresh() {
    const st = this.status();
    if (!st) return;
    const { Service, Characteristic } = this.platform;

    if (st.moisture != null) {
      this.humidity.updateCharacteristic(
        Characteristic.CurrentRelativeHumidity,
        Math.max(0, Math.min(100, Number(st.moisture))),
      );
    }

    if (st.temperature != null) {
      if (!this.temperature) {
        this.temperature = this.accessory.addService(
          Service.TemperatureSensor,
          `${this.meta.name} Temp`,
        );
      }
      this.temperature.updateCharacteristic(
        Characteristic.CurrentTemperature,
        Number(st.temperature),
      );
    }

    if (st.battery != null) {
      if (!this.battery) {
        this.battery = this.accessory.addService(Service.Battery, `${this.meta.name} Battery`);
      }
      const level = Math.max(0, Math.min(100, Number(st.battery)));
      this.battery.updateCharacteristic(Characteristic.BatteryLevel, level);
      this.battery.updateCharacteristic(
        Characteristic.StatusLowBattery,
        level < 20
          ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
          : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL,
      );
    }
  }
}

exports.SensorHandler = SensorHandler;
