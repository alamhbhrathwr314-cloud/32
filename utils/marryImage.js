/**
 * ◈ ───『 رسم صورة الزواج 』─── ◈
 * صورتا الشخصين في دائرتين وبينهما قلب كبير على خلفية متدرجة.
 * بدون أي نصوص في الصورة (لا نحتاج خطوطًا)، والأسماء تذهب في رسالة الصورة.
 * مكتبات: jpeg-js و pngjs (جافاسكربت صرف) لفك صور البروفايل، والترميز بـ zlib المدمجة.
 */
const zlib = require('zlib');

const W = 900, H = 500;
const CY = 245, R = 150, RING = 10;
const CX_A = 225, CX_B = 675, CX_HEART = 450;

/* ───────── فك الصور ───────── */
function decodeImage(buf) {
    if (!buf || buf.length < 8) return null;
    try {
        if (buf[0] === 0xff && buf[1] === 0xd8) { // JPEG
            const img = require('jpeg-js').decode(buf, { useTArray: true, formatAsRGBA: true });
            return { width: img.width, height: img.height, data: img.data };
        }
        if (buf[0] === 0x89 && buf[1] === 0x50) { // PNG
            const img = require('pngjs').PNG.sync.read(buf);
            return { width: img.width, height: img.height, data: img.data };
        }
    } catch (e) { /* صورة تالفة: نستعمل صورة بديلة */ }
    return null;
}

/* ───────── ترميز PNG ───────── */
const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();
function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
}
function encodePng(w, h, rgba) {
    const stride = w * 4;
    const raw = Buffer.alloc((stride + 1) * h);
    for (let y = 0; y < h; y++) {
        raw[y * (stride + 1)] = 0; // بدون فلتر
        Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8; ihdr[9] = 6; // 8 بت، RGBA
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        pngChunk('IHDR', ihdr),
        pngChunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
        pngChunk('IEND', Buffer.alloc(0))
    ]);
}

/* ───────── أدوات الرسم ───────── */
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

function createCanvas() {
    const data = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const t = clamp01((y / H) * 0.75 + (x / W) * 0.25); // تدرج من الوردي إلى البنفسجي
            const i = (y * W + x) * 4;
            data[i] = 255 + (150 - 255) * t;
            data[i + 1] = 154 + (130 - 154) * t;
            data[i + 2] = 158 + (215 - 158) * t;
            data[i + 3] = 255;
        }
    }
    return data;
}

function blend(data, x, y, r, g, b, a) {
    if (a <= 0 || x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    data[i] += (r - data[i]) * a;
    data[i + 1] += (g - data[i + 1]) * a;
    data[i + 2] += (b - data[i + 2]) * a;
}

/** هل النقطة داخل القلب؟ (معادلة القلب الضمنية، y للأعلى) */
function inHeart(x, y) {
    const a = x * x + y * y - 1;
    return a * a * a - x * x * y * y * y <= 0;
}

function drawHeart(data, cx, cy, s, colorAt, alpha) {
    const x0 = Math.floor(cx - 1.35 * s), x1 = Math.ceil(cx + 1.35 * s);
    const y0 = Math.floor(cy - 1.35 * s), y1 = Math.ceil(cy + 1.35 * s);
    for (let py = y0; py <= y1; py++) {
        for (let px = x0; px <= x1; px++) {
            let hit = 0; // 9 عينات لتنعيم الحواف
            for (let sy = 0; sy < 3; sy++) {
                for (let sx = 0; sx < 3; sx++) {
                    const x = (px + (sx + 0.5) / 3 - cx) / s;
                    const y = -(py + (sy + 0.5) / 3 - cy) / s + 0.15;
                    if (inHeart(x, y)) hit++;
                }
            }
            if (hit) {
                const [r, g, b] = colorAt(py);
                blend(data, px, py, r, g, b, (hit / 9) * alpha);
            }
        }
    }
}

const solid = (r, g, b) => () => [r, g, b];

/* ───────── أخذ عينة من صورة (استيفاء ثنائي الخطي، قص مربع من المنتصف) ───────── */
function sampleBilinear(img, u, v) {
    const { width: w, height: h, data } = img;
    u = Math.min(Math.max(u, 0), w - 1);
    v = Math.min(Math.max(v, 0), h - 1);
    const x0 = Math.floor(u), y0 = Math.floor(v);
    const x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1);
    const fx = u - x0, fy = v - y0;
    const out = [0, 0, 0];
    const px = (x, y) => {
        const i = (y * w + x) * 4;
        const a = data[i + 3] / 255;
        return [data[i] * a + 255 * (1 - a), data[i + 1] * a + 255 * (1 - a), data[i + 2] * a + 255 * (1 - a)];
    };
    const c00 = px(x0, y0), c10 = px(x1, y0), c01 = px(x0, y1), c11 = px(x1, y1);
    for (let k = 0; k < 3; k++) {
        out[k] = (c00[k] * (1 - fx) + c10[k] * fx) * (1 - fy) + (c01[k] * (1 - fx) + c11[k] * fx) * fy;
    }
    return out;
}

function seedColor(seed) {
    let h = 0;
    for (const ch of String(seed)) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
    const hue = (h % 360) / 360, s = 0.55, l = 0.55;
    const f = n => {
        const k = (n + hue * 12) % 12;
        const a = s * Math.min(l, 1 - l);
        return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
    };
    return [f(0), f(8), f(4)];
}

/* ───────── رسم الأفاتار داخل دائرة بحلقة بيضاء وظل ───────── */
function drawAvatar(data, cx, cy, img, seed) {
    const OUT = R + RING;
    // الظل
    for (let py = cy - OUT - 24; py <= cy + OUT + 24; py++) {
        for (let px = cx - OUT - 24; px <= cx + OUT + 24; px++) {
            const d = Math.hypot(px - cx, py - cy - 9);
            blend(data, px, py, 60, 20, 80, 0.28 * clamp01((OUT + 14 - d) / 22));
        }
    }
    // الحلقة البيضاء
    for (let py = cy - OUT - 2; py <= cy + OUT + 2; py++) {
        for (let px = cx - OUT - 2; px <= cx + OUT + 2; px++) {
            const d = Math.hypot(px + 0.5 - cx, py + 0.5 - cy);
            blend(data, px, py, 255, 255, 255, clamp01(OUT + 0.5 - d));
        }
    }
    // الصورة نفسها
    const base = seedColor(seed);
    let side = 0, ox = 0, oy = 0;
    if (img) { side = Math.min(img.width, img.height); ox = (img.width - side) / 2; oy = (img.height - side) / 2; }
    for (let py = cy - R - 1; py <= cy + R + 1; py++) {
        for (let px = cx - R - 1; px <= cx + R + 1; px++) {
            const d = Math.hypot(px + 0.5 - cx, py + 0.5 - cy);
            const a = clamp01(R + 0.5 - d);
            if (a <= 0) continue;
            let r, g, b;
            if (img) { // 4 عينات لكل بكسل لتقليل التقطّع
                r = g = b = 0;
                for (const [dx, dy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
                    const u = ((px + dx - (cx - R)) / (2 * R)) * side + ox;
                    const v = ((py + dy - (cy - R)) / (2 * R)) * side + oy;
                    const c = sampleBilinear(img, u, v);
                    r += c[0] / 4; g += c[1] / 4; b += c[2] / 4;
                }
            } else { // صورة بديلة: خلفية ملونة وشخصية بيضاء
                const nx = (px + 0.5 - cx) / R, ny = (py + 0.5 - cy) / R;
                const shade = 1 - 0.18 * ((ny + 1) / 2);
                r = base[0] * shade; g = base[1] * shade; b = base[2] * shade;
                const head = nx * nx + (ny + 0.22) * (ny + 0.22) <= 0.09;
                const body = (nx / 0.62) ** 2 + ((ny - 0.72) / 0.5) ** 2 <= 1;
                if (head || body) { r = r * 0.12 + 255 * 0.88; g = g * 0.12 + 255 * 0.88; b = b * 0.12 + 255 * 0.88; }
            }
            blend(data, px, py, r, g, b, a);
        }
    }
}

/**
 * @param {Buffer|null} bufA صورة الشخص الأول (JPEG/PNG) أو null
 * @param {Buffer|null} bufB صورة الشخص الثاني أو null
 * @param {string} seedA أيدي الأول (للون الصورة البديلة)
 * @param {string} seedB أيدي الثاني
 * @returns {Buffer} صورة PNG
 */
function makeMarryImage(bufA, bufB, seedA = 'a', seedB = 'b') {
    const data = createCanvas();

    // قلوب صغيرة في الخلفية
    for (const [x, y, s, a] of [[90, 70, 20, 0.28], [810, 85, 26, 0.25], [450, 62, 15, 0.3], [150, 440, 24, 0.25],
        [770, 430, 20, 0.28], [455, 448, 28, 0.22], [330, 48, 12, 0.25], [600, 440, 14, 0.25], [45, 250, 14, 0.2], [860, 270, 15, 0.2]]) {
        drawHeart(data, x, y, s, solid(255, 255, 255), a);
    }

    drawAvatar(data, CX_A, CY, decodeImage(bufA), seedA);
    drawAvatar(data, CX_B, CY, decodeImage(bufB), seedB);

    // القلب الكبير في المنتصف: حدّ أبيض ثم تدرج أحمر ثم لمعة
    drawHeart(data, CX_HEART, CY, 84, solid(255, 255, 255), 1);
    drawHeart(data, CX_HEART, CY, 73, y => {
        const t = clamp01((y - (CY - 90)) / 180);
        return [255 + (201 - 255) * t, 77 + (24 - 77) * t, 109 + (74 - 109) * t];
    }, 1);
    drawHeart(data, CX_HEART - 26, CY - 30, 20, solid(255, 255, 255), 0.35);

    return encodePng(W, H, data);
}

module.exports = { makeMarryImage, decodeImage, encodePng, W, H, drawAvatar, drawHeart, blend, solid, clamp01, CY, R };
