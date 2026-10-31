module.exports.config = {
    name: 'رصيد', aliases: ['balance', 'profile', 'بروفايل'],
    description: 'عرض مستواك ونقاطك أو نقاط شخص آخر',
    usage: 'رصيد [@شخص]', category: 'economy', cooldown: 5, adminOnly: false
};

module.exports.run = async ({ api, event, args, helpers, states, deco }) => {
    const uid = helpers.getTarget(event, args) || String(event.senderID);
    const d = states.getData(uid);
    const name = await helpers.getName(api, uid);
    const need = helpers.xpNeeded(d.level);
    const text = deco.infoBox(`ملف ${name}`, [
        `🏅 الرتبة: ${d.rank}`,
        `⭐ المستوى: ${d.level}`,
        `✨ الخبرة: ${d.xp}/${need}`,
        helpers.bar(d.xp, need),
        `💰 النقاط: ${helpers.fmt(d.points)}`,
        `🎒 المخزون: ${d.inventory.length} عنصر`
    ].join('\n'));
    return helpers.reply(api, event, text);
};
