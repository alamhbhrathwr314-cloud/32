const DAY = 24 * 60 * 60 * 1000;

module.exports.config = {
    name: 'يومي', aliases: ['daily'],
    description: 'استلم مكافأتك اليومية من النقاط',
    usage: 'يومي', category: 'economy', cooldown: 3, adminOnly: false
};

module.exports.run = async ({ api, event, helpers, states, deco }) => {
    const uid = String(event.senderID);
    const d = states.getData(uid);
    const passed = Date.now() - d.lastDaily;
    if (passed < DAY) {
        return helpers.reply(api, event, deco.warning(`مكافأتك جاهزة بعد ${helpers.msToTime(DAY - passed)}`));
    }
    const reward = 100 + Math.floor(Math.random() * 201);
    d.points += reward;
    d.lastDaily = Date.now();
    states.saveData(uid, d);
    const r = helpers.addXP(uid, 20);
    let msg = `🎁 حصلت على ${helpers.fmt(reward)} نقطة\n💰 رصيدك: ${helpers.fmt(r.data.points)}`;
    if (r.leveledUp) msg += `\n🎉 ارتقيت للمستوى ${r.data.level}`;
    return helpers.reply(api, event, deco.success(msg));
};
