module.exports.config = {
    name: 'حالة', aliases: ['ping', 'بنق', 'status'],
    description: 'سرعة الاستجابة ومدة تشغيل البوت',
    usage: 'حالة', category: 'tools', cooldown: 5, adminOnly: false
};

module.exports.run = async ({ api, event, helpers, deco }) => {
    const ping = Math.max(0, Date.now() - Number(event.timestamp || Date.now()));
    const up = helpers.msToTime(Date.now() - global.client.startedAt);
    const mem = Math.round(process.memoryUsage().rss / 1048576);
    return helpers.reply(api, event, deco.infoBox('📡 الحالة',
        `🏓 الاستجابة: ~${ping}ms\n⏳ مدة التشغيل: ${up}\n🧠 الذاكرة: ${mem}MB\n📦 الأوامر: ${global.client.commands.size}`));
};
