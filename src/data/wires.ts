import type { WireDef, WireKind } from '../types';

type EP = [string, string];
const mk = (id: string, a: EP, b: EP, kind: WireKind, purpose: string, extra: string, group: 'robot' | 'wearable', stage: number): WireDef => ({
  id,
  from: { part: a[0], pin: a[1] },
  to: { part: b[0], pin: b[1] },
  kind,
  purpose,
  instruction: extra,
  group,
  stage,
});

/**
 * Structured wiring table. Endpoints written as "@SIGNAL" are looked up in the configurable
 * ESP32 pin map (see data/gpio.ts) so the animation, the table and the checks always agree.
 */
export const WIRES: WireDef[] = [
  // ---------- power chain (robot) ----------
  mk('P1', ['batt', '+'], ['sw', 'IN'], 'power', 'من موجب البطارية إلى مفتاح الطاقة', 'اجعل المفتاح أول عنصر بعد موجب البطارية ليفصل كل الدوائر معًا.', 'robot', 8),
  mk('P2', ['sw', 'OUT'], ['buck6', 'IN+'], 'power', 'تغذية منظم المحركات بعد المفتاح', 'استخدم سلكًا أحمر سميكًا لتحمل تيار المحركات.', 'robot', 8),
  mk('P3', ['sw', 'OUT'], ['buck5', 'IN+'], 'power', 'تغذية منظم 5 فولت بعد المفتاح', 'يتفرع الموجب بعد المفتاح إلى المنظمين.', 'robot', 8),
  mk('P4', ['batt', '-'], ['buck6', 'IN-'], 'ground', 'سالب البطارية إلى منظم المحركات', 'اجعل السالب مباشرًا إلى المنظمات (المفتاح على الموجب فقط).', 'robot', 8),
  mk('P5', ['batt', '-'], ['buck5', 'IN-'], 'ground', 'سالب البطارية إلى منظم 5 فولت', 'نفس السالب المشترك.', 'robot', 8),
  mk('P6', ['buck6', 'OUT+'], ['drv', 'VM'], 'power', 'جهد المحركات (VM) من منظم المحركات', 'لا تأخذ VM من ESP32 أبدًا. اضبط المنظم على جهد المحركات قبل التوصيل.', 'robot', 8),
  mk('P7', ['buck6', 'OUT-'], ['drv', 'GND'], 'ground', 'أرضي المحركات إلى أرضي المشغّل', 'يغلق دائرة المحركات.', 'robot', 8),
  mk('P8', ['buck5', 'OUT+'], ['esp', 'VIN'], 'power', 'تغذية ESP32 بـ 5 فولت عبر VIN', 'تأكد أن الجهد 5.0 فولت بجهاز القياس قبل التوصيل.', 'robot', 8),
  mk('P9', ['buck5', 'OUT-'], ['esp', 'GND'], 'ground', 'أرضي منطق 5 فولت إلى ESP32', 'الأرضي المشترك مع المحركات مطلوب لعمل الإشارات.', 'robot', 8),
  mk('P10', ['buck5', 'OUT+'], ['us', 'VCC'], 'power', 'تغذية حساس المسافة بـ 5 فولت', 'HC-SR04 يحتاج 5 فولت وليس 3.3.', 'robot', 6),
  mk('P11', ['esp', '3V3'], ['drv', 'VCC'], 'power', 'جهد منطق TB6612 (3.3 فولت)', 'منطق المشغّل يعمل بنفس مستوى ESP32.', 'robot', 5),
  mk('P12', ['esp', '3V3'], ['oled', 'VCC'], 'power', 'تغذية شاشة OLED بـ 3.3 فولت', 'تحقق من ترتيب دبابيس الشاشة على لوحتك.', 'robot', 7),
  mk('P13', ['esp', 'GND'], ['us', 'GND'], 'ground', 'أرضي حساس المسافة', 'أرضي مشترك.', 'robot', 6),
  mk('P14', ['esp', 'GND'], ['oled', 'GND'], 'ground', 'أرضي الشاشة', 'أرضي مشترك.', 'robot', 7),
  mk('P15', ['esp', 'GND'], ['drv', 'GND'], 'ground', 'أرضي مشترك بين ESP32 والمشغّل', 'بدون أرضي مشترك لن تُفهم إشارات التحكم.', 'robot', 5),
  mk('P16', ['buck5', 'OUT+'], ['buz', '+'], 'power', 'موجب الجرس من 5 فولت', 'الجرس يأخذ تياره من المنظم وليس من GPIO.', 'robot', 7),
  mk('P17', ['esp', 'GND'], ['btn', '2'], 'ground', 'طرف زر الطوارئ إلى الأرضي', 'الضغط يوصّل GPIO بالأرضي (LOW).', 'robot', 7),
  // ---------- motor control ----------
  mk('M1', ['esp', '@AIN1'], ['drv', 'AIN1'], 'motor', 'اتجاه المحرك الأيسر (1)', 'من دبوس AIN1 في ESP32 إلى AIN1 في المشغّل.', 'robot', 5),
  mk('M2', ['esp', '@AIN2'], ['drv', 'AIN2'], 'motor', 'اتجاه المحرك الأيسر (2)', 'من دبوس AIN2 إلى AIN2.', 'robot', 5),
  mk('M3', ['esp', '@PWMA'], ['drv', 'PWMA'], 'motor', 'سرعة المحرك الأيسر (PWM)', 'استخدم دبوسًا يدعم PWM (LEDC).', 'robot', 5),
  mk('M4', ['esp', '@BIN1'], ['drv', 'BIN1'], 'motor', 'اتجاه المحرك الأيمن (1)', 'من BIN1 إلى BIN1.', 'robot', 5),
  mk('M5', ['esp', '@BIN2'], ['drv', 'BIN2'], 'motor', 'اتجاه المحرك الأيمن (2)', 'من BIN2 إلى BIN2.', 'robot', 5),
  mk('M6', ['esp', '@PWMB'], ['drv', 'PWMB'], 'motor', 'سرعة المحرك الأيمن (PWM)', 'من PWMB إلى PWMB.', 'robot', 5),
  mk('M7', ['esp', '@STBY'], ['drv', 'STBY'], 'motor', 'تمكين المشغّل (STBY)', 'ضع مقاومة سحب للأسفل 10 كيلو أوم على STBY ليبقى المشغّل متوقفًا أثناء الإقلاع.', 'robot', 5),
  mk('M8', ['drv', 'AO1'], ['motorL', '+'], 'motor', 'مخرج A1 إلى المحرك الأيسر', 'إذا دار المحرك للخلف عند "أمام" بدّل السلكين.', 'robot', 5),
  mk('M9', ['drv', 'AO2'], ['motorL', '-'], 'motor', 'مخرج A2 إلى المحرك الأيسر', 'الطرف الثاني للمحرك الأيسر.', 'robot', 5),
  mk('M10', ['drv', 'BO1'], ['motorR', '+'], 'motor', 'مخرج B1 إلى المحرك الأيمن', 'المحرك الأيمن على القناة B.', 'robot', 5),
  mk('M11', ['drv', 'BO2'], ['motorR', '-'], 'motor', 'مخرج B2 إلى المحرك الأيمن', 'الطرف الثاني للمحرك الأيمن.', 'robot', 5),
  // ---------- ultrasonic ----------
  mk('S1', ['esp', '@TRIG'], ['us', 'TRIG'], 'digital', 'نبضة إطلاق الحساس (TRIG)', 'يقبل مستوى 3.3 فولت.', 'robot', 6),
  mk('S2', ['us', 'ECHO'], ['div', 'IN'], 'digital', 'إشارة ECHO بجهد 5 فولت إلى مقسّم الجهد', 'لا توصّل ECHO بـ ESP32 مباشرة؛ مرّرها عبر المقسّم.', 'robot', 6),
  mk('S3', ['div', 'OUT'], ['esp', '@ECHO'], 'digital', 'خرج المقسّم (≈3.3 فولت) إلى دبوس الإدخال', 'الآن الجهد آمن لدبوس ESP32.', 'robot', 6),
  mk('S4', ['div', 'GND'], ['esp', 'GND'], 'ground', 'أرضي مقسّم الجهد', 'مقاومة 2 كيلو أوم تصل بالأرضي.', 'robot', 6),
  // ---------- buzzer / button ----------
  mk('B1', ['esp', '@BUZ'], ['npn', 'B'], 'digital', 'إشارة الجرس إلى قاعدة الترانزستور (عبر 1 كيلو أوم)', 'الترانزستور يقود تيار الجرس بدل دبوس ESP32.', 'robot', 7),
  mk('B2', ['npn', 'C'], ['buz', '-'], 'digital', 'مجمّع الترانزستور إلى سالب الجرس', 'عند تشغيل القاعدة يمرّ تيار الجرس.', 'robot', 7),
  mk('B3', ['npn', 'E'], ['esp', 'GND'], 'ground', 'باعث الترانزستور إلى الأرضي', 'أرضي مشترك.', 'robot', 7),
  mk('B4', ['esp', '@BTN'], ['btn', '1'], 'digital', 'زر الطوارئ إلى دبوس الإدخال', 'فعّل INPUT_PULLUP في البرنامج: الضغط يعطي LOW.', 'robot', 7),
  // ---------- I2C OLED ----------
  mk('I1', ['esp', '@SDA'], ['oled', 'SDA'], 'i2c', 'خط بيانات I2C للشاشة', 'من SDA في ESP32 إلى SDA في الشاشة.', 'robot', 7),
  mk('I2', ['esp', '@SCL'], ['oled', 'SCL'], 'i2c', 'خط ساعة I2C للشاشة', 'من SCL في ESP32 إلى SCL في الشاشة.', 'robot', 7),
  // ---------- wearable ----------
  mk('W1', ['w_lipo', '+'], ['w_tp', 'B+'], 'power', 'موجب البطارية إلى مدخل الشاحن B+', 'تحقق من القطبية قبل التوصيل.', 'wearable', 9),
  mk('W2', ['w_lipo', '-'], ['w_tp', 'B-'], 'ground', 'سالب البطارية إلى B−', 'السالب مباشرة.', 'wearable', 9),
  mk('W3', ['w_tp', 'OUT+'], ['w_boost', 'IN+'], 'power', 'مخرج الشاحن (محميّ) إلى مدخل رافع الجهد', 'استخدم مخرج OUT المحميّ وليس مدخل البطارية.', 'wearable', 9),
  mk('W4', ['w_tp', 'OUT-'], ['w_boost', 'IN-'], 'ground', 'أرضي الشاحن إلى رافع الجهد', 'أرضي.', 'wearable', 9),
  mk('W5', ['w_boost', 'OUT+'], ['w_esp', 'VIN'], 'power', 'رافع الجهد (5 فولت) إلى VIN', 'اضبط الخرج على 5.0 فولت أولًا.', 'wearable', 9),
  mk('W6', ['w_boost', 'OUT-'], ['w_esp', 'GND'], 'ground', 'أرضي رافع الجهد إلى ESP32', 'أرضي.', 'wearable', 9),
  mk('W7', ['w_esp', '3V3'], ['w_mpu', 'VCC'], 'power', 'تغذية MPU6050 بـ 3.3 فولت', 'تيار منخفض.', 'wearable', 9),
  mk('W8', ['w_esp', 'GND'], ['w_mpu', 'GND'], 'ground', 'أرضي الحساس', 'أرضي.', 'wearable', 9),
  mk('W9', ['w_esp', '@W_SDA'], ['w_mpu', 'SDA'], 'i2c', 'خط بيانات I2C للحساس', 'من SDA إلى SDA.', 'wearable', 9),
  mk('W10', ['w_esp', '@W_SCL'], ['w_mpu', 'SCL'], 'i2c', 'خط ساعة I2C للحساس', 'من SCL إلى SCL.', 'wearable', 9),
  mk('W11', ['w_esp', 'GND'], ['w_mpu', 'AD0'], 'ground', 'تثبيت عنوان I2C على 0x68', 'AD0 إلى الأرضي.', 'wearable', 9),
  mk('W12', ['w_esp', '@W_BTN'], ['w_btn', '1'], 'digital', 'زر طوارئ السوار إلى دبوس الإدخال', 'INPUT_PULLUP: الضغط يعطي LOW.', 'wearable', 9),
  mk('W13', ['w_btn', '2'], ['w_esp', 'GND'], 'ground', 'الطرف الآخر للزر إلى الأرضي', 'أرضي.', 'wearable', 9),
];

export const KIND_LABELS: Record<WireKind, string> = {
  power: 'طاقة (+)',
  ground: 'أرضي (GND)',
  digital: 'إشارة رقمية',
  i2c: 'I2C',
  motor: 'تحكم/محركات',
};

export const KIND_COLORS: Record<WireKind, string> = {
  power: '#FF5A5F',
  ground: '#9AA7BA',
  digital: '#FFD166',
  i2c: '#00D9FF',
  motor: '#C77DFF',
};
