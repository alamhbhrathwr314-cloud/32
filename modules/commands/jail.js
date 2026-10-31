/**
 * .سجن [@شخص | رد على رسالة] — يرسل صورة الشخص خلف قضبان زنزانة.
 * إن لم تمنشن أحدًا ولم تردّ على رسالة، يسجن البوت صاحب الأمر نفسه.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const axios = require('axios');

module.exports.config = {
    name: 'سجن', aliases: ['jail', 'سجنه', 'حبس', 'زنزانة'],
    description: 'سجن شخص في زنزانة مع صورته (منشن أو رد، وإلا نفسك)',
    usage: 'سجن [@منشن | رد على رسالة]', category: 'games', cooldown: 15, adminOnly: false
};

const LINES = [
    '🚔 اتقبض عليه بالجرم المشهود!',
    '⛓️ الحكم: سجن مؤبد... أو لحد ما يعتذر',
    '🔒 تم إقفال الزنزانة ورُميت المفاتيح',
    '👮 القانون ما بيحمي المغفّلين',
    '🍞 وجبته اليوم: خبز وماء'
];

async function fetchAvatar(url) {
    if (!url) return null;
    try {
        const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 8000, maxContentLength: 5 * 1024 * 1024 });
        return Buffer.from(res.data);
    } catch (e) { return null; }
}

module.exports.run = async ({ api, event, args, helpers, deco }) => {
    const reply = t => helpers.reply(api, event, t);
    const sender = String(event.senderID);
    const botId = String(api.getCurrentUserID());

    const target = String(helpers.getTarget(event, args) || sender);   // بلا منشن ولا رد: صاحب الأمر
    if (target === botId) return reply(deco.warning('أنا بوت 🤖 ما بتقدر تسجنني!'));

    const info = await new Promise(resolve => {
        try { api.getUserInfo([target], (err, data) => resolve(err ? {} : data || {})); } catch (e) { resolve({}); }
    });
    const u = info[target] || {};
    const name = u.name || `مستخدم ${target.slice(-4)}`;
    const body = `🚨 تم سجن @${name}!\n${LINES[Math.floor(Math.random() * LINES.length)]}`;
    const mentions = [{ tag: `@${name}`, id: target }];

    let out = null;
    try { out = require('../../utils/jailImage').makeJailImage(await fetchAvatar(u.thumbSrc || u.avatar || u.profilePicture), target); }
    catch (e) { out = null; }
    if (!out) return reply(body); // تعذّر رسم الصورة: نرسل النص فقط

    const file = path.join(os.tmpdir(), `kira-jail-${Date.now()}-${Math.floor(Math.random() * 1e6)}.jpg`);
    fs.writeFileSync(file, out);
    try {
        await new Promise(resolve => {
            api.sendMessage({ body, attachment: fs.createReadStream(file), mentions }, event.threadID, err => {
                if (err) return reply(body).then(resolve);
                resolve();
            }, event.messageID);
        });
    } finally { fs.unlink(file, () => {}); }
};
