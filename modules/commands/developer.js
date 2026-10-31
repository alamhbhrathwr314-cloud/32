module.exports.config = {
    name: 'المطور', aliases: ['dev', 'developer'],
    description: 'معلومات مطور البوت',
    usage: 'المطور', category: 'tools', cooldown: 5, adminOnly: false
};

module.exports.run = async ({ api, event, helpers, deco, cfg }) => {
    return helpers.reply(api, event, deco.infoBox('المطور',
        `👨‍💻 الاسم: ${cfg.getAdminName()}\n🔗 الحساب: ${cfg.getAdminLink()}\n🎀 البوت: ${cfg.getBotName()}`));
};
