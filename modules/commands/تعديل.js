/**
 * .تعديل <وصف>  — تعديل صورة بالذكاء الاصطناعي عبر PixelAPI
 *   ردّ على صورة (أو أرسلها مع الأمر) واكتب التعديل المطلوب، مثال:
 *   .تعديل خلّي الخلفية غروب الشمس
 *   الوصف يمكن أن يكون بالعربية: يترجمه البوت للإنجليزية (إن وُجد GROQ_API_KEY)، فالخدمة تفهم الإنجليزية أفضل.
 *
 * الإعداد (متغيرات البيئة في Railway، ولا تضع المفتاح داخل الكود):
 *   PIXELAPI_KEY         مفتاح PixelAPI                                [مطلوب]
 *   GROQ_API_KEY         لترجمة الوصف العربي (نفس مفتاح أمر ريمو)      [اختياري]
 *   EDIT_STRENGTH        قوة التعديل من 0 إلى 1 (افتراضي 0.75)
 *   EDIT_DAILY_PER_USER  عدد التعديلات اليومية لكل عضو عادي (افتراضي 3، المطور بلا حد)
 * كل تعديل ناجح يستهلك 28 رصيدًا من حسابك في PixelAPI.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const axios = require('axios');

module.exports.config = {
    name: 'تعديل', aliases: ['edit', 'عدل'],
    description: 'تعديل صورة بالذكاء الاصطناعي: ردّ على صورة واكتب ما تريد تغييره',
    usage: 'تعديل <وصف>  (ردًّا على صورة)', category: 'media', cooldown: 45, adminOnly: false
};

const BASE = process.env.PIXELAPI_BASE || 'https://api.pixelapi.dev';
const STRENGTH = Math.min(1, Math.max(0, Number(process.env.EDIT_STRENGTH) || 0.75));
const PER_USER = Number(process.env.EDIT_DAILY_PER_USER) || 3;
const MAX_SRC = 8 * 1024 * 1024;
const TIMEOUT_MS = 120000;

const key = () => process.env.PIXELAPI_KEY || '';
let busy = false;
const usage = new Map(); // userId ← { day, n }
const today = () => new Date().toISOString().slice(0, 10);
function takeQuota(uid) {
    const u = usage.get(uid);
    if (!u || u.day !== today()) { usage.set(uid, { day: today(), n: 1 }); return true; }
    if (u.n >= PER_USER) return false;
    u.n++; return true;
}
const refundQuota = uid => { const u = usage.get(uid); if (u && u.n > 0) u.n--; };

/* ─────────── الصور ─────────── */
function findPhoto(event) {
    for (const l of [event.messageReply && event.messageReply.attachments, event.attachments]) {
        const a = (l || []).find(x => x && ['photo', 'image'].includes(String(x.type)) && (x.url || x.largePreviewUrl || x.previewUrl));
        if (a) return a.url || a.largePreviewUrl || a.previewUrl;
    }
    return null;
}
function mimeOf(b) {
    if (b.length > 4 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'image/jpeg';
    if (b.length > 8 && b.readUInt32BE(0) === 0x89504E47) return 'image/png';
    if (b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
    return null;
}
const extOf = m => ({ 'image/png': 'png', 'image/webp': 'webp' })[m] || 'jpg';

/** يبحث في استجابة JSON عن الصورة الناتجة: رابط، أو data URI، أو base64 */
function findImage(node, depth = 0) {
    if (depth > 5 || node == null) return null;
    if (typeof node === 'string') {
        const s = node.trim();
        if (/^https?:\/\/\S+$/i.test(s)) return { url: s };
        if (/^data:image\/[a-z+]+;base64,/i.test(s)) return { b64: s.replace(/^data:[^,]+,/, '') };
        if (s.length > 2000 && /^[A-Za-z0-9+/=\s]+$/.test(s)) return { b64: s };
        return null;
    }
    if (typeof node !== 'object') return null;
    const keys = Object.keys(node).sort((a, b) => {
        const score = k => (/out|result|edit|image|url/i.test(k) ? 0 : 1);
        return score(a) - score(b);
    });
    for (const k of keys) { const r = findImage(node[k], depth + 1); if (r) return r; }
    return null;
}

/* ─────────── الترجمة (اختيارية) ─────────── */
async function toEnglish(text) {
    if (!/[\u0600-\u06FF]/.test(text) || !process.env.GROQ_API_KEY) return text;
    try {
        const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: 'llama-3.1-8b-instant', temperature: 0, max_tokens: 150,
            messages: [
                { role: 'system', content: 'Translate the user\'s image-editing instruction from Arabic (any dialect) to short, clear English. Output only the translation.' },
                { role: 'user', content: text }
            ]
        }, { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }, timeout: 20000 });
        const out = String(res.data.choices[0].message.content || '').trim().replace(/^["'«»]+|["'«»]+$/g, '');
        return out && out.length < 500 ? out : text;
    } catch (e) { return text; }
}

/* ─────────── الاتصال بـ PixelAPI ─────────── */
async function pixelEdit(imageDataUri, instruction) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(`${BASE}/v1/image/edit`, {
            method: 'POST', signal: ctrl.signal,
            headers: { Authorization: `Bearer ${key()}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_url: imageDataUri, instruction, strength: STRENGTH })
        });
        let json = null;
        try { json = await res.json(); } catch (e) { /* ليست JSON */ }
        if (!res.ok) {
            const d = json && (json.detail || json.error || json.message);
            const err = new Error(typeof d === 'string' ? d : JSON.stringify(d || ''));
            err.status = res.status;
            throw err;
        }
        return json;
    } finally { clearTimeout(timer); }
}

const friendly = e => {
    const m = String(e && e.message || '').toLowerCase();
    if (e && (e.status === 401 || e.status === 403) || /invalid api key|unauthorized|forbidden/.test(m)) return 'مفتاح PixelAPI غير صالح';
    if (e && e.status === 402 || /credit|balance|payment/.test(m)) return 'انتهى رصيد PixelAPI، اشحن الحساب من لوحة التحكم';
    if (e && e.status === 429 || /rate limit|too many/.test(m)) return 'طلبات كثيرة، حاول بعد قليل';
    if (e && e.status === 422 || e && e.status === 400) return 'رفضت الخدمة الطلب (الصورة أو الوصف غير مناسب)';
    if (e && e.name === 'AbortError') return 'استغرق التعديل وقتًا طويلًا، حاول مرة ثانية';
    if (/nsfw|safety|blocked|flagged/.test(m)) return 'رُفض الوصف لأسباب تتعلق بالمحتوى، جرّب وصفًا آخر';
    return 'تعذّر تنفيذ التعديل الآن، حاول لاحقًا';
};

/* ─────────── الأمر ─────────── */
module.exports.run = async ({ api, event, args, helpers, deco, cfg }) => {
    const reply = t => helpers.reply(api, event, t);
    const p = cfg.getPrefix();
    const uid = String(event.senderID);
    const isAdmin = cfg.isAdmin(uid);

    if (!key()) {
        return reply(isAdmin
            ? deco.warning('الأمر غير مفعّل: أضف متغير PIXELAPI_KEY (مفتاح PixelAPI) في Railway ثم أعد التشغيل')
            : deco.warning('هذا الأمر غير مفعّل بعد'));
    }
    const prompt = args.join(' ').trim();
    const url = findPhoto(event);
    if (!prompt || !url) {
        return reply(deco.infoBox('تعديل الصور بالذكاء الاصطناعي', [
            `✏️ ردّ على صورة بـ ${p}تعديل <ما تريد تغييره>`,
            `مثال: ${p}تعديل خلّي الخلفية غروب الشمس`,
            `مثال: ${p}تعديل غيّر لون القميص للأزرق`
        ].join('\n')));
    }
    if (busy) return reply(deco.warning('البوت مشغول بتعديل آخر، حاول بعد قليل'));
    if (!isAdmin && !takeQuota(uid)) return reply(deco.warning(`وصلت حدّك اليومي (${PER_USER} تعديلات). جرّب غدًا`));

    busy = true;
    let ok = false, wait = null, file = null;
    try {
        wait = await reply(deco.infoBox('⏳ جاري التعديل', 'قد يستغرق نصف دقيقة...'));

        let src;
        try { src = Buffer.from((await axios.get(url, { responseType: 'arraybuffer', timeout: 20000, maxContentLength: MAX_SRC })).data); }
        catch (e) { return reply(deco.errorBox('تعذّر تنزيل الصورة، أعد إرسالها')); }
        const mime = mimeOf(src);
        if (!mime) return reply(deco.errorBox('صيغة الصورة غير مدعومة، أرسلها بصيغة JPG أو PNG'));

        const instruction = await toEnglish(prompt);
        const json = await pixelEdit(`data:${mime};base64,${src.toString('base64')}`, instruction);

        const found = findImage(json);
        if (!found) {
            console.error('[تعديل] استجابة PixelAPI بلا صورة:', JSON.stringify(json).slice(0, 400));
            throw new Error('empty result');
        }
        const out = found.url
            ? Buffer.from((await axios.get(found.url, { responseType: 'arraybuffer', timeout: 30000, maxContentLength: 25 * 1024 * 1024 })).data)
            : Buffer.from(found.b64.replace(/\s/g, ''), 'base64');
        file = path.join(os.tmpdir(), `kira-edit-${Date.now()}-${Math.floor(Math.random() * 1e6)}.${extOf(mimeOf(out) || 'image/jpeg')}`);
        fs.writeFileSync(file, out);

        const sent = await new Promise(resolve => {
            const stream = fs.createReadStream(file);
            stream.on('error', () => {});
            try { api.sendMessage({ body: `✏️ تم التعديل: ${prompt.slice(0, 120)}`, attachment: stream }, event.threadID, e => resolve(!e), event.messageID); }
            catch (e) { resolve(false); }
        });
        if (!sent) return reply(deco.errorBox('تم التعديل لكن تعذّر إرسال الصورة'));
        ok = true;
        if (wait && wait.messageID && typeof api.unsendMessage === 'function') api.unsendMessage(String(wait.messageID), () => {});
    } catch (e) {
        await reply(deco.errorBox(friendly(e)));
    } finally {
        busy = false;
        if (!ok && !isAdmin) refundQuota(uid);
        if (file) fs.unlink(file, () => {});
    }
};
