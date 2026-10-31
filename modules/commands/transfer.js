module.exports.config = {
    name: 'تحويل', aliases: ['transfer', 'pay'],
    description: 'حوّل نقاطًا إلى شخص آخر',
    usage: 'تحويل @شخص <المبلغ>', category: 'economy', cooldown: 10, adminOnly: false
};

module.exports.run = async ({ api, event, args, helpers, states, deco, utils }) => {
    const sender = String(event.senderID);
    const target = helpers.getTarget(event, args);
    const last = args[args.length - 1];
    if (!target || !/^\d{1,9}$/.test(last || '') || last === target) {
        return utils.throwError('تحويل', event.threadID, event.messageID);
    }
    const amount = parseInt(last, 10);
    if (amount <= 0) return helpers.reply(api, event, deco.errorBox('المبلغ يجب أن يكون أكبر من صفر'));
    if (target === sender) return helpers.reply(api, event, deco.errorBox('لا يمكنك التحويل لنفسك'));

    const from = states.getData(sender);
    if (from.points < amount) {
        return helpers.reply(api, event, deco.errorBox(`رصيدك (${helpers.fmt(from.points)}) لا يكفي`));
    }
    const to = states.getData(target);
    from.points -= amount;
    to.points += amount;
    states.saveData(sender, from);
    states.saveData(target, to);

    const name = await helpers.getName(api, target);
    return helpers.reply(api, event, deco.success(`تم تحويل ${helpers.fmt(amount)} نقطة إلى ${name}\n💰 رصيدك الآن: ${helpers.fmt(from.points)}`));
};
