/**
 * 🖼️ جلب صور الحسابات بأعلى جودة ممكنة لبطاقات الأوامر (سجن، مستوى، زواج، طلاق، صفع)
 *
 * المشكلة: صورة getUserInfo (thumbSrc) مصغّرة جدًا (عشرات البكسلات)، وتكبيرها بالاستيفاء الخطي يعطي صورة ضبابية.
 * الحل في خطوتين:
 *   1) محاولة جلب نسخة كبيرة من Graph API (تعمل مع AVATAR_TOKEN، وقد تعمل بدونه أحيانًا)،
 *      وإلا نستعمل thumbSrc كما كان.
 *   2) تحسين أي صورة: قصّ مربع من الوسط ← تكبير/تصغير إلى 512px بالاستيفاء المكعّب (Catmull-Rom)
 *      ← شحذ خفيف (Unsharp Mask). النتيجة تُرجَع PNG فتعمل مع كل الدوال الحالية دون تعديلها.
 *
 * متغيرات البيئة (اختيارية):
 *   AVATAR_TOKEN   توكن لطلب الصورة الكبيرة من graph.facebook.com
 *   AVATAR_SIZE    حجم الصورة الناتجة بالبكسل (افتراضي 512)
 *   AVATAR_DEBUG   1 لطباعة المصدر والدقة المستعملة في السجل
 */
const TTL = 10 * 60 * 1000;
const cache = new Map(); // uid ← { buf, at }

const size = () => Math.max(128, Math.min(1024, Number(process.env.AVATAR_SIZE) || 512));
const debug = (...a) => { if (process.env.AVATAR_DEBUG === '1') console.log('[avatar]', ...a); };

/* ═══════════ معالجة الصورة ═══════════ */
const cr = t => [ // أوزان Catmull-Rom لأربع نقاط
    ((-0.5 * t + 1) * t - 0.5) * t,
    (1.5 * t - 2.5) * t * t + 1,
    ((-1.5 * t + 2) * t + 0.5) * t,
    (0.5 * t - 0.5) * t * t
];

/** قصّ مربع من الوسط + دمج الشفافية فوق الأبيض ← Float32 بثلاث قنوات */
function squareRGB(img) {
    const side = Math.min(img.width, img.height);
    const ox = Math.floor((img.width - side) / 2), oy = Math.floor((img.height - side) / 2);
    const out = new Float32Array(side * side * 3);
    for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
        const i = ((y + oy) * img.width + (x + ox)) * 4, j = (y * side + x) * 3, a = img.data[i + 3] / 255;
        out[j] = img.data[i] * a + 255 * (1 - a);
        out[j + 1] = img.data[i + 1] * a + 255 * (1 - a);
        out[j + 2] = img.data[i + 2] * a + 255 * (1 - a);
    }
    return { side, rgb: out };
}

/** تصغير بمتوسط المساحة (يمنع التعرّج عند التصغير الكبير) */
function boxResize(src, side, to) {
    const out = new Float32Array(to * to * 3), k = side / to;
    for (let y = 0; y < to; y++) {
        const y0 = Math.floor(y * k), y1 = Math.max(y0 + 1, Math.min(side, Math.ceil((y + 1) * k)));
        for (let x = 0; x < to; x++) {
            const x0 = Math.floor(x * k), x1 = Math.max(x0 + 1, Math.min(side, Math.ceil((x + 1) * k)));
            let r = 0, g = 0, b = 0, n = 0;
            for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
                const i = (yy * side + xx) * 3; r += src[i]; g += src[i + 1]; b += src[i + 2]; n++;
            }
            const j = (y * to + x) * 3; out[j] = r / n; out[j + 1] = g / n; out[j + 2] = b / n;
        }
    }
    return out;
}

/** تكبير/تصغير خفيف بالاستيفاء المكعّب */
function cubicResize(src, side, to) {
    const out = new Float32Array(to * to * 3), k = side / to;
    const xs = new Array(to);
    for (let x = 0; x < to; x++) {                       // نحسب أوزان الأعمدة مرة واحدة
        const sx = (x + 0.5) * k - 0.5, x0 = Math.floor(sx);
        xs[x] = { idx: [-1, 0, 1, 2].map(d => Math.min(side - 1, Math.max(0, x0 + d))), w: cr(sx - x0) };
    }
    for (let y = 0; y < to; y++) {
        const sy = (y + 0.5) * k - 0.5, y0 = Math.floor(sy), wy = cr(sy - y0);
        const rows = [-1, 0, 1, 2].map(d => Math.min(side - 1, Math.max(0, y0 + d)));
        for (let x = 0; x < to; x++) {
            const { idx, w } = xs[x];
            let r = 0, g = 0, b = 0;
            for (let m = 0; m < 4; m++) for (let n = 0; n < 4; n++) {
                const wt = wy[m] * w[n], i = (rows[m] * side + idx[n]) * 3;
                r += src[i] * wt; g += src[i + 1] * wt; b += src[i + 2] * wt;
            }
            const j = (y * to + x) * 3; out[j] = r; out[j + 1] = g; out[j + 2] = b;
        }
    }
    return out;
}

/** شحذ Unsharp Mask: تمويه غاوسي منفصل ثم نضيف الفرق */
function sharpen(rgb, side, sigma, amount) {
    const rad = Math.max(1, Math.ceil(sigma * 2)), ker = [];
    let sum = 0;
    for (let i = -rad; i <= rad; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); ker.push(v); sum += v; }
    for (let i = 0; i < ker.length; i++) ker[i] /= sum;
    const tmp = new Float32Array(rgb.length), blur = new Float32Array(rgb.length);
    for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) for (let c = 0; c < 3; c++) {
        let v = 0;
        for (let t = -rad; t <= rad; t++) v += rgb[(y * side + Math.min(side - 1, Math.max(0, x + t))) * 3 + c] * ker[t + rad];
        tmp[(y * side + x) * 3 + c] = v;
    }
    for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) for (let c = 0; c < 3; c++) {
        let v = 0;
        for (let t = -rad; t <= rad; t++) v += tmp[(Math.min(side - 1, Math.max(0, y + t)) * side + x) * 3 + c] * ker[t + rad];
        blur[(y * side + x) * 3 + c] = v;
    }
    const out = new Uint8ClampedArray(side * side * 4);
    for (let p = 0, q = 0; p < side * side; p++, q += 4) {
        for (let c = 0; c < 3; c++) out[q + c] = rgb[p * 3 + c] + (rgb[p * 3 + c] - blur[p * 3 + c]) * amount;
        out[q + 3] = 255;
    }
    return out;
}

/** img: { width, height, data(RGBA) } ← { width, height, data } مربعة بحجم الهدف */
function enhance(img, to) {
    to = to || size();
    const { side, rgb } = squareRGB(img);
    const factor = to / side;
    let work;
    if (side > to * 1.5) work = boxResize(rgb, side, to);          // مصدر كبير: نصغّر بمتوسط المساحة
    else work = cubicResize(rgb, side, to);                         // مصدر صغير أو قريب: استيفاء مكعّب
    // الشحذ أقوى قليلًا مع التكبير الكبير لاستعادة الحواف، ويخفّ إن كان المصدر كبيرًا أصلًا
    const [sigma, amount] = factor >= 3 ? [2.0, 0.9] : factor >= 1.5 ? [1.4, 0.6] : [0.8, 0.3];
    return { width: to, height: to, data: sharpen(work, to, sigma, amount), srcSide: side };
}

/* ═══════════ الجلب ═══════════ */
let axios = null;
try { axios = require('axios'); } catch (e) { /* تجاهل */ }

async function getBuf(url, timeout) {
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: timeout || 8000, maxContentLength: 8 * 1024 * 1024 });
    return Buffer.from(res.data);
}

/** نسخة كبيرة من Graph (redirect=false يعطي JSON فيه is_silhouette فلا نقبل الصورة الافتراضية الرمادية) */
async function fetchGraph(uid) {
    if (!axios || !/^\d{5,}$/.test(String(uid))) return null;
    const t = process.env.AVATAR_TOKEN ? `&access_token=${encodeURIComponent(process.env.AVATAR_TOKEN)}` : '';
    const s = size();
    try {
        const res = await axios.get(`https://graph.facebook.com/${uid}/picture?width=${s}&height=${s}&redirect=false${t}`, { timeout: 6000, validateStatus: () => true });
        const d = res.data && res.data.data;
        if (res.status !== 200 || !d || !d.url || d.is_silhouette) return null;
        return await getBuf(d.url);
    } catch (e) { return null; }
}

/**
 * @param {string|null} thumbUrl رابط thumbSrc من getUserInfo (احتياطي)
 * @param {string} [uid]         آيدي الحساب لمحاولة جلب نسخة أكبر
 * @returns {Promise<Buffer|null>} PNG مربع محسّن، أو null إن تعذّر كل شيء
 */
async function fetchAvatar(thumbUrl, uid) {
    if (!axios) return null;
    const key = uid ? String(uid) : '';
    const hit = key && cache.get(key);
    if (hit && Date.now() - hit.at < TTL) return hit.buf;

    let raw = null, source = 'thumb';
    if (key) { raw = await fetchGraph(key); if (raw) source = 'graph'; }
    if (!raw && thumbUrl) { try { raw = await getBuf(thumbUrl); } catch (e) { raw = null; } }
    if (!raw) return null;

    let out = raw;
    try {
        const { decodeImage, encodePng } = require('./marryImage');
        const img = decodeImage(raw);
        if (img) {
            const e = enhance(img);
            out = encodePng(e.width, e.height, e.data);
            debug(key || '-', `src=${source}`, `${img.width}x${img.height} → ${e.width}x${e.height}`, img.width < 200 ? '(المصدر صغير: الجودة محدودة)' : '');
        }
    } catch (e) { out = raw; }              // أي خطأ: نرجع الصورة الأصلية كما كانت
    if (key) {
        for (const [k, v] of cache) if (Date.now() - v.at > TTL) cache.delete(k);
        while (cache.size >= 100) cache.delete(cache.keys().next().value);
        cache.set(key, { buf: out, at: Date.now() });
    }
    return out;
}

module.exports = { fetchAvatar, enhance };
