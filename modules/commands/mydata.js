/**
 * .بياناتي          — يعرض ما سجّله البوت عنك
 * .بياناتي حذف      — يحذف سجلك ويوقف تسجيلك
 * .بياناتي تفعيل    — يعيد التسجيل
 */
const users = require('../../utils/db/users');

module.exports.config = {
    name: 'بياناتي', aliases: ['mydata'],
    description: 'اعرض بياناتك المسجلة لدى البوت أو احذفها',
    usage: 'بياناتي [حذف | تفعيل]', category: 'tools', cooldown: 5, adminOnly: false
};

const fmt = ts => new Date(ts).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

module.exports.run = async ({ api, event, args, helpers, deco }) => {
    const id = String(event.senderID);
    const sub = (args[0] || '').trim();

    if (['حذف', 'delete'].includes(sub)) {
        users.optOut(id);
        return helpers.reply(api, event, deco.success('🗑️ حُذف سجلك وأوقفت تسجيل بياناتك.\nللعودة اكتب: .بياناتي تفعيل\n(نقاطك ومستواك في ألعاب البوت تبقى منفصلة).'));
    }
    if (['تفعيل', 'enable'].includes(sub)) {
        users.optIn(id);
        return helpers.reply(api, event, deco.success('✅ أعدت تسجيل بياناتك.'));
    }

    if (users.isOptedOut(id)) {
        return helpers.reply(api, event, deco.warning('أنت خارج التسجيل حاليًا. للعودة اكتب: .بياناتي تفعيل'));
    }
    const u = users.get(id);
    if (!u) return helpers.reply(api, event, deco.warning('لا توجد بيانات مسجلة لك بعد.'));

    return helpers.reply(api, event, deco.infoBox('🗂️ بياناتك لدى البوت', [
        `🆔 الأيدي: ${u.id}`,
        `👤 الاسم: ${u.name || 'غير معروف'}`,
        `📅 أول ظهور: ${fmt(u.firstSeen)}`,
        `🕒 آخر ظهور: ${fmt(u.lastSeen)}`,
        `💬 عدد الرسائل: ${helpers.fmt(u.messages)}`,
        `👥 المجموعات: ${u.threads.length}`,
        '',
        '🔒 لا أحفظ نصوص رسائلك، فقط ما سبق.',
        '🗑️ للحذف وإيقاف التسجيل: .بياناتي حذف'
    ].join('\n')));
};
