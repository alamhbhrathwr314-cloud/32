/**
 * 🎖️ صلاحية — منح صلاحية المطور لشخص آخر وسحبها (للمطور الرئيسي فقط)
 *   .صلاحية @شخص          يمنحه صلاحية المطور (أو ردًا على رسالته، أو بكتابة أيديه)
 *   .صلاحية منح @شخص      نفس الشيء
 *   .صلاحية سحب @شخص      يسحب صلاحيته
 *   .صلاحية قائمة         يعرض المطور الرئيسي والمطورين المساعدين
 *
 * الممنوح له يقدر يضيف البوت للمجموعات ويستعمل أوامر المطور، لكنه لا يقدر يمنح أو يسحب صلاحيات،
 * ولا يوقف/يشغّل البوت للكل، ولا يمسّ المطور الرئيسي. والمطور الرئيسي لا يُسحب بأي أمر.
 */
const permissions = require('../../utils/permissions');

module.exports.config = {
    name: 'صلاحية', aliases: ['صلاحيه', 'permission', 'perm'],
    description: 'منح صلاحية المطور لشخص أو سحبها (للمطور الرئيسي فقط)',
    usage: 'صلاحية [منح|سحب|قائمة] [@شخص|أيدي]', category: 'admin', cooldown: 0, adminOnly: false
};

const GRANT = ['منح', 'اعطاء', 'إعطاء', 'اضافة', 'إضافة', 'add', 'grant'];
const REVOKE = ['سحب', 'ازالة', 'إزالة', 'حذف', 'remove', 'revoke'];
const LIST = ['قائمة', 'القائمة', 'حالة', 'list'];

module.exports.run = async ({ api, event, args, helpers, deco, cfg }) => {
    const reply = t => helpers.reply(api, event, t);
    const sender = String(event.senderID);
    // نتحقق من الرئيسي داخل الأمر (وليس adminOnly) حتى لا يستعمله المطورون المساعدون
    if (!cfg.isOwner(sender)) return reply(deco.reject('هذا الأمر للمطور الرئيسي فقط'));

    const word = (args[0] || '').toLowerCase();
    const action = GRANT.includes(word) ? 'grant' : REVOKE.includes(word) ? 'revoke' : LIST.includes(word) ? 'list' : null;
    const rest = action ? args.slice(1) : args;
    const target = helpers.getTarget(event, rest);

    if (action === 'list' || (!action && !target)) {
        const subs = permissions.list();
        const lines = [`👑 المطور الرئيسي: ${cfg.getOwner()}`];
        const others = cfg.getAdmins().map(String).filter(id => id !== cfg.getOwner());
        if (others.length) lines.push(`🛠️ مطورون في config.json: ${others.join('، ')}`);
        lines.push('', subs.length ? `🎖️ المطورون المساعدون (${subs.length}):` : '🎖️ لا يوجد مطورون مساعدون');
        subs.forEach((s, i) => lines.push(`${i + 1}. ${s.name || 'بدون اسم'} — ${s.id}`));
        lines.push('', `${cfg.getPrefix()}صلاحية @شخص  لمنح صلاحية`, `${cfg.getPrefix()}صلاحية سحب @شخص  لسحبها`);
        return reply(deco.infoBox('🎖️ الصلاحيات', lines.join('\n')));
    }

    if (!target) return reply(deco.warning(`منشن الشخص أو ردّ على رسالته أو اكتب أيديه\nمثال: ${cfg.getPrefix()}صلاحية ${action === 'revoke' ? 'سحب ' : ''}@فلان`));

    if (cfg.isOwner(target)) {
        return reply(deco.warning(action === 'revoke'
            ? '👑 لا يمكن سحب صلاحية المطور الرئيسي، فهي دائمة'
            : '👑 أنت المطور الرئيسي وصلاحياتك دائمة'));
    }
    let botId = '';
    try { botId = String(api.getCurrentUserID()); } catch (e) { /* تجاهل */ }
    if (target === botId) return reply(deco.errorBox('هذا حساب البوت نفسه 🤖'));

    const name = await helpers.getName(api, target);

    if (action === 'revoke') {
        if (cfg.getAdmins().some(a => String(a) === target)) return reply(deco.warning('هذا مطور أساسي مكتوب في config.json، ولا يُسحب بالأمر'));
        if (!permissions.isSub(target)) return reply(deco.warning(`${name} ليس عنده صلاحية ممنوحة`));
        return reply(permissions.revoke(target)
            ? deco.success(`🗑️ تم سحب صلاحية المطور من ${name}`)
            : deco.errorBox('تعذّر حفظ التغيير، حاول مرة أخرى'));
    }

    // منح (صريح، أو مختصر بمنشن/رد/أيدي)
    if (cfg.getAdmins().some(a => String(a) === target)) return reply(deco.warning(`${name} مطور أساسي أصلًا في config.json`));
    if (permissions.isSub(target)) return reply(deco.warning(`${name} عنده الصلاحية أصلًا`));
    if (!permissions.grant(target, { name, by: sender })) return reply(deco.errorBox('تعذّر حفظ الصلاحية، حاول مرة أخرى'));
    return reply(deco.success(`🎖️ تم منح ${name} صلاحية المطور\n\n✅ يضيف البوت للمجموعات ويستعمل أوامر المطور\n🚫 لا يمنح ولا يسحب الصلاحيات، ولا يوقف/يشغّل البوت للكل، ولا يمسّ المطور الرئيسي`));
};
