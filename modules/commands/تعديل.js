/**
 * .تعديل <وصف>  — تعديل صورة بالذكاء الاصطناعي عبر Google Gemini (مجاني ضمن حدود) أو OpenAI (GPT Image)
 *   ردّ على صورة (أو أرسلها مع الأمر) واكتب التعديل المطلوب بالعربية أو الإنجليزية، مثال:
 *   .تعديل خلّي الخلفية غروب الشمس
 *
 * الإعداد (متغيرات البيئة في Render/Railway، ولا تضع المفتاح داخل الكود):
 *   GEMINI_API_KEY        مفتاح Google AI Studio (aistudio.google.com)    [يُفضَّل: له حدّ مجاني]
 *   EDIT_GEMINI_MODEL     نموذج Gemini (افتراضي gemini-2.5-flash-image)
 *   OPENAI_API_KEY        مفتاح OpenAI (بديل مدفوع، يُستعمل إن لم يوجد مفتاح Gemini)
 *   EDIT_PROVIDER         gemini | openai لإجبار مزوّد معيّن (افتراضي: Gemini إن وُجد مفتاحه)
 *   EDIT_MODEL            نموذج OpenAI (افتراضي gpt-image-1.5)
 *   EDIT_QUALITY          low | medium | high لـ OpenAI فقط (افتراضي low)
 *   EDIT_DAILY_PER_USER   عدد التعديلات اليومية لكل عضو عادي (افتراضي 3، المطور بلا حد)
 *   EDIT_DAILY_TOTAL      سقف التعديلات اليومية للبوت كله (افتراضي 30) لحماية رصيدك
 * Gemini: حدّ مجاني يومي يتغيّر من Google، وقد تستعمل Google الصور المرسلة لتحسين نماذجها في الخطة المجانية.
 * OpenAI مدفوع: كل تعديل يُخصم من رصيد الحساب.
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

const BASE = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
const MODEL = process.env.EDIT_MODEL || 'gpt-image-1.5';
const QUALITY = ['low', 'medium', 'high'].includes(process.env.EDIT_QUALITY) ? process.env.EDIT_QUALITY : 'low';
const PER_USER = Number(process.env.EDIT_DAILY_PER_USER) || 3;
const TOTAL = Number(process.env.EDIT_DAILY_TOTAL) || 30;
const MAX_SRC = 20 * 1024 * 1024;
const TIMEOUT_MS = 180000;

const GEMINI_MODEL = process.env.EDIT_GEMINI_MODEL || 'gemini-2.5-flash-image';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const MAX_GEMINI_SRC = 14 * 1024 * 1024; // الصورة تُرسل base64 داخل الطلب (حدّه نحو 20MB)
const geminiKey = () => process.env.GEMINI_API_KEY || '';
const openaiKey = () => process.env.OPENAI_API_KEY || '';
/** المزوّد المستعمل: gemini أو openai أو '' إن لا يوجد مفتاح */
function provider() {
    const want = String(process.env.EDIT_PROVIDER || '').toLowerCase();
    if (want === 'openai') return openaiKey() ? 'openai' : '';
    if (want === 'gemini') return geminiKey() ? 'gemini' : '';
    return geminiKey() ? 'gemini' : openaiKey() ? 'openai' : '';
}
const key = () => openaiKey();
let busy = false;
const usage = new Map();          // userId ← { day, n }
const total = { day: '', n: 0 };  // العدّاد العام
const today = () => new Date().toISOString().slice(0, 10);

function takeQuota(uid, isAdmin) {
    if (total.day !== today()) { total.day = today(); total.n = 0; }
    if (total.n >= TOTAL) return 'total';
    if (!isAdmin) {
        const u = usage.get(uid);
        if (!u || u.day !== today()) usage.set(uid, { day: today(), n: 1 });
        else if (u.n >= PER_USER) return 'user';
        else u.n++;
    }
    total.n++;
    return null;
}
function refundQuota(uid, isAdmin) {
    if (total.n > 0) total.n--;
    if (!isAdmin) { const u = usage.get(uid); if (u && u.n > 0) u.n--; }
}

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

/** أبعاد الصورة من رأس الملف (JPEG/PNG) بلا فك ضغط */
function dimsOf(b, mime) {
    try {
        if (mime === 'image/png') return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
        if (mime === 'image/jpeg') {
            let i = 2;
            while (i + 9 < b.length) {
                if (b[i] !== 0xFF) { i++; continue; }
                const m = b[i + 1];
                if (m >= 0xC0 && m <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(m)) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
                i += 2 + b.readUInt16BE(i + 2);
            }
        }
    } catch (e) { /* نستعمل الافتراضي */ }
    return null;
}
/** المقاسات المدعومة: 1024x1024 أو 1536x1024 (أفقي) أو 1024x1536 (عمودي) */
function sizeFor(d) {
    if (!d || !d.w || !d.h) return '1024x1024';
    const r = d.w / d.h;
    return r > 1.15 ? '1536x1024' : r < 0.87 ? '1024x1536' : '1024x1024';
}

/* ─────────── الاتصال بـ OpenAI ─────────── */
async function openaiEdit(src, mime, prompt, size) {
    const form = new FormData();
    form.append('model', MODEL);
    form.append('prompt', `${prompt}\n\nKeep every other detail of the original image unchanged.`);
    form.append('size', size);
    form.append('quality', QUALITY);
    form.append('output_format', 'jpeg');
    form.append('n', '1');
    form.append('image', new Blob([src], { type: mime }), `photo.${extOf(mime)}`);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(`${BASE}/images/edits`, { method: 'POST', body: form, signal: ctrl.signal, headers: { Authorization: `Bearer ${openaiKey()}` } });
        let json = null;
        try { json = await res.json(); } catch (e) { /* ليست JSON */ }
        if (!res.ok || !json) {
            const er = json && json.error || {};
            const err = new Error(er.message || `HTTP ${res.status}`);
            err.status = res.status; err.code = er.code || '';
            throw err;
        }
        return json;
    } finally { clearTimeout(timer); }
}

/* ─────────── الاتصال بـ Gemini ─────────── */
async function geminiEdit(src, mime, prompt) {
    if (src.length > MAX_GEMINI_SRC) { const e = new Error('too large'); e.code = 'too_large'; throw e; }
    const body = {
        contents: [{ parts: [
            { text: `${prompt}\n\nEdit the provided image as requested and keep every other detail of the original image unchanged.` },
            { inline_data: { mime_type: mime, data: src.toString('base64') } }
        ] }]
    };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(`${GEMINI_BASE}/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`, {
            method: 'POST', signal: ctrl.signal, body: JSON.stringify(body),
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey() }
        });
        let json = null;
        try { json = await res.json(); } catch (e) { /* ليست JSON */ }
        if (!res.ok || !json) {
            const er = json && json.error || {};
            const err = new Error(er.message || `HTTP ${res.status}`);
            err.status = res.status; err.code = er.status || '';
            throw err;
        }
        const block = json.promptFeedback && json.promptFeedback.blockReason;
        if (block) { const e = new Error('blocked: ' + block); e.code = 'safety'; throw e; }
        const cand = Array.isArray(json.candidates) && json.candidates[0];
        const parts = cand && cand.content && Array.isArray(cand.content.parts) ? cand.content.parts : [];
        const img = parts.map(x => x.inlineData || x.inline_data).find(x => x && x.data);
        if (!img) {
            const fr = String(cand && cand.finishReason || '');
            if (/SAFETY|PROHIBITED|BLOCK|RECITATION/i.test(fr)) { const e = new Error('blocked: ' + fr); e.code = 'safety'; throw e; }
            const txt = parts.map(x => x.text).filter(Boolean).join(' ').slice(0, 200);
            console.error('[تعديل] Gemini أرجع بلا صورة:', fr, txt);
            const e = new Error('no image'); e.code = 'no_image'; throw e;
        }
        return Buffer.from(img.data, 'base64');
    } finally { clearTimeout(timer); }
}

const friendly = (e, prov) => {
    if (prov === 'gemini') return friendlyGemini(e);
    const m = String(e && e.message || '').toLowerCase(), code = String(e && e.code || '').toLowerCase();
    if (code === 'moderation_blocked' || /safety system|moderation/.test(m)) return 'رفضت OpenAI الطلب لأسباب تتعلق بالمحتوى، جرّب صورة أو وصفًا آخر';
    if (code === 'insufficient_quota' || /exceeded your current quota|billing|insufficient/.test(m)) return 'رصيد OpenAI انتهى، اشحن الحساب من لوحة Billing';
    if (/must be verified/.test(m)) return 'حساب OpenAI يحتاج توثيق المنظمة (Verify Organization) لاستعمال هذا النموذج، أو غيّر EDIT_MODEL';
    if (e && e.status === 401 || code === 'invalid_api_key') return 'مفتاح OpenAI غير صالح';
    if (e && e.status === 429) return 'طلبات كثيرة على OpenAI، حاول بعد قليل';
    if (e && e.status === 404 || /model/.test(m) && /not exist|not found|does not/.test(m)) return 'النموذج غير متاح لحسابك، غيّر EDIT_MODEL';
    if (e && e.status === 400) return 'رفضت OpenAI الطلب (الصورة أو الوصف غير مناسب)';
    if (e && e.name === 'AbortError') return 'استغرق التعديل وقتًا طويلًا، حاول مرة ثانية';
    return 'تعذّر تنفيذ التعديل الآن، حاول لاحقًا';
};


function friendlyGemini(e) {
    const m = String(e && e.message || '').toLowerCase(), code = String(e && e.code || '').toLowerCase();
    if (code === 'too_large') return 'الصورة كبيرة جدًا، أرسل نسخة أصغر';
    if (code === 'safety') return 'رفضت Gemini الطلب لأسباب تتعلق بالمحتوى، جرّب صورة أو وصفًا آخر';
    if (code === 'no_image') return 'لم ينتج Gemini صورة لهذا الطلب، جرّب وصفًا أوضح';
    if (/api key not valid|api_key_invalid/.test(m)) return 'مفتاح Gemini غير صالح';
    if (e && e.status === 429 || code === 'resource_exhausted') return 'انتهى الحدّ المجاني لـ Gemini أو الطلبات كثيرة، حاول بعد قليل أو غدًا';
    if (e && e.status === 403 || code === 'permission_denied') return 'مفتاح Gemini لا يملك صلاحية لهذا النموذج أو المنطقة غير مدعومة';
    if (e && e.status === 404 || code === 'not_found') return 'نموذج Gemini غير متاح، غيّر EDIT_GEMINI_MODEL';
    if (e && e.status === 400) return 'رفضت Gemini الطلب (الصورة أو الوصف غير مناسب)';
    if (e && e.name === 'AbortError') return 'استغرق التعديل وقتًا طويلًا، حاول مرة ثانية';
    return 'تعذّر تنفيذ التعديل الآن، حاول لاحقًا';
}


/** .تعديل نماذج  ← (للمطور) يعرض نماذج Gemini المتاحة لمفتاحك والتي تدعم توليد الصور */
async function listModels(reply, deco) {
    try {
        const res = await fetch(`${GEMINI_BASE}/models?pageSize=200`, { headers: { 'x-goog-api-key': geminiKey() } });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json) return reply(deco.errorBox('تعذّر جلب النماذج: ' + (json && json.error && json.error.message || res.status)));
        const names = (json.models || [])
            .filter(m => /image/i.test(m.name) && (m.supportedGenerationMethods || []).includes('generateContent'))
            .map(m => String(m.name).replace(/^models\//, ''));
        return reply(deco.infoBox('نماذج الصور المتاحة', names.length ? names.join('\n') + `\n\nالحالي: ${GEMINI_MODEL}\nلتغييره: EDIT_GEMINI_MODEL` : 'لا توجد نماذج صور ظاهرة لهذا المفتاح'));
    } catch (e) { return reply(deco.errorBox('تعذّر جلب النماذج')); }
}

/* ─────────── الأمر ─────────── */
module.exports.run = async ({ api, event, args, helpers, deco, cfg }) => {
    const reply = t => helpers.reply(api, event, t);
    const p = cfg.getPrefix();
    const uid = String(event.senderID);
    const isAdmin = cfg.isAdmin(uid);

    const prov = provider();
    if (!prov) {
        return reply(isAdmin
            ? deco.warning('الأمر غير مفعّل: أضف متغير GEMINI_API_KEY (مفتاح Google AI Studio) أو OPENAI_API_KEY في الاستضافة ثم أعد التشغيل')
            : deco.warning('هذا الأمر غير مفعّل بعد'));
    }
    if (isAdmin && prov === 'gemini' && args[0] === 'نماذج') return listModels(reply, deco);
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
    const denied = takeQuota(uid, isAdmin);
    if (denied === 'user') return reply(deco.warning(`وصلت حدّك اليومي (${PER_USER} تعديلات). جرّب غدًا`));
    if (denied === 'total') return reply(deco.warning('وصل البوت إلى حدّه اليومي من التعديلات. جرّب غدًا'));

    busy = true;
    let ok = false, wait = null, file = null;
    try {
        wait = await reply(deco.infoBox('⏳ جاري التعديل', 'قد يستغرق دقيقة...'));

        let src;
        try { src = Buffer.from((await axios.get(url, { responseType: 'arraybuffer', timeout: 20000, maxContentLength: MAX_SRC })).data); }
        catch (e) { return reply(deco.errorBox('تعذّر تنزيل الصورة، أعد إرسالها')); }
        const mime = mimeOf(src);
        if (!mime) return reply(deco.errorBox('صيغة الصورة غير مدعومة، أرسلها بصيغة JPG أو PNG'));

        let out = null;
        if (prov === 'gemini') {
            out = await geminiEdit(src, mime, prompt);
        } else {
            const json = await openaiEdit(src, mime, prompt, sizeFor(dimsOf(src, mime)));
            const item = json && Array.isArray(json.data) && json.data[0];
            if (item && item.b64_json) out = Buffer.from(item.b64_json, 'base64');
            else if (item && item.url) out = Buffer.from((await axios.get(item.url, { responseType: 'arraybuffer', timeout: 30000 })).data);
            if (!out || !out.length) {
                console.error('[تعديل] استجابة OpenAI بلا صورة:', JSON.stringify(json).slice(0, 300));
                throw new Error('empty result');
            }
        }
        if (!out || !out.length) throw new Error('empty result');
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
        console.error('[تعديل]', prov, 'status=' + (e && e.status), 'code=' + (e && e.code), String(e && e.message || '').slice(0, 400));
        const detail = isAdmin && e && e.message ? '\n\n🔧 (للمطور) ' + String(e.message).replace(/\s+/g, ' ').slice(0, 300) : '';
        await reply(deco.errorBox(friendly(e, prov) + detail));
    } finally {
        busy = false;
        if (!ok) refundQuota(uid, isAdmin);
        if (file) fs.unlink(file, () => {});
    }
};
