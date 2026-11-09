/**
 * .تعديل <وصف>  — تعديل الصور بالذكاء الاصطناعي عبر PixelAPI
 *
 * الاستعمال: ردّ على صورة (أو أرسلها مع الأمر) واكتب ما تريد تغييره:
 *   .تعديل خلّي القميص كحلي
 *   .تعديل make the sky sunset orange
 *
 * الإعداد (متغيرات البيئة في الاستضافة):
 *   PIXELAPI_KEY          مفتاح PixelAPI (إجباري)
 *   PIXELAPI_BASE         اختياري، الافتراضي https://api.pixelapi.dev
 *   EDIT_DAILY_PER_USER   تعديلات يومية لكل عضو عادي (افتراضي 10، المطور بلا حد)
 *   EDIT_DAILY_TOTAL      سقف يومي للبوت كله (افتراضي 150)
 *
 * لا يحتاج sharp ولا Groq. يعتمد على axios الموجودة أصلًا.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const axios = require('axios');

module.exports.config = {
    name: 'تعديل', aliases: ['edit', 'عدل', 'استوديو'],
    description: 'تعديل صورة بالذكاء الاصطناعي: ردّ على صورة واكتب ما تريد تغييره',
    usage: 'تعديل <وصف>  (ردًّا على صورة)', category: 'media', cooldown: 20, adminOnly: false
};

const BASE = (process.env.PIXELAPI_BASE || 'https://api.pixelapi.dev').replace(/\/+$/, '');
const apiKey = () => process.env.PIXELAPI_KEY || 'pk_live_455a5aceea0fc0358953eba034f98034ab08181b70c64f11';
const PER_USER = Number(process.env.EDIT_DAILY_PER_USER) || 10;
const TOTAL = Number(process.env.EDIT_DAILY_TOTAL) || 150;
const MAX_PROMPT = 400;
const POLL_EVERY = 3000;
const POLL_MAX = 120000;

let busy = false;
const usage = new Map();            // userId ← { day, n }
const total = { day: '', n: 0 };
const today = () => new Date().toISOString().slice(0, 10);
const sleep = ms => new Promise(r => setTimeout(r, ms));

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

/** رابط الصورة من الرد أو من الرسالة نفسها */
function findPhoto(event) {
    for (const l of [event.messageReply && event.messageReply.attachments, event.attachments]) {
        const a = (l || []).find(x => x && ['photo', 'image'].includes(String(x.type)) && (x.url || x.largePreviewUrl || x.previewUrl));
        if (a) return a.url || a.largePreviewUrl || a.previewUrl;
    }
    return null;
}

/* ─────────── PixelAPI ─────────── */
const headers = () => ({ Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' });
const isHttp = v => typeof v === 'string' && /^https?:\/\//i.test(v);

/** يلتقط رابط الصورة الناتجة من أشكال الردود المحتملة (ويتجاهل رابط الصورة الأصلية) */
function pickOutput(d, source) {
    if (!d || typeof d !== 'object') return null;
    const out = d.output;
    const list = [
        d.output_url, d.outputUrl, d.result_url, d.resultUrl, d.edited_url,
        d.result && (d.result.output_url || d.result.url || d.result.image_url),
        typeof out === 'string' ? out : (Array.isArray(out) ? out[0] : out && (out.url || out.output_url)),
        d.url, d.image_url
    ];
    const hit = list.find(v => isHttp(v) && v !== source);
    if (hit) return hit;
    return d.data && d.data !== d ? pickOutput(d.data, source) : null;
}
const jobId = d => d && (d.id || d.job_id || d.task_id || d.image_id || (d.data && (d.data.id || d.data.job_id)));
const statusOf = d => String((d && (d.status || (d.data && d.data.status))) || '').toLowerCase();

async function requestEdit(imageUrl, instruction) {
    const res = await axios.post(`${BASE}/v1/image/edit`,
        { image_url: imageUrl, instruction },
        { headers: headers(), timeout: 120000, validateStatus: () => true });
    if (res.status >= 400) throw Object.assign(new Error(JSON.stringify(res.data).slice(0, 300)), { status: res.status });

    let data = res.data;
    let url = pickOutput(data, imageUrl);
    if (url) return url;

    // الطلب غير متزامن: نستعلم عن النتيجة حتى تجهز
    const id = jobId(data);
    if (!id) throw new Error('ردّ غير متوقع من الخدمة: ' + JSON.stringify(data).slice(0, 200));
    const t0 = Date.now();
    while (Date.now() - t0 < POLL_MAX) {
        await sleep(POLL_EVERY);
        const r = await axios.get(`${BASE}/v1/image/${encodeURIComponent(id)}`,
            { headers: headers(), timeout: 30000, validateStatus: () => true });
        if (r.status >= 400) throw Object.assign(new Error(JSON.stringify(r.data).slice(0, 300)), { status: r.status });
        data = r.data;
        url = pickOutput(data, imageUrl);
        if (url) return url;
        if (/fail|error|cancel|reject/.test(statusOf(data))) {
            throw new Error('فشل التعديل: ' + JSON.stringify(data).slice(0, 200));
        }
    }
    throw Object.assign(new Error('انتهت مهلة انتظار النتيجة'), { code: 'ETIMEDOUT' });
}

function failMsg(e) {
    const s = e && e.status;
    if (s === 401 || s === 403) return 'مفتاح PixelAPI غير صالح، يحتاج المطور إلى تحديثه';
    if (s === 402) return 'انتهى رصيد خدمة التعديل، يحتاج المطور إلى شحنه';
    if (s === 422 || s === 400) return 'تعذّر تنفيذ هذا الطلب على الصورة، جرّب وصفًا آخر أو صورة أخرى';
    if (s === 429) return 'الخدمة مزدحمة الآن، حاول بعد دقيقة';
    if (e && (e.code === 'ETIMEDOUT' || e.code === 'ECONNABORTED')) return 'تأخّرت الخدمة في الرد، حاول مجددًا';
    return 'حدث خطأ أثناء تعديل الصورة، حاول مرة أخرى';
}

/* ─────────── الأمر ─────────── */
module.exports.run = async ({ api, event, args, helpers, deco, cfg }) => {
    const reply = t => helpers.reply(api, event, t);
    const p = cfg.getPrefix();
    const uid = String(event.senderID);
    const isAdmin = cfg.isAdmin(uid);

    if (!apiKey()) {
        return reply(isAdmin
            ? deco.warning('أضف متغير PIXELAPI_KEY في الاستضافة ثم أعد التشغيل')
            : deco.warning('هذا الأمر غير مفعّل بعد'));
    }

    const prompt = args.join(' ').trim();
    const url = findPhoto(event);
    if (!prompt || !url) {
        return reply(deco.infoBox('تعديل الصور بالذكاء الاصطناعي', [
            `✏️ ردّ على صورة بـ ${p}تعديل <ما تريده>`,
            `مثال: ${p}تعديل خلّي القميص كحلي`,
            `مثال: ${p}تعديل اجعل السماء وقت الغروب`,
            `مثال: ${p}تعديل شيل النظارة`
        ].join('\n')));
    }
    if (prompt.length > MAX_PROMPT) return reply(deco.warning(`الوصف طويل، اختصره إلى ${MAX_PROMPT} حرفًا`));
    if (busy) return reply(deco.warning('البوت مشغول بتعديل آخر، حاول بعد قليل'));

    const denied = takeQuota(uid, isAdmin);
    if (denied === 'user') return reply(deco.warning(`وصلت حدّك اليومي (${PER_USER} تعديلات). جرّب غدًا`));
    if (denied === 'total') return reply(deco.warning('وصل البوت إلى حدّه اليومي من التعديلات. جرّب غدًا'));

    busy = true;
    let ok = false, wait = null, file = null;
    try {
        wait = await reply(deco.infoBox('⏳ جاري التعديل', 'أرسلت طلبك للذكاء الاصطناعي، انتظر قليلًا...'));

        const outUrl = await requestEdit(url, prompt);

        const img = await axios.get(outUrl, { responseType: 'arraybuffer', timeout: 60000, maxContentLength: 25 * 1024 * 1024 });
        const type = String(img.headers['content-type'] || '');
        const ext = /png/.test(type) ? 'png' : /webp/.test(type) ? 'webp' : 'jpg';
        file = path.join(os.tmpdir(), `kira-edit-${Date.now()}-${Math.floor(Math.random() * 1e6)}.${ext}`);
        fs.writeFileSync(file, Buffer.from(img.data));

        const sent = await new Promise(resolve => {
            const stream = fs.createReadStream(file);
            stream.on('error', () => {});
            try { api.sendMessage({ body: `✏️ تم التعديل: ${prompt}`, attachment: stream }, event.threadID, e => resolve(!e), event.messageID); }
            catch (e) { resolve(false); }
        });
        if (!sent) return reply(deco.errorBox('تم التعديل لكن تعذّر إرسال الصورة'));

        ok = true;
        if (wait && wait.messageID && typeof api.unsendMessage === 'function') api.unsendMessage(String(wait.messageID), () => {});
    } catch (e) {
        console.error('[تعديل]', 'status=' + (e && e.status), 'code=' + (e && e.code), String(e && e.message || '').slice(0, 300));
        const detail = isAdmin && e && e.message ? '\n\n🔧 (للمطور) ' + String(e.message).replace(/\s+/g, ' ').slice(0, 200) : '';
        await reply(deco.errorBox(failMsg(e) + detail));
    } finally {
        busy = false;
        if (!ok) refundQuota(uid, isAdmin);
        if (file) fs.unlink(file, () => {});
    }
};
