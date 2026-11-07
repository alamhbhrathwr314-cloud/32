/**
 * .غادر — يجعل البوت يغادر المجموعة (للمطورين فقط)
 *   .غادر            يغادر المجموعة الحالية
 *   .غادر <أيدي>     يغادر مجموعة أخرى بأيديها (يمكن كتابته من أي محادثة، مثل الخاص)
 */
module.exports.config = {
    name: 'غادر', aliases: ['leave', 'out', 'خروج'],
    description: 'مغادرة البوت للمجموعة (للمطورين فقط)',
    usage: 'غادر | غادر <أيدي المجموعة>', category: 'admin', cooldown: 5, adminOnly: true
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const errText = e => (e && (e.error || e.message)) || String(e);

module.exports.run = async ({ api, event, args, helpers, deco, cfg }) => {
    const reply = t => helpers.reply(api, event, t);
    const sender = String(event.senderID);
    if (!cfg.isAdmin(sender)) return reply(deco.reject('هذا الأمر للمطورين فقط'));
    if (typeof api.removeUserFromGroup !== 'function') return reply(deco.errorBox('هذه المكتبة لا تدعم مغادرة المجموعات'));

    const target = (args[0] || '').trim();
    const remote = /^\d{8,}$/.test(target);
    if (!remote && event.isGroup === false) {
        return reply(deco.warning(`اكتب الأمر داخل المجموعة، أو أرسل أيدي المجموعة\nمثال: ${cfg.getPrefix()}غادر 1234567890123456`));
    }
    const tid = String(remote ? target : event.threadID);
    const botId = String(api.getCurrentUserID());

    // رسالة وداع في المجموعة المقصودة (إن فشلت نكمل المغادرة)
    await new Promise(resolve => {
        try { api.sendMessage('👋 تمت مغادرة البوت بأمر المطور. إلى اللقاء!', tid, () => resolve()); }
        catch (e) { resolve(); }
    });
    await sleep(1500); // نترك الرسالة تصل قبل المغادرة

    const err = await new Promise(resolve => {
        try { api.removeUserFromGroup(botId, tid, e => resolve(e || null)); } catch (e) { resolve(e); }
    });

    if (err) {
        return reply(deco.errorBox(`تعذّرت المغادرة${remote ? ` من ${tid}` : ''}\n${errText(err)}\n(تأكد أنها مجموعة وأن البوت عضو فيها)`));
    }
    // إن كانت المجموعة الحالية فلن يصل الرد (البوت خرج)، لذا نردّ فقط عند المغادرة عن بُعد
    if (remote && tid !== String(event.threadID)) await reply(deco.successLine(`تمت مغادرة المجموعة ${tid}`));
};
