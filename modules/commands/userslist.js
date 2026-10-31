/**
 * .المستخدمين            — إحصاءات سجل المستخدمين (للأدمن)
 * .المستخدمين @شخص|أيدي  — بيانات مستخدم محدد
 */
const users = require('../../utils/db/users');

module.exports.config = {
    name: 'المستخدمين', aliases: ['users', 'سجل'],
    description: 'إحصاءات المستخدمين المسجلين أو بيانات مستخدم (للمطور)',
    usage: 'المستخدمين [@شخص | أيدي]', category: 'admin', cooldown: 5, adminOnly: true
};

const fmt = ts => new Date(ts).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
const DAY = 24 * 60 * 60 * 1000;

module.exports.run = async ({ api, event, args, helpers, deco }) => {
    const target = helpers.getTarget(event, args);
    if (target) {
        if (users.isOptedOut(target)) return helpers.reply(api, event, deco.warning('هذا المستخدم خرج من التسجيل.'));
        const u = users.get(target);
        if (!u) return helpers.reply(api, event, deco.warning('لا يوجد سجل لهذا المستخدم.'));
        return helpers.reply(api, event, deco.infoBox('🗂️ بيانات مستخدم', [
            `🆔 ${u.id}`, `👤 ${u.name || 'غير معروف'}`,
            `📅 أول ظهور: ${fmt(u.firstSeen)}`, `🕒 آخر ظهور: ${fmt(u.lastSeen)}`,
            `💬 الرسائل: ${helpers.fmt(u.messages)}`, `👥 المجموعات: ${u.threads.length}`
        ].join('\n')));
    }

    const list = users.all();
    if (!list.length) return helpers.reply(api, event, deco.warning('السجل فارغ بعد.'));
    const now = Date.now();
    const active = list.filter(u => now - u.lastSeen < DAY).length;
    const fresh = list.filter(u => now - u.firstSeen < DAY).length;
    const threads = new Set(list.flatMap(u => u.threads)).size;
    const messages = list.reduce((s, u) => s + u.messages, 0);
    const top = [...list].sort((a, b) => b.messages - a.messages).slice(0, 5);
    const medals = ['🥇', '🥈', '🥉', '4.', '5.'];

    return helpers.reply(api, event, deco.infoBox('📊 سجل المستخدمين', [
        `👥 المسجلون: ${helpers.fmt(list.length)}`,
        `🟢 نشطون خلال 24 ساعة: ${active}`,
        `🆕 جدد خلال 24 ساعة: ${fresh}`,
        `💬 مجموع الرسائل: ${helpers.fmt(messages)}`,
        `👥 المجموعات: ${threads}`,
        '',
        '🏆 الأكثر تفاعلًا:',
        ...top.map((u, i) => `${medals[i]} ${u.name || ('مستخدم ' + u.id.slice(-4))} — ${helpers.fmt(u.messages)}`)
    ].join('\n')));
};
