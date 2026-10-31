/**
 * 🔒 صورة «الرجاء التواصل مع المطور» — تُرسل قبل مغادرة البوت لمجموعة أضافه إليها غير المطور.
 * تُرسم بالكود بلا مكتبات (الكلمات العربية صور حروف مضمّنة).
 * لاستعمال صورتك أنت بدلها: ضع assets/lock.jpg (أو lock.png / lock.jpeg) وسيُرسلها البوت تلقائيًا.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const MASKS = {"m":{"contact":{"w":818,"h":80,"d":"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"},"private":{"w":757,"h":80,"d":"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"},"leaving":{"w":686,"h":80,"d":"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"}},"bandH":80};
const W = 900, H = 500;
const cache = {};
function mask(key) {
    if (cache[key]) return cache[key];
    const m = MASKS.m[key]; if (!m) return null;
    return (cache[key] = { w: m.w, h: m.h, a: zlib.inflateSync(Buffer.from(m.d, 'base64')) });
}
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => a + (b - a) * t;

function blend(d, x, y, c, a) {
    x = Math.floor(x); y = Math.floor(y);
    if (a <= 0 || x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    d[i] += (c[0] - d[i]) * a; d[i + 1] += (c[1] - d[i + 1]) * a; d[i + 2] += (c[2] - d[i + 2]) * a;
}
function background() {
    const d = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const t = clamp01(x / W * 0.55 + y / H * 0.45);
        let r = mix(70, 28, t), g = mix(12, 16, t), b = mix(32, 70, t);
        if (((x + y) % 50) < 5) { r += 9; g += 3; b += 10; }
        const v = 1 - 0.4 * Math.pow(Math.hypot(x / W - 0.5, y / H - 0.5) * 1.5, 2);
        const i = (y * W + x) * 4;
        d[i] = r * v; d[i + 1] = g * v; d[i + 2] = b * v; d[i + 3] = 255;
    }
    return d;
}
function disc(d, cx, cy, r, c, alpha = 1) {
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++)
        blend(d, x, y, c, clamp01(r + 0.5 - Math.hypot(x + 0.5 - cx, y + 0.5 - cy)) * alpha);
}
function roundRect(d, x, y, w, h, rad, c, alpha = 1) {
    const cx = x + w / 2, cy = y + h / 2;
    for (let py = Math.floor(y) - 1; py <= Math.ceil(y + h) + 1; py++) for (let px = Math.floor(x) - 1; px <= Math.ceil(x + w) + 1; px++) {
        const qx = Math.abs(px + 0.5 - cx) - (w / 2 - rad), qy = Math.abs(py + 0.5 - cy) - (h / 2 - rad);
        const dist = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rad;
        blend(d, px, py, c, clamp01(0.5 - dist) * alpha);
    }
}
function drawMask(d, m, left, top, s, c, alpha = 1) {
    const dw = Math.ceil(m.w * s), dh = Math.ceil(m.h * s);
    for (let dy = 0; dy < dh; dy++) for (let dx = 0; dx < dw; dx++) {
        let sum = 0;
        for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) {
            const u = Math.min(m.w - 1, Math.floor((dx + (sx + 0.5) / 3) / s)), v = Math.min(m.h - 1, Math.floor((dy + (sy + 0.5) / 3) / s));
            sum += m.a[v * m.w + u];
        }
        blend(d, left + dx, top + dy, c, (sum / 9 / 255) * alpha);
    }
}
/** نص عربي في المنتصف: h ارتفاع النص، maxW أقصى عرض */
function textC(d, key, cx, y, h, c, maxW) {
    const m = mask(key); if (!m) return;
    let s = h / MASKS.bandH; if (m.w * s > maxW) s = maxW / m.w;
    drawMask(d, m, Math.round(cx - m.w * s / 2), Math.round(y + (h - m.h * s) / 2), s, c);
}

function draw() {
    const d = background(), cx = W / 2, GOLD = [255, 205, 80], WHITE = [255, 255, 255];
    disc(d, cx, 138, 92, [255, 90, 110], 0.1); disc(d, cx, 138, 68, [255, 90, 110], 0.12);   // توهّج
    // قفل: القوس العلوي ثم الجسم ثم ثقب المفتاح
    for (let y = 40; y <= 160; y++) for (let x = cx - 60; x <= cx + 60; x++) {
        if (y > 118) continue;
        const dist = Math.abs(Math.hypot(x + 0.5 - cx, y + 0.5 - 118) - 40);
        blend(d, x, y, GOLD, clamp01(8.5 - dist));
    }
    roundRect(d, cx - 70, 112, 140, 112, 20, GOLD);
    roundRect(d, cx - 70, 112, 140, 112, 20, WHITE, 0.14);
    disc(d, cx, 158, 15, [60, 20, 40]);
    roundRect(d, cx - 6, 160, 12, 36, 5, [60, 20, 40]);
    textC(d, 'contact', cx, 258, 66, WHITE, 800);
    for (let x = cx - 190; x <= cx + 190; x++) for (let t = 0; t < 3; t++) blend(d, x, 340 + t, GOLD, 0.85 * (1 - Math.abs(x - cx) / 230));
    textC(d, 'private', cx, 362, 36, [255, 214, 222], 760);
    textC(d, 'leaving', cx, 424, 28, [210, 170, 190], 700);
    return d;
}

const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
}
function encodePng(rgba) {
    const stride = W * 4, raw = Buffer.alloc((stride + 1) * H);
    for (let y = 0; y < H; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}

/** مسار صورة جاهزة للإرسال: صورتك assets/lock.* إن وُجدت، وإلا بطاقة مرسومة بالكود. يعيد { file, temp } أو null */
function getImage() {
    try {
        const dir = path.join(__dirname, '..', 'assets');
        for (const f of ['lock.jpg', 'lock.jpeg', 'lock.png']) {
            const p = path.join(dir, f);
            if (fs.existsSync(p)) return { file: p, temp: false };
        }
        const file = path.join(os.tmpdir(), `kira-lock-${Date.now()}-${Math.floor(Math.random() * 1e6)}.png`);
        fs.writeFileSync(file, encodePng(draw()));
        return { file, temp: true };
    } catch (e) { return null; }
}

module.exports = { getImage, draw, encodePng, W, H };
