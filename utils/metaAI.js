/**
 * 🤖 تعديل الصور عبر Meta AI (محادثة Meta AI في ماسنجر من حساب البوت نفسه)
 *
 * الفكرة: يرسل البوت الصورة + الوصف إلى محادثة Meta AI، وينتظر ردّها بصورة، ثم يعيدها لمن طلب.
 * يلتقط الردّ بطريقتين معًا: (1) من أحداث الاستماع، (2) بقراءة سجل المحادثة كل بضع ثوانٍ
 * (لأن بعض المكتبات لا تمرّر ردود Meta AI كأحداث عادية).
 *
 * الإعداد (متغيرات البيئة):
 *   META_AI_THREAD_ID     أيدي محادثة Meta AI (من رابط messenger.com/t/<الرقم>)
 *   META_AI_TIMEOUT_MS    أقصى انتظار للرد (افتراضي 75000)
 *   META_AI_PROMPT        اختياري، صيغة الطلب. {prompt} مكان وصف المستخدم (الافتراضي: Edit this photo: {prompt})
 *   META_AI_KEEP_THREAD=1 لا تحذف محادثة Meta AI بعد كل طلب (الافتراضي: تُحذف، راجع scheduleDeleteThread)
 *   META_AI_DEBUG=1       يطبع في السجل كل حدث يصل من محادثة Meta AI وكل قراءة للسجل
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const axios = require('axios');

const DEFAULT_ID = '156025504001094';
const metaId = () => String(process.env.META_AI_THREAD_ID || DEFAULT_ID).trim();
const timeoutMs = () => Math.max(15000, Number(process.env.META_AI_TIMEOUT_MS) || 75000);
const DEBUG = () => process.env.META_AI_DEBUG === '1';
const dlog = (...a) => { if (DEBUG()) console.log('[metaAI]', ...a); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

let waiter = null; // طلب واحد في كل مرة

const attUrl = a => a && (a.hiresUrl || a.url || a.largePreviewUrl || a.previewUrl || a.facebookUrl || null);
const isPhoto = a => {
    if (!a || !attUrl(a)) return false;
    const t = String(a.type || '').toLowerCase();
    if (['photo', 'image', 'animated_image'].includes(t)) return true;
    if (['sticker', 'audio', 'video', 'location', 'share'].includes(t)) return false;
    // أنواع غير مألوفة (blob/file/unknown): نقبلها إن بدت صورة
    return /image\//i.test(String(a.mimeType || a.contentType || '')) || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(attUrl(a));
};
const summarize = e => `type=${e.type} thread=${e.threadID} from=${e.senderID || e.author || '-'} ` +
    `att=[${(e.attachments || []).map(a => a && a.type).join(',')}] body=${String(e.body || '').length}ch`;

function settle(w, url) {
    if (waiter !== w) return;
    waiter = null;
    clearTimeout(w.timer);
    w.resolve(url);
}

/** يرجع true إذا كان الحدث من محادثة Meta AI (فيُستهلك ولا يمرّ على معالج الأوامر) */
function onIncoming(event) {
    if (!event) return false;
    const mine = String(event.threadID) === metaId() || String(event.senderID) === metaId();
    if (!mine) return false;
    if (!waiter) return true;                        // رسالة شاردة من Meta AI: نتجاهلها
    waiter.seen.push(summarize(event));
    dlog('حدث وارد:', summarize(event));
    const photos = (event.attachments || []).filter(isPhoto);
    if (photos.length) settle(waiter, attUrl(photos[photos.length - 1]));
    else if (event.body) waiter.texts.push(String(event.body).replace(/\s+/g, ' ').slice(0, 300));
    return true;
}

/** قراءة آخر رسائل محادثة Meta AI (مع حماية من التعليق) */
function getHistory(api, n) {
    if (typeof api.getThreadHistory !== 'function') return Promise.resolve(null);
    const call = new Promise(resolve => {
        try {
            const r = api.getThreadHistory(metaId(), n, null, (err, h) => resolve(err ? { err } : (Array.isArray(h) ? h : null)));
            if (r && typeof r.then === 'function') r.then(h => resolve(Array.isArray(h) ? h : null), err => resolve({ err }));
        } catch (e) { resolve({ err: e }); }
    });
    return Promise.race([call, sleep(10000).then(() => ({ err: new Error('timeout') }))]);
}
const histOk = h => Array.isArray(h);

/** يسأل السجل كل 4 ثوانٍ عن رسالة جديدة من Meta AI فيها صورة */
async function pollHistory(api, w, before, botID) {
    await sleep(5000);
    while (waiter === w) {
        const h = await getHistory(api, 10);
        if (waiter !== w) return;
        if (!histOk(h)) {
            w.poll = 'تعذّرت قراءة السجل: ' + String(h && h.err && (h.err.error || h.err.message) || 'غير متاح').slice(0, 80);
            dlog(w.poll);
        } else {
            const fresh = h.filter(m => m && !before.has(String(m.messageID)) && String(m.senderID) !== botID);
            w.poll = `سجل: ${h.length} رسالة، جديد من غير البوت: ${fresh.length}` +
                (fresh.length ? ` (مرفقات: ${fresh.map(m => (m.attachments || []).map(a => a && a.type).join('+') || 'نص').join(',')})` : '');
            dlog(w.poll);
            for (const m of fresh.reverse()) {              // الأحدث أولًا
                const p = (m.attachments || []).filter(isPhoto);
                if (p.length) return settle(w, attUrl(p[p.length - 1]));
                if (m.body) w.texts.push(String(m.body).replace(/\s+/g, ' ').slice(0, 300));
            }
        }
        await sleep(4000);
    }
}


/**
 * وجود محادثة Meta AI في صندوق حساب البوت يكسر getThreadList في المكتبة
 * (خطأ "Found participant with unsupported typename") فتفشل كل دوال سرد المجموعات.
 * لذلك نحذف المحادثة من حساب البوت بعد انتهاء كل طلب (ما لم يبدأ طلب جديد في الأثناء).
 * للإبقاء عليها: META_AI_KEEP_THREAD=1
 */
function scheduleDeleteThread(api) {
    if (process.env.META_AI_KEEP_THREAD === '1' || typeof api.deleteThread !== 'function') return;
    const t = setTimeout(() => {
        if (waiter) return;                                  // طلب جديد بدأ: يحذفها هو عند انتهائه
        try {
            const r = api.deleteThread(metaId(), err => dlog(err ? 'تعذّر حذف محادثة Meta AI: ' + (err.error || err.message || err) : 'حُذفت محادثة Meta AI'));
            if (r && typeof r.catch === 'function') r.catch(() => {});
        } catch (e) { dlog('تعذّر حذف محادثة Meta AI:', e && e.message); }
    }, 4000);
    if (t.unref) t.unref();
}

async function edit(api, imageUrl, prompt) {
    if (waiter) throw Object.assign(new Error('طلب آخر قيد الانتظار عند Meta AI'), { code: 'META_BUSY' });

    const img = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000, maxContentLength: 20 * 1024 * 1024 });
    const type = String(img.headers['content-type'] || '');
    const ext = /png/.test(type) ? 'png' : /webp/.test(type) ? 'webp' : 'jpg';
    const file = path.join(os.tmpdir(), `kira-meta-${Date.now()}.${ext}`);
    fs.writeFileSync(file, Buffer.from(img.data));
    const cleanup = () => fs.unlink(file, () => {});

    const text = String(process.env.META_AI_PROMPT || 'Edit this photo: {prompt}').replace('{prompt}', prompt);
    let botID = '';
    try { botID = String(api.getCurrentUserID()); } catch (e) { /* تجاهل */ }

    // نسجّل الرسائل الموجودة قبل الإرسال لنميّز الردّ الجديد عن القديم
    const beforeList = await getHistory(api, 15);
    const before = new Set(histOk(beforeList) ? beforeList.map(m => String(m && m.messageID)) : []);

    let w;
    const result = new Promise((resolve, reject) => {
        w = { resolve, reject, texts: [], seen: [], poll: '', timer: null };
        w.timer = setTimeout(() => {
            if (waiter === w) waiter = null;
            const parts = [];
            if (w.texts.length) parts.push('ردّ ميتا: ' + w.texts[w.texts.length - 1]);
            parts.push('أحداث وصلت: ' + (w.seen.length ? w.seen.slice(-2).join(' ; ') : 'لا شيء'));
            if (w.poll) parts.push(w.poll);
            reject(Object.assign(new Error('Meta AI لم ترسل صورة خلال المهلة | ' + parts.join(' | ')),
                { code: 'META_TIMEOUT', metaText: w.texts.join(' / ') }));
        }, timeoutMs());
        waiter = w;
    });
    const done = () => { cleanup(); scheduleDeleteThread(api); };
    result.then(done, done);
    result.catch(() => {});

    try {
        await new Promise((resolve, reject) => {
            try {
                const stream = fs.createReadStream(file);
                stream.on('error', () => {});
                api.sendMessage({ body: text, attachment: stream }, metaId(), err => err ? reject(err) : resolve());
            } catch (e) { reject(e); }
        });
    } catch (e) {
        if (waiter === w) { clearTimeout(w.timer); waiter = null; }
        done();
        throw Object.assign(new Error('تعذّر الإرسال إلى Meta AI: ' + (e && (e.error || e.message) || e)), { code: 'META_SEND' });
    }

    pollHistory(api, w, before, botID).catch(e => dlog('خطأ في قراءة السجل:', e && e.message));
    return result;
}

module.exports = { edit, onIncoming, metaId };
