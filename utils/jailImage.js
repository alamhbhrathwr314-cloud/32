/**
 * 🚔 صورة السجن: بروفايل الشخص داخل زنزانة خلف قضبان حديدية، داخل إطار حجري على جدار طوب.
 * رسم بالكود (بدون مكتبات رسم)، الإخراج JPEG عبر jpeg-js.
 */
const { decodeImage } = require('./marryImage');

const S = 800;                                   // أبعاد الصورة (مربعة)
const FX = 120, FY = 50, FW = 560, FH = 560;     // نافذة الزنزانة (مكان صورة الشخص)
const BARS = 6, BAR_W = 20;
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

const rgbaCanvas = () => new Uint8ClampedArray(S * S * 4);
function put(d, x, y, r, g, b, a = 1) {
    if (x < 0 || y < 0 || x >= S || y >= S || a <= 0) return;
    const i = (y * S + x) * 4;
    d[i] += (r - d[i]) * a; d[i + 1] += (g - d[i + 1]) * a; d[i + 2] += (b - d[i + 2]) * a; d[i + 3] = 255;
}
function sample(img, u, v) {
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

/** جدار طوب داكن */
function wall(d) {
    const BH = 40, BW = 100;
    for (let y = 0; y < S; y++) {
        const row = Math.floor(y / BH), off = (row % 2) * (BW / 2);
        for (let x = 0; x < S; x++) {
            const col = Math.floor((x + off) / BW), lx = (x + off) % BW, ly = y % BH;
            const mortar = ly < 4 || lx < 4;
            let n = ((row * 73856093) ^ (col * 19349663)) >>> 0; n = (n % 40) - 20;      // اختلاف لون كل طوبة
            const grain = (((x * 7 + y * 13) % 11) - 5);
            const base = mortar ? 38 : 78 + n * 0.6 + grain * 0.8;
            const v = 1 - 0.55 * Math.pow(Math.hypot(x / S - 0.5, y / S - 0.5) * 1.5, 2);   // تعتيم الأطراف
            put(d, x, y, base * v * 1.02, base * v * 0.96, base * v * 0.94);
        }
    }
}

/** صورة الشخص داخل النافذة: أقل لونًا وأغمق، مع تعتيم الحواف */
function portrait(d, img, seed) {
    const base = seedColor(seed);
    let side = 0, ox = 0, oy = 0;
    if (img) { side = Math.min(img.width, img.height); ox = (img.width - side) / 2; oy = (img.height - side) / 2; }
    for (let py = 0; py < FH; py++) {
        for (let px = 0; px < FW; px++) {
            let r, g, b;
            if (img) {
                [r, g, b] = sample(img, (px + 0.5) / FW * side + ox, (py + 0.5) / FH * side + oy);
            } else {
                const nx = (px + 0.5) / FW * 2 - 1, ny = (py + 0.5) / FH * 2 - 1, shade = 1 - 0.2 * ((ny + 1) / 2);
                r = base[0] * shade; g = base[1] * shade; b = base[2] * shade;
                if (nx * nx + (ny + 0.2) ** 2 <= 0.12 || (nx / 0.62) ** 2 + ((ny - 0.78) / 0.5) ** 2 <= 1) { r = r * 0.12 + 224; g = g * 0.12 + 224; b = b * 0.12 + 224; }
            }
            const gr = r * 0.3 + g * 0.59 + b * 0.11, k = 0.7;                                   // تقليل الألوان
            const vig = 1 - 0.5 * Math.pow(Math.hypot((px / FW) - 0.5, (py / FH) - 0.5) * 1.5, 2); // تعتيم الأطراف
            const dark = 0.8 * vig;
            put(d, FX + px, FY + py, (r + (gr - r) * k) * dark, (g + (gr - g) * k) * dark, (b + (gr - b) * k) * dark);
        }
    }
}

/** إطار حجري مشطوف حول النافذة */
function frame(d) {
    const T = 26;
    for (let y = FY - T; y < FY + FH + T; y++) for (let x = FX - T; x < FX + FW + T; x++) {
        if (x >= FX && x < FX + FW && y >= FY && y < FY + FH) continue;
        const dx = Math.min(x - (FX - T), FX + FW + T - 1 - x), dy = Math.min(y - (FY - T), FY + FH + T - 1 - y), e = Math.min(dx, dy); // البعد عن الحافة الخارجية
        const top = (y < FY && dy <= dx) || (x < FX && dx < dy);                                   // الأعلى واليسار أفتح
        const bevel = e < 4 ? (top ? 1.45 : 0.55) : 1;
        const g = (92 + (((x * 5 + y * 3) % 9) - 4)) * bevel;
        put(d, x, y, g, g * 0.97, g * 0.94);
    }
    // ظل داخلي أسفل/يمين الإطار على الصورة
    for (let i = 0; i < 14; i++) {
        const a = 0.35 * (1 - i / 14);
        for (let x = FX; x < FX + FW; x++) put(d, x, FY + i, 0, 0, 0, a);
        for (let y = FY; y < FY + FH; y++) put(d, FX + i, y, 0, 0, 0, a);
    }
}

/** قضبان حديدية مع تظليل معدني وظل على الصورة */
function bars(d) {
    const gap = FW / (BARS + 1);
    const metal = t => {                 // t من 0 (يسار القضيب) إلى 1 (يمينه)
        const v = 38 + 150 * Math.exp(-Math.pow((t - 0.28) / 0.16, 2)) + 52 * (1 - t);
        return [v * 0.98, v, v * 1.06];
    };
    // ظل القضبان على الصورة (يمين كل قضيب)
    const cxs = Array.from({ length: BARS }, (_, i) => Math.round(FX + gap * (i + 1)));
    for (const cx of cxs) {
        for (let y = FY; y < FY + FH; y++) for (let i = 0; i < 26; i++) put(d, cx + BAR_W / 2 + i, y, 0, 0, 0, 0.42 * (1 - i / 26));
    }
    const hy = Math.round(FY + FH * 0.42);
    for (let x = FX; x < FX + FW; x++) for (let i = 0; i < 22; i++) put(d, x, hy + 11 + i, 0, 0, 0, 0.38 * (1 - i / 22));
    // قضيب أفقي
    for (let y = hy - 11; y < hy + 11; y++) {
        const t = (y - (hy - 11)) / 22, c = metal(1 - t * 0.9);
        for (let x = FX - 12; x < FX + FW + 12; x++) put(d, x, y, c[0], c[1], c[2]);
    }
    // قضبان عمودية تمتد داخل الإطار
    for (const cx of cxs) {
        for (let y = FY - 18; y < FY + FH + 18; y++) for (let k = 0; k < BAR_W; k++) {
            const c = metal(k / (BAR_W - 1));
            put(d, cx - BAR_W / 2 + k, y, c[0], c[1], c[2]);
        }
        // مسامير عند التقاطع
        for (let j = -7; j <= 7; j++) for (let i = -7; i <= 7; i++) {
            const r = Math.hypot(i, j); if (r > 7) continue;
            const v = 150 - r * 9 - (i + j) * 2; put(d, cx + i, hy + j, v, v, v * 1.05);
        }
    }
}

/** لوحة سفلية فيها كلمة JAIL بحروف بكسلية */
const GL = {
    J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
    A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
    L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####']
};
function plate(d) {
    const px = 9, gap = 2, text = 'JAIL';
    const tw = text.length * (5 * (px + gap)) + (text.length - 1) * px * 2 - gap;
    const w = tw + 100, h = 7 * (px + gap) + 36, x0 = Math.round((S - w) / 2), y0 = FY + FH + 26 + 22;
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
        const e = Math.min(x - x0, x0 + w - 1 - x, y - y0, y0 + h - 1 - y);
        const v = e < 4 ? (y - y0 < h / 2 ? 150 : 50) : 44 + (((x + y) % 7) - 3);
        put(d, x, y, v, v * 0.98, v * 0.95);
    }
    for (const [cx, cy] of [[x0 + 14, y0 + 14], [x0 + w - 15, y0 + 14], [x0 + 14, y0 + h - 15], [x0 + w - 15, y0 + h - 15]]) {
        for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) if (Math.hypot(i, j) <= 4) put(d, cx + i, cy + j, 130 - (i + j) * 6, 130 - (i + j) * 6, 135 - (i + j) * 6);
    }
    let x = x0 + 50;
    for (const ch of text) {
        for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) {
            if (GL[ch][r][c] !== '#') continue;
            const cx = x + c * (px + gap), cy = y0 + 18 + r * (px + gap);
            for (let j = 0; j < px; j++) for (let i = 0; i < px; i++) put(d, cx + i + 2, cy + j + 2, 0, 0, 0, 0.5);   // ظل
            for (let j = 0; j < px; j++) for (let i = 0; i < px; i++) put(d, cx + i, cy + j, 235, 70, 70);
        }
        x += 5 * (px + gap) + px * 2;
    }
}

/** @param {Buffer|null} avatarBuf صورة الشخص (قد تكون null)  @returns {Buffer} JPEG */
function makeJailImage(avatarBuf, seed = 'x') {
    const d = rgbaCanvas();
    wall(d);
    portrait(d, decodeImage(avatarBuf), seed);
    frame(d);
    bars(d);
    plate(d);
    return require('jpeg-js').encode({ data: Buffer.from(d.buffer), width: S, height: S }, 88).data;
}

module.exports = { makeJailImage };
