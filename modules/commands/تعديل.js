/**
 * .تعديل <وصف>  — تعديل الصور بالذكاء الاصطناعي عبر Meta AI فقط
 *
 * الاستعمال: ردّ على صورة (أو أرسلها مع الأمر) واكتب ما تريد تغييره:
 *   .تعديل خلّي القميص كحلي
 *   .تعديل make the sky sunset orange
 *
 * يرسل البوت الصورة والوصف إلى محادثة Meta AI في ماسنجر ويعيد الصورة المعدّلة (راجع utils/metaAI.js).
 * الإعداد (متغيرات البيئة في الاستضافة):
 *   META_AI_THREAD_ID     أيدي محادثة Meta AI (راجع utils/metaAI.js)
 *   EDIT_DAILY_PER_USER   تعديلات يومية لكل عضو عادي (افتراضي 10، المطور بلا حد)
 *   EDIT_DAILY_TOTAL      سقف يومي للبوت كله (افتراضي 150)
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

const PER_USER = Number(process.env.EDIT_DAILY_PER_USER) || 10;
const TOTAL = Number(process.env.EDIT_DAILY_TOTAL) || 150;
const MAX_PROMPT = 400;

let busy = false;
const usage = new Map();            // userId ← { day, n }
const total = { day: '', n: 0 };
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

/** رابط الصورة من الرد أو من الرسالة نفسها */
function findPhoto(event) {
    for (const l of [event.messageReply && event.messageReply.attachments, event.attachments]) {
        const a = (l || []).find(x => x && ['photo', 'image'].includes(String(x.type)) && (x.url || x.largePreviewUrl || x.previewUrl));
        if (a) return a.url || a.largePreviewUrl || a.previewUrl;
    }
    return null;
}

function failMsg(e) {
    if (e && e.code === 'META_TIMEOUT') return 'تعذّر تعديل الصورة، جرّب وصفًا آخر أو صورة أخرى';
    if (e && (e.code === 'META_SEND' || e.code === 'META_BUSY')) return 'الخدمة غير متاحة الآن، حاول بعد قليل';
    return 'حدث خطأ أثناء تعديل الصورة، حاول مرة أخرى';
}

/* ─────────── الأمر ─────────── */
module.exports.run = async ({ api, event, args, helpers, deco, cfg }) => {
    const reply = t => helpers.reply(api, event, t);
    const p = cfg.getPrefix();
    const uid = String(event.senderID);
    const isAdmin = cfg.isAdmin(uid);

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
        wait = await reply(deco.title('⏳ جاري التعديل'));

        const outUrl = await require('../../utils/metaAI').edit(api, url, prompt);

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
        await reply(deco.errorBox(failMsg(e)));
    } finally {
        busy = false;
        if (!ok) refundQuota(uid, isAdmin);
        if (file) fs.unlink(file, () => {});
    }
};
