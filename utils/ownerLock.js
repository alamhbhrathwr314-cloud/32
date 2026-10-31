/**
 * 🔒 البوت خاص بالمطور (سلوك أساسي دائم، بلا أمر تشغيل/إيقاف):
 * إذا أضاف البوتَ إلى مجموعةٍ شخصٌ غير المطور، يرسل صورة ورسالة «الرجاء التواصل مع المطور» ثم يغادر المجموعة.
 * يُستدعى من main.js عند كل حدث مجموعة (log:subscribe).
 * المطور = كل من في ADMINBOT داخل config.json.
 * الصورة: assets/lock.jpg إن وُضعت، وإلا بطاقة تُرسم بالكود (utils/lockCard.js).
 */
const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const logWarn = m => { try { require('./log')(m, 'warn'); } catch (e) { console.warn(m); } };
const handled = new Map(); // يمنع تكرار الرسالة إذا وصل الحدث مرتين

const sendOnce = (api, msg, tid) => new Promise(resolve => {
    try { api.sendMessage(msg, tid, err => resolve(err || null)); } catch (e) { resolve(e); }
});

async function ownerLock(api, event, cfg) {
    if (!event || event.logMessageType !== 'log:subscribe') return;
    const botId = String(api.getCurrentUserID());
    const added = ((event.logMessageData && event.logMessageData.addedParticipants) || [])
        .map(p => String(p.userFbId || p.userID || p.id));
    if (!added.includes(botId)) return;                    // الحدث لا يخص البوت
    const author = String(event.author || '');
    if (author && cfg.isAdmin(author)) return;             // أضافه المطور: يبقى

    const tid = String(event.threadID);
    const now = Date.now();
    if (now - (handled.get(tid) || 0) < 15000) return;
    handled.set(tid, now);

    const body = `🔒 الرجاء التواصل مع المطور\n` +
        `👤 ${cfg.getAdminName()}\n🔗 ${cfg.getAdminLink()}\n\n` +
        `هذا البوت خاص بالمطور ولا يمكن إضافته إلى المجموعات دون إذنه.\n👋 سأغادر المجموعة الآن.`;

    let sent = false;
    const img = (() => { try { return require('./lockCard').getImage(); } catch (e) { return null; } })();
    if (img) {
        const stream = fs.createReadStream(img.file);
        stream.on('error', () => {});                      // لا نُسقط البوت إن حُذف الملف أثناء القراءة
        const err = await sendOnce(api, { body, attachment: stream }, tid);
        if (img.temp) fs.unlink(img.file, () => {});
        sent = !err;
        if (err) logWarn(`قفل المطور: تعذّر إرسال الصورة (${(err && (err.error || err.message)) || err})`);
    }
    if (!sent) await sendOnce(api, body, tid);             // بلا صورة إن فشلت، نرسل النص على الأقل

    await sleep(2500);                                     // نترك الرسالة تصل قبل المغادرة
    const err = await new Promise(resolve => {
        try { api.removeUserFromGroup(botId, tid, e => resolve(e || null)); } catch (e) { resolve(e); }
    });
    if (err) logWarn(`قفل المطور: تعذّرت المغادرة من ${tid} (${(err && (err.error || err.message)) || err})`);
}

module.exports = { ownerLock };
