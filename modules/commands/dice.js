module.exports.config = {
    name: 'نرد', aliases: ['dice'],
    description: 'راهن بنقاطك: الأعلى رمية يفوز',
    usage: 'نرد <المبلغ>', category: 'games', cooldown: 5, adminOnly: false
};

const roll = () => 1 + Math.floor(Math.random() * 6);

module.exports.run = async ({ api, event, args, helpers, states, deco, utils }) => {
    if (!/^\d{1,9}$/.test(args[0] || '')) return utils.throwError('نرد', event.threadID, event.messageID);
    const bet = parseInt(args[0], 10);
    const uid = String(event.senderID);
    const d = states.getData(uid);
    if (bet <= 0) return helpers.reply(api, event, deco.errorBox('الرهان يجب أن يكون أكبر من صفر'));
    if (bet > d.points) return helpers.reply(api, event, deco.errorBox(`رصيدك (${helpers.fmt(d.points)}) لا يكفي`));

    const you = roll(), bot = roll();
    let result;
    if (you > bot) { d.points += bet; result = `🎉 فزت بـ ${helpers.fmt(bet)} نقطة`; }
    else if (you < bot) { d.points -= bet; result = `💔 خسرت ${helpers.fmt(bet)} نقطة`; }
    else result = '🤝 تعادل، لم يتغير شيء';
    states.saveData(uid, d);

    return helpers.reply(api, event, deco.infoBox('🎲 النرد',
        `🧑 رميتك: ${you}\n🤖 رمية البوت: ${bot}\n${result}\n💰 رصيدك: ${helpers.fmt(d.points)}`));
};
