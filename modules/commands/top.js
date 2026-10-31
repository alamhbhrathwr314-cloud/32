module.exports.config = {
    name: 'ترتيب', aliases: ['top', 'المتصدرين'],
    description: 'قائمة أعلى 10 لاعبين',
    usage: 'ترتيب', category: 'economy', cooldown: 10, adminOnly: false
};

module.exports.run = async ({ api, event, helpers, states, deco }) => {
    const top = Object.entries(states.getAll())
        .sort((a, b) => b[1].level - a[1].level || b[1].xp - a[1].xp)
        .slice(0, 10);
    if (!top.length) return helpers.reply(api, event, deco.warning('لا يوجد لاعبون بعد'));
    const names = await helpers.getNames(api, top.map(t => t[0]));
    const medals = ['🥇', '🥈', '🥉'];
    const lines = top.map(([, d], i) => `${medals[i] || `${i + 1}.`} ${names[i]} — مستوى ${d.level} • ${helpers.fmt(d.points)} 💰`);
    return helpers.reply(api, event, deco.infoBox('🏆 المتصدرون', lines.join('\n')));
};
