module.exports.config = {
    name: 'اعطاء', aliases: ['give', 'اضافة'],
    description: 'إضافة نقاط لأي شخص (للمطور)',
    usage: 'اعطاء @شخص <المبلغ>', category: 'admin', cooldown: 0, adminOnly: true
};

module.exports.run = async ({ api, event, args, helpers, states, deco, utils }) => {
    const target = helpers.getTarget(event, args);
    const last = args[args.length - 1];
    if (!target || !/^\d{1,9}$/.test(last || '') || last === target || parseInt(last, 10) <= 0) {
        return utils.throwError('اعطاء', event.threadID, event.messageID);
    }
    const amount = parseInt(last, 10);
    const d = states.getData(target);
    d.points += amount;
    states.saveData(target, d);
    const name = await helpers.getName(api, target);
    return helpers.reply(api, event, deco.success(`تمت إضافة ${helpers.fmt(amount)} نقطة إلى ${name}\n💰 رصيده: ${helpers.fmt(d.points)}`));
};
