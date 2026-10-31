module.exports.config = {
    name: 'ايدي', aliases: ['id', 'uid'],
    description: 'عرض أيدي حسابك أو شخص (منشن/رد) وأيدي المجموعة',
    usage: 'ايدي [@شخص]', category: 'tools', cooldown: 3, adminOnly: false
};

module.exports.run = async ({ api, event, args, helpers, deco }) => {
    const uid = helpers.getTarget(event, args) || String(event.senderID);
    return helpers.reply(api, event, deco.infoBox('🆔 الأيديات', `👤 المستخدم: ${uid}\n💬 المحادثة: ${event.threadID}`));
};
