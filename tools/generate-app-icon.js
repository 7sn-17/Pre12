#!/usr/bin/env node
/**
 * tools/generate-app-icon.js
 * ---------------------------------------------------------------------------
 * يولّد أيقونة الأندرويد التكيّفية (Adaptive Icon) بشكل صحيح:
 *
 *   1. خلفية خضراء (#10b981) عبر `values/ic_launcher_background.xml`
 *   2. طبقة أمامية: الشعار مُصغَّراً إلى 60% ومتمركزاً على لوحة شفافة
 *      108×108 (المنطقة الآمنة) ← `ic_launcher_foreground.png` داخل مجلدات mipmap
 *   3. `mipmap-anydpi-v26/ic_launcher.xml` و `ic_launcher_round.xml`
 *      يربطان الخلفية بالطبقة الأمامية.
 *
 * ⚠️ لماذا لا ننسخ `icon-512.png` كما هو؟
 *    لأن Adaptive Icon يقصّ الطبقة الأمامية إلى دائرة 66dp من 108dp،
 *    فنسخ الصورة كاملة يقصّ الشعار. كما أن النسخة الكاملة تُظهر
 *    إطاراً من لون الصورة حول الشعار عند إطلاق التطبيق.
 *
 * ⚠️ لماذا ليست `icon-512.png` PNG بخلفية شفافة أصلاً؟
 *    لأن الملف هو RGB (colorType 2) بلا قناة شفافية —只能是 خلفية خضراء
 *    + شعار أبيض. لذلك نضعه كاملاً داخل المنطقة الآمنة، والخلفية
 *    الخضراء هي ما يظهر حوله.
 *
 * بلا اعتماديات خارجية (لا sharp) — يعمل على أي جهاز.
 *
 * الاستخدام:  node tools/generate-app-icon.js
 * ---------------------------------------------------------------------------
 */

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'icon-512.png');
const RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');

/* ألوان الهوية ( taken from the logo's green gradient ) */
const BRAND_LIGHT = [0x14, 0xa1, 0x7e]; // #14A17E — أعلى اليمين
const BRAND_DARK = [0x04, 0x66, 0x4e];  // #04664E — أسفل اليسار

/* المنطقة الآمنة: 66dp من 108dp ⇒ الشعار 50% من اللوحة
   (Prompt 28: 50% بدل 60% — «السمّاعة تلامس حواف الأيقونة») */
const FOREGROUND_RATIO = 0.50;

/* الأيقونة القديمة (legacy): هامش لا يقل عن 15% من كل جهة */
const LEGACY_PADDING = 0.15;
const LEGACY_RATIO = 1 - (LEGACY_PADDING * 2);   // 0.70

/* كثافات الأيقونة: 108dp ⇒ px */
const DENSITIES = [
  ['mipmap-mdpi', 108],
  ['mipmap-hdpi', 162],
  ['mipmap-xhdpi', 216],
  ['mipmap-xxhdpi', 324],
  ['mipmap-xxxhdpi', 432]
];

/* ⭐ أحجام الأيقونة القديمة (legacy launcher icon) */
const LEGACY_SIZES = [
  ['mipmap-mdpi', 48],
  ['mipmap-hdpi', 72],
  ['mipmap-xhdpi', 96],
  ['mipmap-xxhdpi', 144],
  ['mipmap-xxxhdpi', 192]
];

/* ══════════════════════════════════════════════════════════
   PNG: قراءة
   ══════════════════════════════════════════════════════════ */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/** يفكّ ترميز PNG → { width, height, data: RGBA } */
function decodePNG(buffer) {
  const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) {
    if (buffer[i] !== SIGNATURE[i]) throw new Error('Not a PNG file');
  }

  let offset = 8;
  let header = null;
  let palette = null;
  let transparency = null;
  const idat = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.slice(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === 'IHDR') {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12]
      };
    } else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') transparency = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
  }

  if (!header) throw new Error('Missing IHDR');
  if (header.interlace) throw new Error('Interlaced PNGs are not supported');
  if (header.bitDepth !== 8) throw new Error('Only 8-bit PNGs are supported');

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[header.colorType];
  if (!channels) throw new Error('Unsupported color type ' + header.colorType);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = channels;
  const stride = header.width * bpp;
  const pixels = Buffer.alloc(header.height * stride);

  let pos = 0;
  for (let y = 0; y < header.height; y++) {
    const filter = raw[pos++];
    const line = raw.slice(pos, pos + stride);
    pos += stride;
    const out = pixels.slice(y * stride, (y + 1) * stride);
    const prior = y > 0 ? pixels.slice((y - 1) * stride, y * stride) : null;

    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[x - bpp] : 0;
      const b = prior ? prior[x] : 0;
      const c = prior && x >= bpp ? prior[x - bpp] : 0;
      let value = line[x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) value += paeth(a, b, c);
      out[x] = value & 0xff;
    }
  }

  const rgba = Buffer.alloc(header.width * header.height * 4);
  for (let i = 0; i < header.width * header.height; i++) {
    let r, g, b, a = 255;
    if (header.colorType === 0) {
      r = g = b = pixels[i];
    } else if (header.colorType === 2) {
      r = pixels[i * 3]; g = pixels[i * 3 + 1]; b = pixels[i * 3 + 2];
    } else if (header.colorType === 3) {
      const idx = pixels[i];
      r = palette[idx * 3]; g = palette[idx * 3 + 1]; b = palette[idx * 3 + 2];
      if (transparency && idx < transparency.length) a = transparency[idx];
    } else if (header.colorType === 4) {
      r = g = b = pixels[i * 2]; a = pixels[i * 2 + 1];
    } else {
      r = pixels[i * 4]; g = pixels[i * 4 + 1]; b = pixels[i * 4 + 2]; a = pixels[i * 4 + 3];
    }
    rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = a;
  }

  return { width: header.width, height: header.height, data: rgba };
}

/* ══════════════════════════════════════════════════════════
   PNG: كتابة
   ══════════════════════════════════════════════════════════ */

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;   // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ══════════════════════════════════════════════════════════
   معالجة الصور
   ══════════════════════════════════════════════════════════ */

/** تصغير ثنائي الخطّ مع الحفاظ على الشفافية */
function resize(image, targetW, targetH) {
  const out = Buffer.alloc(targetW * targetH * 4);
  const ratioX = image.width / targetW;
  const ratioY = image.height / targetH;

  for (let y = 0; y < targetH; y++) {
    const sy = Math.min(image.height - 1, Math.max(0, (y + 0.5) * ratioY - 0.5));
    const y0 = Math.floor(sy);
    const y1 = Math.min(image.height - 1, y0 + 1);
    const wy = sy - y0;

    for (let x = 0; x < targetW; x++) {
      const sx = Math.min(image.width - 1, Math.max(0, (x + 0.5) * ratioX - 0.5));
      const x0 = Math.floor(sx);
      const x1 = Math.min(image.width - 1, x0 + 1);
      const wx = sx - x0;

      const i00 = (y0 * image.width + x0) * 4;
      const i01 = (y0 * image.width + x1) * 4;
      const i10 = (y1 * image.width + x0) * 4;
      const i11 = (y1 * image.width + x1) * 4;
      const o = (y * targetW + x) * 4;

      for (let c = 0; c < 4; c++) {
        const top = image.data[i00 + c] * (1 - wx) + image.data[i01 + c] * wx;
        const bottom = image.data[i10 + c] * (1 - wx) + image.data[i11 + c] * wx;
        out[o + c] = Math.round(top * (1 - wy) + bottom * wy);
      }
    }
  }
  return { width: targetW, height: targetH, data: out };
}

/**
 * ⭐ يستخرج السمّاعة البيضاء من الخلفية الخضراء.
 *
 * المصدر `icon-512.png` هو RGB (بلا شفافية): سمّاعة بيضاء على تدرّج
 * أخضر. لذلك نحسب "ال.green-ness" لكل بكسل ونجعله شفافاً تدريجياً،
 * فنحصل على السمّاعة وحدها على خلفية شفافة — وهي بالضبط ما تحتاجه
 * الطبقة الأمامية لأيقونة تكيّفية.
 */
function extractForeground(image) {
  const { width, height } = image;
  const out = Buffer.alloc(width * height * 4);

  // عتبات الـ green-ness: كلما زادت زاد الشفافية
  const SOLID = 8;    // أبيض صريح ⇒ معتم تماماً
  const CLEAR = 45;   // أخضر واضح ⇒ شفاف تماماً

  for (let i = 0; i < width * height; i++) {
    const r = image.data[i * 4];
    const g = image.data[i * 4 + 1];
    const b = image.data[i * 4 + 2];
    const greenness = g - Math.min(r, b);

    let alpha;
    if (greenness <= SOLID) alpha = 1;
    else if (greenness >= CLEAR) alpha = 0;
    else alpha = 1 - (greenness - SOLID) / (CLEAR - SOLID);

    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = Math.round(255 * alpha);
  }

  return { width, height, data: out };
}

/** يقتطع الصورة حول محتواها المعتم */
function cropToContent(image, threshold) {
  const { width, height, data } = image;
  let minX = width, minY = height, maxX = -1, maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] <= threshold) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0) return image;

  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const src = ((y + minY) * width + minX) * 4;
    data.copy(out, y * w * 4, src, src + w * 4);
  }
  return { width: w, height: h, data: out };
}

/** ⭐ يرسم التدرّج الأخضر (فاتح أعلى اليمين ← غامق أسفل اليسار) */
function paintGradient(canvas, size) {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + (size - 1 - y)) / (2 * (size - 1));  // 0 = أسفل اليسار
      const o = (y * size + x) * 4;
      canvas[o] = Math.round(BRAND_DARK[0] + (BRAND_LIGHT[0] - BRAND_DARK[0]) * u);
      canvas[o + 1] = Math.round(BRAND_DARK[1] + (BRAND_LIGHT[1] - BRAND_DARK[1]) * u);
      canvas[o + 2] = Math.round(BRAND_DARK[2] + (BRAND_LIGHT[2] - BRAND_DARK[2]) * u);
      canvas[o + 3] = 255;
    }
  }
  return canvas;
}

/** ⭐ الأيقونة القديمة: تدرّج كامل + السمّاعة بهامش 15% */
function legacyIcon(image, size) {
  const canvas = paintGradient(Buffer.alloc(size * size * 4), size);
  const box = Math.round(size * LEGACY_RATIO);
  const ratio = Math.min(box / image.width, box / image.height);
  const logoW = Math.max(1, Math.round(image.width * ratio));
  const logoH = Math.max(1, Math.round(image.height * ratio));
  const logo = resize(image, logoW, logoH);
  const offsetX = Math.round((size - logoW) / 2);
  const offsetY = Math.round((size - logoH) / 2);

  for (let y = 0; y < logoH; y++) {
    for (let x = 0; x < logoW; x++) {
      const src = (y * logoW + x) * 4;
      const a = logo.data[src + 3] / 255;
      if (a <= 0) continue;
      const dst = ((y + offsetY) * size + (x + offsetX)) * 4;
      canvas[dst] = Math.round(logo.data[src] * a + canvas[dst] * (1 - a));
      canvas[dst + 1] = Math.round(logo.data[src + 1] * a + canvas[dst + 1] * (1 - a));
      canvas[dst + 2] = Math.round(logo.data[src + 2] * a + canvas[dst + 2] * (1 - a));
      canvas[dst + 3] = 255;
    }
  }
  return { width: size, height: size, data: canvas };
}

/** يضع الصورة في وسط لوحة شفافة (لأيقونة تكيّفية) */
function centerOnCanvas(image, size, scale) {
  const canvas = Buffer.alloc(size * size * 4);   // شفاف تماماً
  const box = Math.round(size * scale);
  const ratio = Math.min(box / image.width, box / image.height);
  const logoW = Math.max(1, Math.round(image.width * ratio));
  const logoH = Math.max(1, Math.round(image.height * ratio));
  const logo = resize(image, logoW, logoH);
  const offsetX = Math.round((size - logoW) / 2);
  const offsetY = Math.round((size - logoH) / 2);

  for (let y = 0; y < logoH; y++) {
    for (let x = 0; x < logoW; x++) {
      const src = (y * logoW + x) * 4;
      const dst = ((y + offsetY) * size + (x + offsetX)) * 4;
      const a = logo.data[src + 3] / 255;
      if (a <= 0) continue;
      canvas[dst] = Math.round(logo.data[src] * a + canvas[dst] * (1 - a));
      canvas[dst + 1] = Math.round(logo.data[src + 1] * a + canvas[dst + 1] * (1 - a));
      canvas[dst + 2] = Math.round(logo.data[src + 2] * a + canvas[dst + 2] * (1 - a));
      canvas[dst + 3] = Math.max(canvas[dst + 3], Math.round(logo.data[src + 3]));
    }
  }
  return { width: size, height: size, data: canvas };
}

/* ══════════════════════════════════════════════════════════
   الكتابة
   ══════════════════════════════════════════════════════════ */

function writeBinary(file, buffer) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buffer);
  console.log('   ✔ ' + path.relative(ROOT, file));
}

function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf8');
  console.log('   ✔ ' + path.relative(ROOT, file));
}

const ADAPTIVE_XML = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
    <monochrome android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`;

/* خلفية متدرّجة بنفس تدرّج الشعار (فاتح أعلى اليمين ← غامق أسفل اليسار) */
const BACKGROUND_XML = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <gradient
        android:type="linear"
        android:angle="315"
        android:startColor="#${BRAND_DARK.map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase()}"
        android:endColor="#${BRAND_LIGHT.map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase()}" />
</shape>
`;

function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error('✖ ' + SOURCE + ' not found');
    process.exit(1);
  }

  console.log('▶ decoding ' + path.relative(ROOT, SOURCE));
  const source = decodePNG(fs.readFileSync(SOURCE));
  console.log('   source: ' + source.width + '×' + source.height);

  console.log('▶ extracting the white stethoscope (removing the green background)');
  const extracted = cropToContent(extractForeground(source), 16);
  console.log('   stethoscope: ' + extracted.width + '×' + extracted.height);

  console.log('▶ adaptive foreground (safe zone ' + Math.round(FOREGROUND_RATIO * 100) + '%)');
  for (const [folder, size] of DENSITIES) {
    const foreground = centerOnCanvas(extracted, size, FOREGROUND_RATIO);
    writeBinary(
      path.join(RES, folder, 'ic_launcher_foreground.png'),
      encodePNG(foreground.width, foreground.height, foreground.data)
    );
  }

  console.log('▶ legacy icon (gradient + 15% padding)');
  for (const [folder, size] of LEGACY_SIZES) {
    const legacy = legacyIcon(extracted, size);
    writeBinary(
      path.join(RES, folder, 'ic_launcher.png'),
      encodePNG(legacy.width, legacy.height, legacy.data)
    );
    writeBinary(
      path.join(RES, folder, 'ic_launcher_round.png'),
      encodePNG(legacy.width, legacy.height, legacy.data)
    );
  }

  console.log('▶ background + adaptive icon xml');
  writeText(path.join(RES, 'drawable', 'ic_launcher_background.xml'), BACKGROUND_XML);
  writeText(path.join(RES, 'mipmap-anydpi-v26', 'ic_launcher.xml'), ADAPTIVE_XML);
  writeText(path.join(RES, 'mipmap-anydpi-v26', 'ic_launcher_round.xml'), ADAPTIVE_XML);

  // إزالة ملف اللون القديم (تعارض مع الـ drawable)
  const oldColor = path.join(RES, 'values', 'ic_launcher_background.xml');
  if (fs.existsSync(oldColor)) {
    fs.unlinkSync(oldColor);
    console.log('   ✔ removed the obsolete ' + path.relative(ROOT, oldColor));
  }

  console.log('\n✅ Adaptive icon generated (gradient background + 50% stethoscope, legacy with 15% padding).');
}

main();
