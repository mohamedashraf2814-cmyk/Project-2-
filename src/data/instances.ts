import type { SceneInstance } from '../types';

const PI = Math.PI;

/**
 * Every physical piece placed in the 3D scenes.
 * home  = final position in the assembled robot (cm, +z is forward, y up)
 * bench = where the part waits on the table before its stage
 * wire  = position in the wiring lab (everything laid flat and magnified)
 */
export const INSTANCES: SceneInstance[] = [
  // ----- robot, stage 2: chassis + caster
  { id: 'chassis', part: 'chassis', group: 'robot', stage: 2, label: 'الهيكل', home: [0, 0, 0], bench: [-38, 0, -4], benchRot: 0, wire: [0, 0, 0], from: [0, 12, 0] },
  { id: 'caster', part: 'caster', group: 'robot', stage: 2, label: 'العجلة الحرة', home: [0, 0, 9.5], bench: [-22, 0, -24], wire: [0, 0, 0] },
  // ----- stage 3: motors + wheels
  { id: 'motorL', part: 'motor', group: 'robot', stage: 3, label: 'المحرك الأيسر', home: [-6, 2.1, -3], bench: [-12, 0, -24], wire: [-34, 0, -26], wireRotY: 0 },
  { id: 'motorR', part: 'motor', group: 'robot', stage: 3, label: 'المحرك الأيمن', home: [6, 2.1, -3], bench: [-4, 0, -24], wire: [-20, 0, -26], wireRotY: 0 },
  { id: 'wheelL', part: 'wheel', group: 'robot', stage: 3, label: 'العجلة اليسرى', home: [-8.6, 0, -4.8], bench: [6, 0, -24], wire: [0, 0, 0], from: [-10, 0, 0] },
  { id: 'wheelR', part: 'wheel', group: 'robot', stage: 3, label: 'العجلة اليمنى', home: [8.6, 0, -4.8], bench: [16, 0, -24], wire: [0, 0, 0], from: [10, 0, 0] },
  // ----- stage 4: breadboard + ESP32
  { id: 'bb', part: 'breadboard', group: 'robot', stage: 4, label: 'لوحة التجارب', home: [-2.5, 5, -1.5], bench: [26, 0, -24], benchRot: PI / 2, wire: [0, 0, 0] },
  { id: 'esp', part: 'esp32', group: 'robot', stage: 4, label: 'ESP32', home: [-2.5, 5.9, -4], bench: [-34, 0, -36], wire: [0, 0, 6] },
  // ----- stage 5: driver
  { id: 'drv', part: 'tb6612', group: 'robot', stage: 5, label: 'TB6612FNG', home: [-2.5, 5.9, 2.2], bench: [-24, 0, -36], wire: [-6, 0, -26] },
  // ----- stage 6: ultrasonic + divider
  { id: 'us', part: 'hcsr04', group: 'robot', stage: 6, label: 'HC-SR04', home: [2.5, 5, 9.6], bench: [-14, 0, -36], wire: [30, 0, 4] },
  { id: 'div', part: 'divider', group: 'robot', stage: 6, label: 'مقسّم ECHO', home: [5.2, 5, 8.4], bench: [-6, 0, -36], wire: [30, 0, 18] },
  // ----- stage 7: OLED, buzzer driver, buzzer, button
  { id: 'oled', part: 'oled', group: 'robot', stage: 7, label: 'OLED', home: [-4.5, 5, 8.2], bench: [4, 0, -36], wire: [14, 0, 24] },
  { id: 'npn', part: 'npn', group: 'robot', stage: 7, label: 'مشغّل الجرس', home: [-2.5, 5.9, 5.3], bench: [12, 0, -36], wire: [-4, 0, 24] },
  { id: 'buz', part: 'buzzer', group: 'robot', stage: 7, label: 'الجرس', home: [1.8, 5, 6.0], bench: [20, 0, -36], wire: [-18, 0, 24] },
  { id: 'btn', part: 'button', group: 'robot', stage: 7, label: 'زر', home: [5.6, 5, 5.0], bench: [28, 0, -36], wire: [-32, 0, 24] },
  // ----- stage 8: power
  { id: 'batt', part: 'battery', group: 'robot', stage: 8, label: 'البطارية', home: [4.9, 5, -6.5], bench: [-34, 0, -48], wire: [-42, 0, -10] },
  { id: 'buck5', part: 'buck5', group: 'robot', stage: 8, label: 'منظم 5V', home: [3.8, 5, -1.8], bench: [-22, 0, -48], wire: [-26, 0, 2] },
  { id: 'buck6', part: 'buck6', group: 'robot', stage: 8, label: 'منظم المحركات', home: [3.8, 5, 2.2], bench: [-10, 0, -48], wire: [-26, 0, -12] },
  { id: 'sw', part: 'rocker', group: 'robot', stage: 8, label: 'مفتاح الطاقة', home: [5.8, 5, -9.6], bench: [2, 0, -48], wire: [-42, 0, 4] },
  // ----- wearable, stage 9
  { id: 'w_case', part: 'wcase', group: 'wearable', stage: 9, label: 'علبة السوار', home: [0, 0, 0], bench: [0, 0, -16], wire: [0, 0, 0], from: [0, 10, 0] },
  { id: 'w_esp', part: 'w_esp32', group: 'wearable', stage: 9, label: 'ESP32 السوار', home: [-1.6, 0.4, 1.8], rotY: PI / 2, bench: [-16, 0, -26], benchRot: PI / 2, wire: [-4, 0, 8], wireRotY: 0 },
  { id: 'w_lipo', part: 'w_lipo', group: 'wearable', stage: 9, label: 'بطارية Li-Po', home: [0.3, 0.4, -1.9], rotY: PI / 2, bench: [-6, 0, -26], benchRot: PI / 2, wire: [-26, 0, -12] },
  { id: 'w_tp', part: 'tp4056', group: 'wearable', stage: 9, label: 'TP4056', home: [-3.3, 0.4, -2.6], bench: [4, 0, -26], wire: [-12, 0, -12] },
  { id: 'w_boost', part: 'boost5', group: 'wearable', stage: 9, label: 'رافع 5V', home: [3.6, 0.4, 0], bench: [12, 0, -26], wire: [2, 0, -12] },
  { id: 'w_mpu', part: 'mpu6050', group: 'wearable', stage: 9, label: 'MPU6050', home: [3.0, 0.4, 2.6], bench: [20, 0, -26], wire: [16, 0, 12] },
  { id: 'w_btn', part: 'w_button', group: 'wearable', stage: 9, label: 'زر طوارئ', home: [1.8, 0.4, 0.4], bench: [28, 0, -26], wire: [26, 0, -6] },
];

export const instanceById = (id: string) => INSTANCES.find((i) => i.id === id);
export const instancesOf = (group: 'robot' | 'wearable') => INSTANCES.filter((i) => i.group === group);
