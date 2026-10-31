/**
 * ⏻ ايقاف / تشغيل — إيقاف البوت في مجموعة أو في كل المجموعات (للمطور فقط)
 *   .ايقاف         يوقف البوت في هذه المجموعة فقط
 *   .ايقاف الكل    يوقف البوت في جميع المجموعات
 *   .تشغيل         يعيده في هذه المجموعة (حتى بعد «ايقاف الكل»)
 *   .تشغيل الكل    يعيده في جميع المجموعات
 *   .ايقاف حالة    يعرض وضع هذه المجموعة والوضع العام
 * البوت الموقوف لا يرد على أحد ولا يعدّ الخبرة، ويبقى يستجيب لأمر التشغيل من المطور فقط.
 * «الكل» للمطور الرئيسي فقط؛ أما إيقاف/تشغيل مجموعة واحدة فيقدر عليه كل المطورين (الرئيسي والمساعدون).
 */
const power = require('../../utils/power');

module.exports.config = {
    name: 'ايقاف', aliases: ['إيقاف', 'تشغيل', 'stop', 'start'],
    description: 'إيقاف/تشغيل البوت في مجموعة أو في الكل (للمطور)',
    usage: 'ايقاف [الكل] | تشغيل [الكل] | ايقاف حالة', category: 'admin', cooldown: 0, adminOnly: true
};

const ALL_WORDS = ['الكل', 'كل', 'all'];
const STATUS_WORDS = ['حالة', 'status'];

module.exports.run = async ({ api, event, args, helpers, deco, cfg }) => {
    const reply = t => helpers.reply(api, event, t);
    const prefix = cfg.getPrefix();
    const word = String(event.body || '').slice(prefix.length).trim().split(/\s+/)[0].toLowerCase();
    const turnOn = power.ON_WORDS.includes(word);
    const arg = (args[0] || '').toLowerCase();
    const tid = event.threadID;

    if (STATUS_WORDS.includes(arg)) {
        const s = power.status();
        const here = power.isOff(tid) ? '🔴 موقوف' : '🟢 يعمل';
        const general = s.all ? '🔴 كل المجموعات موقوفة' : '🟢 كل المجموعات تعمل';
        const note = s.exceptions ? `\n📌 مجموعات مستثناة من الوضع العام: ${s.exceptions}` : '';
        return reply(deco.infoBox('⏻ حالة البوت', `هذه المجموعة: ${here}\nالوضع العام: ${general}${note}`));
    }

    if (ALL_WORDS.includes(arg)) {
        // إيقاف/تشغيل الكل للمطور الرئيسي فقط، فالمطور المساعد لا يقدر يسكت البوت في كل المجموعات
        if (!cfg.isOwner(String(event.senderID))) return reply(deco.reject('إيقاف/تشغيل الكل للمطور الرئيسي فقط'));
        power.setAll(!turnOn);
        return reply(turnOn
            ? deco.success('🟢 تم تشغيل البوت في جميع المجموعات')
            : deco.warning('🔴 تم إيقاف البوت في جميع المجموعات\nلن يرد على أحد. اكتب .تشغيل (للمطور) لإعادته هنا، أو .تشغيل الكل للجميع'));
    }

    if (args.length && !ALL_WORDS.includes(arg)) {
        return reply(deco.errorBox(`للمجموعة الحالية: ${prefix}${turnOn ? 'تشغيل' : 'ايقاف'}\nللكل: ${prefix}${turnOn ? 'تشغيل' : 'ايقاف'} الكل`));
    }

    if (turnOn && !power.isOff(tid)) return reply(deco.warning('البوت يعمل في هذه المجموعة أصلًا'));
    if (!turnOn && power.isOff(tid)) return reply(deco.warning('البوت موقوف في هذه المجموعة أصلًا'));
    power.setThread(tid, !turnOn);
    return reply(turnOn
        ? deco.success('🟢 تم تشغيل البوت في هذه المجموعة')
        : deco.warning('🔴 تم إيقاف البوت في هذه المجموعة\nلن يرد على أحد هنا. اكتب .تشغيل (للمطور) لإعادته'));
};
