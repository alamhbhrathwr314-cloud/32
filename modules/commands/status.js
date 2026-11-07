const os = require('os');

module.exports.config = {
    name: 'حالة', aliases: ['ping', 'بنق', 'status'],
    description: 'حالة البوت: سرعة الاستجابة، مدة التشغيل، الاتصال، والموارد',
    usage: 'حالة', category: 'tools', cooldown: 5, adminOnly: false
};

/** مدة بالعربية: «2 يوم و 3 ساعة» */
function dur(ms) {
    ms = Math.max(0, ms);
    const d = Math.floor(ms / 86400000), h = Math.floor(ms % 86400000 / 3600000);
    const m = Math.floor(ms % 3600000 / 60000), s = Math.floor(ms % 60000 / 1000);
    const parts = [];
    if (d) parts.push(`${d} يوم`);
    if (h) parts.push(`${h} ساعة`);
    if (m && d < 1) parts.push(`${m} دقيقة`);
    if (!d && !h && !m) parts.push(`${s} ثانية`);
    return parts.join(' و ');
}

const mb = bytes => Math.round(bytes / 1048576);

function memoryLimit() {
    try {
        const lim = typeof process.constrainedMemory === 'function' ? process.constrainedMemory() : 0;
        return lim > 0 && lim < 64 * 1024 ** 3 ? lim : 0;       // حدّ الحاوية إن وُجد (مثل Render)
    } catch (e) { return 0; }
}

function safe(fn, fallback) { try { return fn(); } catch (e) { return fallback; } }

module.exports.run = async ({ api, event, helpers, deco, cfg }) => {
    const now = Date.now();
    const ping = Math.max(0, now - Number(event.timestamp || now));
    const [dot, label] = ping < 800 ? ['🟢', 'ممتازة'] : ping < 2000 ? ['🟡', 'متوسطة'] : ['🔴', 'بطيئة'];

    const started = global.client.startedAt || now;
    const connectedAt = global.client.connectedAt || started;
    const reconnects = Math.max(0, (global.client.logins || 1) - 1);

    const commands = global.client.commands ? global.client.commands.size : 0;
    const users = safe(() => require('../../utils/db/users').all().length, null);
    const version = safe(() => require('../../package.json').version, '');
    const prefix = safe(() => cfg.getPrefix(), '');

    const lines = [
        deco.category('🌐', 'الاتصال'),
        `${dot} الاستجابة: ~${ping}ms (${label})`,
        `    ${helpers.bar(Math.max(0, 3000 - ping), 3000, 12)}`,
        `🔗 متصل منذ: ${dur(now - connectedAt)}`,
        `⏳ مدة التشغيل: ${dur(now - started)}`,
        `🔄 مرات إعادة الاتصال: ${reconnects}`,
        '',
        deco.category('📊', 'البوت'),
        `📦 الأوامر: ${commands}`,
        ...(users !== null ? [`👥 المستخدمون المسجّلون: ${helpers.fmt(users)}`] : []),
        ...(prefix ? [`🔣 البادئة: ${prefix}`] : []),
        ...(version ? [`🔖 الإصدار: ${version}`] : [])
    ];

    // معلومات تقنية: للمطور فقط (لا تُعرض لبقية الأعضاء)
    const isAdmin = safe(() => cfg.isAdmin(String(event.senderID)), false);
    if (isAdmin) {
        const mem = process.memoryUsage();
        const limit = memoryLimit();
        const rss = mb(mem.rss);
        const sess = safe(() => require('../../utils/session').info(), null);
        const cloud = safe(() => require('../../utils/cloudSync').enabled(), false);

        lines.push('', deco.category('🛠️', 'للمطور'));
        if (limit) {
            const pct = Math.min(100, Math.round(mem.rss / limit * 100));
            lines.push(`🧠 الذاكرة: ${rss} / ${mb(limit)} MB (${pct}%)`, `    ${helpers.bar(mem.rss, limit, 12)}`);
        } else {
            lines.push(`🧠 الذاكرة: ${rss} MB`);
        }
        lines.push(
            `🧩 الهيب: ${mb(mem.heapUsed)} / ${mb(mem.heapTotal)} MB`,
            `🍪 الكوكيز: ${sess ? `آخر حفظ قبل ${dur(now - Date.parse(sess.savedAt))}` : 'لم تُحفظ بعد'}`,
            `☁️ النسخ السحابي: ${cloud ? 'مفعّل ✅' : 'غير مفعّل ❌'}`,
            `🟩 Node ${process.version} • ${os.platform()}`
        );
    }

    return helpers.reply(api, event, deco.infoBox('📡 حالة ريمو', lines.join('\n')));
};
