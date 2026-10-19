#!/usr/bin/env node
/**
 * tools/generate-android-assets.js
 * ---------------------------------------------------------------------------
 * يولّد موارد الأندرويد (أيقونة التطبيق + شاشة البدء + أيقونة الإشعارات)
 * من ملف `icon-512.png` بدون أي اعتماديات خارجية.
 *
 * لماذا مكتوب يدوياً؟
 *   حزمة `sharp` (المستخدمة في @capacitor/assets) لا تُبنى على
 *   android-arm64، ولا توجد أدوات صور على الجهاز — فهذه الأداة
 *   تعمل في أي مكان بلا installs.
 *
 * الاستخدام:
 *   node tools/generate-android-assets.js
 *
 * المخرجات:
 *   assets/icon-only.png         1024×1024  (مصدر أيقونة التطبيق)
 *   assets/icon-background.png   1024×1024  (خلفية الأيقونة)
 *   assets/icon-foreground.png   1024×1024  (الطبقة الأمامية)
 *   assets/splash.png            2732×2732  (شاشة البدء)
 *   assets/splash-dark.png       2732×2732  (شاشة البدء الليلية)
 *   android/app/src/main/res/mipmap-<density>/ic_launcher.png  (+ variants)
 *   android/app/src/main/res/drawable/splash.png
 *   android/app/src/main/res/drawable/ic_stat_icon.xml
 * ---------------------------------------------------------------------------
 */

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_ICON = path.join(ROOT, 'icon-512.png');
const BRAND_BG = [0x06, 0x11, 0x0d];      // #06110d
const BRAND_ACCENT = [0x10, 0xb9, 0x81]; // #10b981

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

/** يفكّ ترميز PNG إلى { width, height, data: RGBA } */
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
    } else if (type === 'PLTE') {
      palette = data;
    } else if (type === 'tRNS') {
      transparency = data;
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
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

  // إلى RGBA
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
  ihdr[8] = 8;   // bit depth
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

/** تكبير/تصغير ثنائي الخطّ (bilinear) مع معالجة الشفافية */
function resize(image, targetW, targetH) {
  const src = image.data;
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
        const top = src[i00 + c] * (1 - wx) + src[i01 + c] * wx;
        const bottom = src[i10 + c] * (1 - wx) + src[i11 + c] * wx;
        out[o + c] = Math.round(top * (1 - wy) + bottom * wy);
      }
    }
  }
  return { width: targetW, height: targetH, data: out };
}

/** يملأ بلون خلفية معتم */
function flatten(image, background) {
  const out = Buffer.alloc(image.data.length);
  for (let i = 0; i < image.width * image.height; i++) {
    const a = image.data[i * 4 + 3] / 255;
    out[i * 4] = Math.round(image.data[i * 4] * a + background[0] * (1 - a));
    out[i * 4 + 1] = Math.round(image.data[i * 4 + 1] * a + background[1] * (1 - a));
    out[i * 4 + 2] = Math.round(image.data[i * 4 + 2] * a + background[2] * (1 - a));
    out[i * 4 + 3] = 255;
  }
  return { width: image.width, height: image.height, data: out };
}

/** يضع الصورة في وسط لوحة بلون خلفية */
function placeOnCanvas(image, canvasSize, background, scale) {
  const canvas = Buffer.alloc(canvasSize * canvasSize * 4);
  for (let i = 0; i < canvasSize * canvasSize; i++) {
    canvas[i * 4] = background[0];
    canvas[i * 4 + 1] = background[1];
    canvas[i * 4 + 2] = background[2];
    canvas[i * 4 + 3] = 255;
  }
  const size = Math.round(canvasSize * scale);
  const logo = resize(image, size, size);
  const offset = Math.round((canvasSize - size) / 2);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 4;
      const dst = ((y + offset) * canvasSize + (x + offset)) * 4;
      const a = logo.data[src + 3] / 255;
      canvas[dst] = Math.round(logo.data[src] * a + canvas[dst] * (1 - a));
      canvas[dst + 1] = Math.round(logo.data[src + 1] * a + canvas[dst + 1] * (1 - a));
      canvas[dst + 2] = Math.round(logo.data[src + 2] * a + canvas[dst + 2] * (1 - a));
      canvas[dst + 3] = 255;
    }
  }
  return { width: canvasSize, height: canvasSize, data: canvas };
}

/* ══════════════════════════════════════════════════════════
   الكتابة على القرص
   ══════════════════════════════════════════════════════════ */

function write(file, buffer) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buffer);
  console.log('   ✔ ' + path.relative(ROOT, file));
}

function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf8');
  console.log('   ✔ ' + path.relative(ROOT, file));
}

/* ══════════════════════════════════════════════════════════
   البرنامج
   ══════════════════════════════════════════════════════════ */

const DENSITIES = [
  ['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]
];

const STAT_ICONS = `<?xml version="1.0" encoding="utf-8"?>
<!-- أيقونة شريط الإشعارات: النسخة الوحيدة (أبيض شفاف) -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
    <path
        android:fillColor="#FFFFFFFF"
        android:pathData="M19,3H5C3.9,3 3,3.9 3,5v14c0,1.1 0.9,2 2,2h14c1.1,0 2,-0.9 2,-2V5C21,3.9 20.1,3 19,3zM19,19H5V5h14V19z" />
    <path
        android:fillColor="#FFFFFFFF"
        android:pathData="M12,7.5c-1.93,0 -3.5,1.57 -3.5,3.5c0,1.04 0.46,1.97 1.16,2.62L9,15.5h6l-0.66,-1.88C15.04,12.97 15.5,12.04 15.5,11C15.5,9.07 13.93,7.5 12,7.5z" />
    <path
        android:fillColor="#FFFFFFFF"
        android:pathData="M10.5,16.2L9.4,19h5.2l-1.1,-2.8H10.5z" />
</vector>
`;

function main() {
  if (!fs.existsSync(SOURCE_ICON)) {
    console.error('✖ ' + SOURCE_ICON + ' not found');
    process.exit(1);
  }

  console.log('▶ decoding ' + path.relative(ROOT, SOURCE_ICON));
  const source = decodePNG(fs.readFileSync(SOURCE_ICON));
  console.log('   source: ' + source.width + '×' + source.height);

  /* ── 1) مصادر assets/ (لـ @capacitor/assets في CI) ── */
  console.log('▶ assets/');
  const iconOnly = resize(source, 1024, 1024);
  write(path.join(ROOT, 'assets', 'icon-only.png'), encodePNG(iconOnly.width, iconOnly.height, iconOnly.data));

  const solid = flatten(source, BRAND_BG);
  const background = placeOnCanvas(solid, 1024, BRAND_BG, 1);
  write(path.join(ROOT, 'assets', 'icon-background.png'), encodePNG(1024, 1024, background.data));

  const foreground = placeOnCanvas(source, 1024, [0, 0, 0], 0.62);
  write(path.join(ROOT, 'assets', 'icon-foreground.png'), encodePNG(1024, 1024, foreground.data));

  const splash = placeOnCanvas(solid, 2732, BRAND_BG, 0.34);
  write(path.join(ROOT, 'assets', 'splash.png'), encodePNG(2732, 2732, splash.data));
  write(path.join(ROOT, 'assets', 'splash-dark.png'), encodePNG(2732, 2732, splash.data));
  write(path.join(ROOT, 'assets', 'logo.png'), encodePNG(1024, 1024, iconOnly.data));

  /* ── 2) أيقونات المشغّل في android/ ── */
  console.log('▶ android launcher icons');
  for (const [density, size] of DENSITIES) {
    const icon = resize(source, size, size);
    const png = encodePNG(size, size, icon.data);
    const dir = path.join(ROOT, 'android', 'app', 'src', 'main', 'res', 'mipmap-' + density);
    write(path.join(dir, 'ic_launcher.png'), png);
    write(path.join(dir, 'ic_launcher_round.png'), png);
    write(path.join(dir, 'ic_launcher_foreground.png'), png);
  }

  /* ── 3) أيقونة الإشعارات ── */
  console.log('▶ notification icon');
  writeText(path.join(ROOT, 'android', 'app', 'src', 'main', 'res', 'drawable', 'ic_stat_icon.xml'), STAT_ICONS);
  writeText(path.join(ROOT, 'android', 'app', 'src', 'main', 'res', 'drawable-v24', 'ic_stat_icon.xml'), STAT_ICONS);

  /* ── 4) شاشة البدء ── */
  console.log('▶ splash screens');
  for (const [density, size] of [['mdpi', 320], ['hdpi', 480], ['xhdpi', 720], ['xxhdpi', 960], ['xxxhdpi', 1280]]) {
    const splashImage = placeOnCanvas(solid, size, BRAND_BG, 0.34);
    const png = encodePNG(size, size, splashImage.data);
    write(
      path.join(ROOT, 'android', 'app', 'src', 'main', 'res', 'drawable-' + density, 'splash.png'),
      png
    );
    // القوالب الموروثة من Capacitor تضع شاشة البدء في مجلدَي
    // port و land — نستبدلهما أيضاً بنفس الهوية.
    for (const orientation of ['port', 'land']) {
      write(
        path.join(ROOT, 'android', 'app', 'src', 'main', 'res', 'drawable-' + orientation + '-' + density, 'splash.png'),
        png
      );
    }
  }

  /* ── 5) ألوان الأيقونة التكيّفية ── */
  writeText(
    path.join(ROOT, 'android', 'app', 'src', 'main', 'res', 'values', 'ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#06110D</color>
</resources>
`
  );

  console.log('\n✅ Android assets generated.');
}

main();
