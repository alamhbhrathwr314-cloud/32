const fs = require('fs');
const os = require('os');
const path = require('path');

module.exports.config = {
    name: 'اوامر', aliases: ['help', 'الاوامر', 'مساعدة'],
    description: 'عرض قائمة الأوامر أو تفاصيل أمر معيّن',
    usage: 'اوامر [اسم الأمر]', category: 'tools', cooldown: 3, adminOnly: false
};

module.exports.run = async ({ api, event, args, helpers, deco, cfg }) => {
    const prefix = cfg.getPrefix();
    const { commands, aliases } = global.client;

    if (args[0]) {
        const key = args[0].toLowerCase();
        const cmd = commands.get(key) || commands.get(aliases.get(key));
        if (!cmd) return helpers.reply(api, event, deco.errorBox(`لا يوجد أمر باسم «${args[0]}»`));
        const c = cmd.config;
        return helpers.reply(api, event, deco.infoBox(`أمر ${c.name}`, [
            `📝 ${c.description}`,
            `📌 الاستخدام: ${prefix}${c.usage || c.name}`,
            c.aliases && c.aliases.length ? `🔀 أسماء بديلة: ${c.aliases.join('، ')}` : null,
            `⏱️ الانتظار: ${c.cooldown || 0} ثانية`,
            c.adminOnly ? '👑 للمطور فقط' : null
        ].filter(Boolean).join('\n')));
    }

    const all = [...commands.values()];
    const lines = all.map(c => ` ✦ ${prefix}${c.config.name}`);
    const text = `${deco.kiraTitle()}\n${deco.separator()}\n${lines.join('\n')}\n${deco.separator()}\n💡 ${prefix}اوامر <اسم الأمر> لعرض التفاصيل`;

    // الصورة: صورتك الخاصة (assets/help.jpg|png أو متغير HELP_IMAGE) وإلا لافتة REMO COMMAND المرسومة بالكود
    let file = null, temp = false;
    try {
        const own = [process.env.HELP_IMAGE, ...['jpg', 'jpeg', 'png'].map(e => path.join(__dirname, '..', '..', 'assets', `help.${e}`))]
            .filter(Boolean).find(f => fs.existsSync(f));
        if (own) file = own;
        else {
            file = path.join(os.tmpdir(), `kira-help-${process.pid}.png`);
            if (!fs.existsSync(file)) fs.writeFileSync(file, require('../../utils/helpBanner').makeHelpBanner());
        }
    } catch (e) { file = null; }
    if (!file) return helpers.reply(api, event, text);        // تعذّرت الصورة: القائمة نصًا فقط

    // صورة + القائمة في رسالة واحدة، وإن فشل الإرفاق نرسل النص وحده
    return new Promise(resolve => {
        const stream = fs.createReadStream(file);
        stream.on('error', () => {});
        try {
            api.sendMessage({ body: text, attachment: stream }, event.threadID, (err, info) => {
                if (err) return helpers.reply(api, event, text).then(resolve);
                resolve(info);
            }, event.messageID);
        } catch (e) { helpers.reply(api, event, text).then(resolve); }
    });
};
