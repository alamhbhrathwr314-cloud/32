/**
 * 💔 بطاقة الطلاق: صورة أنمي (من assets/divorce) تحتها شريط علوي فيه بروفايل الشخصين
 * وبينهما قلب مكسور. الإخراج JPEG (حجم صغير لسرعة الإرسال).
 * الاعتماد: jpeg-js (موجودة في package.json) + أدوات الفك والترميز من marryImage.js.
 */
const { decodeImage } = require('./marryImage');

const W = 900, BAND = 250, RING = 7, AV_R = 88;
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

const canvas = (w, h, rgb) => {
    const d = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) { d[i * 4] = rgb[0]; d[i * 4 + 1] = rgb[1]; d[i * 4 + 2] = rgb[2]; d[i * 4 + 3] = 255; }
    return { w, h, d };
};
function blend(c, x, y, r, g, b, a) {
    if (a <= 0 || x < 0 || y < 0 || x >= c.w || y >= c.h) return;
    const i = (y * c.w + x) * 4;
    c.d[i] += (r - c.d[i]) * a; c.d[i + 1] += (g - c.d[i + 1]) * a; c.d[i + 2] += (b - c.d[i + 2]) * a;
}
function sample(img, u, v) { // استيفاء ثنائي الخطي (الشفافية فوق الأبيض)
    const { width: w, height: h, data } = img;
    u = Math.min(Math.max(u, 0), w - 1); v = Math.min(Math.max(v, 0), h - 1);
    const x0 = Math.floor(u), y0 = Math.floor(v), x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1);
    const fx = u - x0, fy = v - y0, out = [0, 0, 0];
    const px = (x, y) => { const i = (y * w + x) * 4, a = data[i + 3] / 255; return [data[i] * a + 255 * (1 - a), data[i + 1] * a + 255 * (1 - a), data[i + 2] * a + 255 * (1 - a)]; };
    const c00 = px(x0, y0), c10 = px(x1, y0), c01 = px(x0, y1), c11 = px(x1, y1);
    for (let k = 0; k < 3; k++) out[k] = (c00[k] * (1 - fx) + c10[k] * fx) * (1 - fy) + (c01[k] * (1 - fx) + c11[k] * fx) * fy;
    return out;
}
function seedColor(seed) {
    let h = 0; for (const ch of String(seed)) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
    const hue = (h % 360) / 360, s = 0.5, l = 0.6;
    const f = n => { const k = (n + hue * 12) % 12, a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
    return [f(0), f(8), f(4)];
}

/** صورة الأنمي مُصغَّرة إلى عرض الصورة النهائية */
function drawScaled(c, img, x0, y0, w, h) {
    for (let py = 0; py < h; py++) {
        for (let px = 0; px < w; px++) {
            const col = sample(img, (px + 0.5) / w * img.width - 0.5, (py + 0.5) / h * img.height - 0.5);
            const i = ((y0 + py) * c.w + (x0 + px)) * 4;
            c.d[i] = col[0]; c.d[i + 1] = col[1]; c.d[i + 2] = col[2];
        }
    }
}

/** أفاتار دائري بحلقة بيضاء وظل، وبتقليل ألوان خفيف للحزن */
function avatar(c, cx, cy, R, img, seed, gray = 0.45) {
    const OUT = R + RING;
    for (let py = cy - OUT - 20; py <= cy + OUT + 20; py++) for (let px = cx - OUT - 20; px <= cx + OUT + 20; px++) {
        blend(c, px, py, 70, 60, 90, 0.22 * clamp01((OUT + 12 - Math.hypot(px - cx, py - cy - 6)) / 18));
    }
    for (let py = cy - OUT - 1; py <= cy + OUT + 1; py++) for (let px = cx - OUT - 1; px <= cx + OUT + 1; px++) {
        blend(c, px, py, 255, 255, 255, clamp01(OUT + 0.5 - Math.hypot(px + 0.5 - cx, py + 0.5 - cy)));
    }
    const base = seedColor(seed);
    let side = 0, ox = 0, oy = 0;
    if (img) { side = Math.min(img.width, img.height); ox = (img.width - side) / 2; oy = (img.height - side) / 2; }
    for (let py = cy - R - 1; py <= cy + R + 1; py++) for (let px = cx - R - 1; px <= cx + R + 1; px++) {
        const a = clamp01(R + 0.5 - Math.hypot(px + 0.5 - cx, py + 0.5 - cy));
        if (a <= 0) continue;
        let r, g, b;
        if (img) {
            [r, g, b] = sample(img, ((px + 0.5 - (cx - R)) / (2 * R)) * side + ox, ((py + 0.5 - (cy - R)) / (2 * R)) * side + oy);
        } else {
            const nx = (px + 0.5 - cx) / R, ny = (py + 0.5 - cy) / R, shade = 1 - 0.18 * ((ny + 1) / 2);
            r = base[0] * shade; g = base[1] * shade; b = base[2] * shade;
            if (nx * nx + (ny + 0.22) ** 2 <= 0.09 || (nx / 0.62) ** 2 + ((ny - 0.72) / 0.5) ** 2 <= 1) { r = r * 0.12 + 224; g = g * 0.12 + 224; b = b * 0.12 + 224; }
        }
        const gr = r * 0.3 + g * 0.59 + b * 0.11;
        blend(c, px, py, r + (gr - r) * gray, g + (gr - g) * gray, b + (gr - b) * gray, a);
    }
}

/* القلب المكسور */
const inHeart = (x, y) => { const a = x * x + y * y - 1; return a * a * a - x * x * y * y * y <= 0; };
const zig = ty => 0.11 * (4 * Math.abs((((ty * 2.4) % 1) + 1) % 1 - 0.5) - 1);
function halfHeart(c, cx, cy, s, side, dx, dy, ang, colorAt, grow = 1) {
    const cos = Math.cos(-ang), sin = Math.sin(-ang), r = 1.5 * s + Math.abs(dx) + Math.abs(dy);
    for (let py = Math.floor(cy - r); py <= cy + r; py++) for (let px = Math.floor(cx - r); px <= cx + r; px++) {
        let hit = 0;
        for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) {
            const X = px + (sx + 0.5) / 3 - cx - dx, Y = py + (sy + 0.5) / 3 - cy - dy;
            const lx = (X * cos - Y * sin) / (s * grow), ly = (X * sin + Y * cos) / (s * grow);
            if (inHeart(lx, -ly + 0.15) && (side < 0 ? lx <= zig(ly) : lx > zig(ly))) hit++;
        }
        if (hit) { const col = colorAt(py); blend(c, px, py, col[0], col[1], col[2], hit / 9); }
    }
}
function brokenHeart(c, cx, cy, S) {
    const ang = 0.32, g = (t, b) => y => { const k = clamp01((y - (cy - S * 1.2)) / (S * 2.4)); return [t[0] + (b[0] - t[0]) * k, t[1] + (b[1] - t[1]) * k, t[2] + (b[2] - t[2]) * k]; };
    const d = S * 0.42;
    halfHeart(c, cx, cy, S, -1, -d, d * 0.35, -ang, () => [60, 25, 45], 1.1);
    halfHeart(c, cx, cy, S, +1, d, d * 0.55, ang, () => [60, 25, 45], 1.1);
    halfHeart(c, cx, cy, S, -1, -d, d * 0.35, -ang, g([235, 70, 100], [150, 25, 70]));
    halfHeart(c, cx, cy, S, +1, d, d * 0.55, ang, g([225, 60, 95], [135, 20, 65]));
}

/**
 * @param {Buffer} baseBuf صورة الأنمي (JPEG/PNG)
 * @param {Buffer|null} bufA بروفايل الأول  @param {Buffer|null} bufB بروفايل الثاني
 * @returns {Buffer|null} JPEG جاهز، أو null إن تعذّر فك صورة الأنمي
 */
function makeDivorceCard(baseBuf, bufA, bufB, seedA = 'a', seedB = 'b') {
    const base = decodeImage(baseBuf);
    if (!base) return null;
    const H = BAND + Math.round(W * base.height / base.width);

    // لون الشريط = متوسط أول صف من صورة الأنمي ليذوب الاتصال
    let sr = 0, sg = 0, sb = 0, n = 0;
    for (let x = 0; x < base.width; x += 4) { const i = x * 4; sr += base.data[i]; sg += base.data[i + 1]; sb += base.data[i + 2]; n++; }
    const bandRgb = [Math.round(sr / n), Math.round(sg / n), Math.round(sb / n)];

    const c = canvas(W, H, bandRgb);
    drawScaled(c, base, 0, BAND, W, H - BAND);
    for (let y = 0; y < 26; y++) for (let x = 0; x < W; x++) blend(c, x, BAND + y, bandRgb[0], bandRgb[1], bandRgb[2], 1 - y / 26); // دمج الحدّ

    const cy = Math.round(BAND / 2) + 6;
    avatar(c, 175, cy, AV_R, decodeImage(bufA), seedA);
    avatar(c, W - 175, cy, AV_R, decodeImage(bufB), seedB);
    brokenHeart(c, W / 2, cy, 46);

    return require('jpeg-js').encode({ data: Buffer.from(c.d.buffer), width: W, height: H }, 88).data;
}

module.exports = { makeDivorceCard };
