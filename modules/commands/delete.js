/**
 * .حذف — ردّ على رسالة للبوت بهذا الأمر فيحذفها (إلغاء الإرسال للجميع).
 * يعمل على رسائل البوت فقط، ومتاح للجميع.
 */
module.exports.config = {
    name: 'حذف', aliases: ['delete', 'unsend', 'احذف', 'مسح'],
    description: 'حذف رسالة للبوت بالرد عليها',
    usage: 'حذف (بالرد على رسالة البوت)', category: 'tools', cooldown: 2, adminOnly: false
};

module.exports.run = async ({ api, event, helpers, deco }) => {
    const reply = t => helpers.reply(api, event, t);
    if (typeof api.unsendMessage !== 'function') return reply(deco.errorBox('هذه المكتبة لا تدعم حذف الرسائل'));

    const target = event.type === 'message_reply' ? event.messageReply : null;
    if (!target || !target.messageID) return reply(deco.warning('ردّ على رسالة البوت التي تريد حذفها بكلمة «حذف»'));
    if (String(target.senderID) !== String(api.getCurrentUserID())) return reply(deco.warning('أستطيع حذف رسائلي أنا فقط 🤖'));

    const err = await new Promise(resolve => {
        try { api.unsendMessage(String(target.messageID), e => resolve(e || null)); }
        catch (e) { resolve(e); }
    });
    if (err) {
        const why = String((err && (err.error || err.message)) || err).replace(/\s+/g, ' ').slice(0, 100);
        return reply(deco.errorBox(`تعذّر حذف الرسالة: ${why}`));
    }
    // نجح الحذف: لا نرسل رداً حتى لا نترك رسالة جديدة مكانها
};
