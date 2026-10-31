/**
 * 🖼️ البحث عن الصور بدون مفتاح.
 * المصادر بالترتيب (يجرّب التالي إذا فشل أو قلّت النتائج):
 *   1) Bing Images (قراءة صفحة النتائج، أصل الصورة بجودتها الكاملة)
 *   2) DuckDuckGo Images (JSON غير رسمي)
 *   3) Openverse (واجهة رسمية مفتوحة لصور مرخّصة، بدون مفتاح)
 * ملاحظة: المصدران الأولان غير رسميين وقد يتغيّر شكلهما، لذلك الاحتياطي موجود دائمًا.
 */
const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
const decodeHtml = s => String(s).replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

async function getText(url, headers = {}, timeout = 12000) {
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
        const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ar,en;q=0.8', ...headers }, signal: ctrl.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.text();
    } finally { clearTimeout(timer); }
}

/* ───── Bing ───── */
function parseBing(html) {
    const out = [], seen = new Set();
    const push = (url, thumb, title) => {
        if (!url || !/^https?:\/\//i.test(url) || seen.has(url)) return;
        seen.add(url); out.push({ url, thumb: thumb || null, w: 0, h: 0, title: title || '' });
    };
    const re = /\sm=(?:"|')(\{[^"']*?murl[^"']*?\})(?:"|')/g;
    let m;
    while ((m = re.exec(html))) {
        try { const j = JSON.parse(decodeHtml(m[1])); push(j.murl, j.turl, j.t); } catch (e) { /* عنصر تالف */ }
    }
    // احتياط: إن تغيّر شكل الصفحة نلتقط الروابط مباشرة من الحقل murl
    if (!out.length) {
        const re2 = /(?:&quot;|\\?")murl(?:&quot;|\\?")\s*:\s*(?:&quot;|\\?")(https?:[^"&\\]+?)(?:&quot;|\\?")/g;
        while ((m = re2.exec(html))) push(decodeHtml(m[1]), null, '');
    }
    // الأبعاد الحقيقية تُقرأ من الصورة نفسها بعد تنزيلها (ربطها بالترتيب من الصفحة غير موثوق)
    return out;
}
async function bing(q) {
    const url = `https://www.bing.com/images/search?q=${encodeURIComponent(q)}&form=HDRSC2&first=1&count=35&adlt=strict&qft=+filterui:imagesize-large`;
    const html = await getText(url, { Cookie: 'SRCHHPGUSR=ADLT=STRICT', Referer: 'https://www.bing.com/' });
    return parseBing(html);
}

/* ───── DuckDuckGo ───── */
function parseDdg(json) {
    return ((json && json.results) || []).filter(r => r && /^https?:\/\//i.test(r.image || ''))
        .map(r => ({ url: r.image, thumb: r.thumbnail || null, w: Number(r.width) || 0, h: Number(r.height) || 0, title: r.title || '' }));
}
async function ddg(q) {
    const page = await getText(`https://duckduckgo.com/?q=${encodeURIComponent(q)}&iax=images&ia=images&kp=1`);
    const vqd = (page.match(/vqd=["']?([\d-]+)["']?/) || [])[1];
    if (!vqd) throw new Error('no vqd');
    const txt = await getText(`https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(q)}&vqd=${vqd}&f=,,,,,&p=1`, { Referer: 'https://duckduckgo.com/' });
    return parseDdg(JSON.parse(txt));
}

/* ───── Openverse ───── */
function parseOpenverse(json) {
    return ((json && json.results) || []).filter(r => r && /^https?:\/\//i.test(r.url || ''))
        .map(r => ({ url: r.url, thumb: r.thumbnail || null, w: Number(r.width) || 0, h: Number(r.height) || 0, title: r.title || '' }));
}
async function openverse(q) {
    const txt = await getText(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=30&mature=false`);
    return parseOpenverse(JSON.parse(txt));
}

/** يرجع المرشّحين بترتيب الصلة من المصدر (Bing ثم DuckDuckGo ثم Openverse) بدون تكرار */
async function search(q) {
    const seen = new Set(); const all = [];
    for (const src of [bing, ddg, openverse]) {
        try {
            for (const r of await src(q)) { const k = r.url.split('?')[0]; if (!seen.has(k)) { seen.add(k); all.push(r); } }
        } catch (e) { /* ننتقل للمصدر التالي */ }
        if (all.length >= 15) break;
    }
    return all;
}

/* ───── تنزيل وفحص صورة ───── */
const kind = b => {
    if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
    if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
    if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'webp';
    return null;
};
async function download(url, maxBytes = 8 * 1024 * 1024, timeout = 14000) {
    const tryOnce = async referer => {
        const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), timeout);
        try {
            const headers = { 'User-Agent': UA, Accept: 'image/avif,image/webp,image/*,*/*;q=0.8' };
            if (referer) headers.Referer = referer;
            const res = await fetch(url, { headers, signal: ctrl.signal });
            if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.status = res.status; throw e; }
            const len = Number(res.headers.get('content-length') || 0);
            if (len > maxBytes) throw new Error('too big');
            const buf = Buffer.from(await res.arrayBuffer());
            if (buf.length > maxBytes || buf.length < 8 * 1024) throw new Error('bad size');
            const ext = kind(buf);
            if (!ext) throw new Error('not image');
            return { buf, ext };
        } finally { clearTimeout(timer); }
    };
    try { return await tryOnce(null); }
    catch (e) { if (e.status === 403 || e.status === 401) return tryOnce(new URL(url).origin + '/'); throw e; } // بعض المواقع تمنع الربط المباشر
}

/** أبعاد الصورة من رأسها (png/jpg/webp)، أو null إن تعذّر */
function dims(b, ext) {
    try {
        if (ext === 'png') return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
        if (ext === 'jpg') {
            let i = 2;
            while (i < b.length - 9) {
                if (b[i] !== 0xff) { i++; continue; }
                const m = b[i + 1];
                if (m === 0xff) { i++; continue; }
                if ((m >= 0xd0 && m <= 0xd9) || m === 0x01) { i += 2; continue; }
                if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
                i += 2 + b.readUInt16BE(i + 2);
            }
        }
        if (ext === 'webp') {
            const t = b.toString('ascii', 12, 16);
            if (t === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
            if (t === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
            if (t === 'VP8L') { const v = b.readUInt32LE(21); return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 }; }
        }
    } catch (e) { /* رأس تالف */ }
    return null;
}

/**
 * ينزّل حتى n صور سليمة بترتيب الصلة (4 طلبات متوازية).
 * الأفضلية: jpg/png بأبعاد كافية (ضلع أصغر ≥ minSide) ← ثم webp (قد لا يقبله ماسنجر دائمًا) ← ثم الصور الصغيرة كملاذ أخير.
 */
async function pickImages(cands, n, opts = {}) {
    const minSide = opts.minSide || 400, maxTries = opts.maxTries || 45;
    const good = [], webps = [], smalls = [];
    let i = 0, tries = 0;
    const worker = async () => {
        while (good.length < n && i < cands.length && tries < maxTries) {
            const idx = i++; tries++;
            try {
                const img = await download(cands[idx].url);
                const d = dims(img.buf, img.ext);
                const item = { ...img, idx, w: d ? d.w : 0, h: d ? d.h : 0, src: cands[idx] };
                if (d && Math.min(d.w, d.h) < minSide) smalls.push(item);
                else if (img.ext === 'webp') webps.push(item);
                else good.push(item);
            } catch (e) { /* نجرّب التالية */ }
        }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
    const byIdx = (a, b) => a.idx - b.idx;
    return [...good.sort(byIdx), ...webps.sort(byIdx), ...smalls.sort(byIdx)].slice(0, n);
}

module.exports = { search, pickImages, download, parseBing, parseDdg, parseOpenverse, kind, dims };
