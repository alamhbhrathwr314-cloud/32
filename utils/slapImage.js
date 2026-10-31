/**
 * 👋 صور أمر صفع:
 *  - makeSlapCard: يضع بروفايل الشخصين (دائرتين) فوق وجهَي الشخصيتين في صورة قالب من assets/slap
 *  - makeSlapFallback: صورة مرسومة بالكود إن لم يوجد قالب
 *  - makeGrid: صورة القالب مع شبكة أرقام (كل 10%) لمعرفة إحداثيات الوجوه
 * مواضع الدوائر نسب من حجم الصورة: x من العرض، y من الارتفاع، r (نصف القطر) من العرض.
 */
const { decodeImage, encodePng, drawAvatar, blend: blendFixed, clamp01, W: FW, H: FH } = require('./marryImage');

const MAX_W = 900;

/* ───────── أدوات الرسم على لوحة بأي حجم ───────── */
const canvasFrom = (img, w, h) => {
    const d = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const [r, g, b] = sample(img, ((x + 0.5) / w) * img.width - 0.5, ((y + 0.5) / h) * img.height - 0.5);
            const i = (y * w + x) * 4;
            d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
        }
    }
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

/** دائرة بروفايل بحلقة بيضاء رفيعة (إن لم تتوفر الصورة: خلفية ملونة وشخصية بيضاء) */
function circleAvatar(c, cx, cy, R, img, seed) {
    const RING = Math.max(2, Math.round(R * 0.07)), OUT = R + RING;
    for (let py = Math.floor(cy - OUT - 1); py <= cy + OUT + 1; py++) for (let px = Math.floor(cx - OUT - 1); px <= cx + OUT + 1; px++) {
        blend(c, px, py, 255, 255, 255, clamp01(OUT + 0.5 - Math.hypot(px + 0.5 - cx, py + 0.5 - cy)));
    }
    const base = seedColor(seed);
    let side = 0, ox = 0, oy = 0;
    if (img) { side = Math.min(img.width, img.height); ox = (img.width - side) / 2; oy = (img.height - side) / 2; }
    for (let py = Math.floor(cy - R - 1); py <= cy + R + 1; py++) for (let px = Math.floor(cx - R - 1); px <= cx + R + 1; px++) {
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
        blend(c, px, py, r, g, b, a);
    }
}

const toJpeg = c => require('jpeg-js').encode({ data: Buffer.from(c.d.buffer), width: c.w, height: c.h }, 88).data;

/** يقرأ قالب الصورة ويصغّره إن كان أعرض من MAX_W */
function loadBase(baseBuf) {
    const base = decodeImage(baseBuf);
    if (!base) return null;
    const w = Math.min(base.width, MAX_W);
    const h = Math.round(base.height * (w / base.width));
    return { base, w, h };
}

/* ───────── 1) بطاقة القالب ───────── */
/**
 * @param {Buffer} baseBuf صورة القالب (JPEG/PNG)
 * @param {{slapper:{x,y,r}, target:{x,y,r}}} layout مواضع الوجهين (نسب)
 * @returns {Buffer|null} JPEG
 */
function makeSlapCard(baseBuf, bufSlapper, bufTarget, layout, seedA = 'a', seedB = 'b') {
    const L = loadBase(baseBuf);
    if (!L) return null;
    const c = canvasFrom(L.base, L.w, L.h);
    const put = (pos, buf, seed) => circleAvatar(c, pos.x * L.w, pos.y * L.h, Math.max(8, pos.r * L.w), decodeImage(buf), seed);
    put(layout.target, bufTarget, seedB);   // المصفوع أولًا
    put(layout.slapper, bufSlapper, seedA);
    return toJpeg(c);
}

/* ───────── 2) شبكة المعايرة (أرقام 1–9 = أعشار العرض والارتفاع) ───────── */
const DIGITS = {
    0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001',
    5: '111100111001111', 6: '111100111101111', 7: '111001001001001', 8: '111101111101111', 9: '111101111001111'
};
function drawDigit(c, d, x, y, s) { // خلفية سوداء ثم رقم أبيض (3×5 بكسلات مكبّرة s مرة)
    for (let py = -s; py < 6 * s; py++) for (let px = -s; px < 4 * s; px++) blend(c, x + px, y + py, 0, 0, 0, 0.8);
    const g = DIGITS[d];
    for (let r = 0; r < 5; r++) for (let q = 0; q < 3; q++) if (g[r * 3 + q] === '1') {
        for (let py = 0; py < s; py++) for (let px = 0; px < s; px++) blend(c, x + q * s + px, y + r * s + py, 255, 255, 255, 1);
    }
}
function makeGrid(baseBuf) {
    const L = loadBase(baseBuf);
    if (!L) return null;
    const c = canvasFrom(L.base, L.w, L.h);
    const s = Math.max(2, Math.round(L.w / 220));
    for (let k = 1; k <= 9; k++) {
        const x = Math.round((L.w * k) / 10), y = Math.round((L.h * k) / 10);
        const col = k === 5 ? [255, 0, 80] : [255, 235, 0];
        for (let t = 0; t < L.h; t++) blend(c, x, t, col[0], col[1], col[2], 0.75);
        for (let t = 0; t < L.w; t++) blend(c, t, y, col[0], col[1], col[2], 0.75);
        drawDigit(c, k, x + 3, 3, s);       // أعلى كل خط عمودي
        drawDigit(c, k, 3, y + 3, s);       // يسار كل خط أفقي
    }
    return toJpeg(c);
}

/* ───────── 3) صورة بديلة مرسومة بالكود (900×500) ───────── */
function starburst(d, cx, cy, outer, inner, n, colorAt) {
    for (let py = Math.floor(cy - outer - 2); py <= cy + outer + 2; py++) for (let px = Math.floor(cx - outer - 2); px <= cx + outer + 2; px++) {
        let hit = 0;
        for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) {
            const dx = px + (sx + 0.5) / 2 - cx, dy = py + (sy + 0.5) / 2 - cy;
            const th = Math.atan2(dy, dx) + Math.PI, t = Math.abs(((th / (2 * Math.PI)) * n) % 1 - 0.5) * 2;
            if (Math.hypot(dx, dy) <= outer - (outer - inner) * t) hit++;
        }
        if (hit) { const col = colorAt(py); blendFixed(d, px, py, col[0], col[1], col[2], hit / 4); }
    }
}
function makeSlapFallback(bufSlapper, bufTarget, seedA = 'a', seedB = 'b') {
    const d = new Uint8ClampedArray(FW * FH * 4);
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
        const t = clamp01((y / FH) * 0.7 + (x / FW) * 0.3), i = (y * FW + x) * 4;
        d[i] = 255 + (200 - 255) * t; d[i + 1] = 214 + (60 - 214) * t; d[i + 2] = 90 + (50 - 90) * t; d[i + 3] = 255;
    }
    for (let k = 0; k < 14; k++) { // خطوط سرعة خلف الضارب
        const y = 90 + k * 24;
        for (let x = 40; x < 330; x++) blendFixed(d, x, y, 255, 255, 255, 0.18 * (1 - Math.abs(x - 185) / 150));
    }
    const CY = 255;
    drawAvatar(d, 190, CY, decodeImage(bufSlapper), seedA);
    drawAvatar(d, 710, CY, decodeImage(bufTarget), seedB);
    // احمرار خدّ المصفوع
    for (let py = CY - 150; py <= CY + 150; py++) for (let px = 560; px <= 700; px++) {
        const dist = Math.hypot(px - 710, py - CY);
        if (dist < 150) blendFixed(d, px, py, 230, 30, 40, 0.28 * clamp01((710 - px) / 140) * clamp01((150 - dist) / 20));
    }
    starburst(d, 450, CY, 120, 62, 14, () => [255, 255, 255]);
    starburst(d, 450, CY, 108, 54, 14, y => [255, Math.max(90, 200 - (y - CY + 108) * 0.5), 30]);
    starburst(d, 450, CY, 62, 30, 12, () => [235, 40, 50]);
    return encodePng(FW, FH, d);
}

module.exports = { makeSlapCard, makeSlapFallback, makeGrid };
