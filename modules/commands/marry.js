/**
 * .زوجني [@شخص | رد على رسالة | أيدي]
 * يرسل صورة فيها صورتا الشخصين وبينهما قلب، مع نسبة توافق ثابتة لكل زوج.
 * بدون هدف في المجموعة: يختار البوت شريكًا عشوائيًا من الأعضاء.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const axios = require('axios');
const { makeMarryImage } = require('../../utils/marryImage');

module.exports.config = {
    name: 'زوجني', aliases: ['marry', 'زواج'],
    description: 'يزوّجك بالشخص المقصود في صورة (أو شريك عشوائي)',
    usage: 'زوجني [@شخص | رد | أيدي]', category: 'games', cooldown: 20, adminOnly: false
};

/** استدعاء دالة من api بنمط callback وتحويلها إلى Promise (ترجع null عند الخطأ) */
const call = (api, method, ...args) => new Promise(resolve => {
    try { api[method](...args, (err, data) => resolve(err ? null : data)); }
    catch (e) { resolve(null); }
});

async function fetchAvatar(url) {
    if (!url) return null;
    try {
        const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 8000, maxContentLength: 5 * 1024 * 1024 });
        return Buffer.from(res.data);
    } catch (e) { return null; }
}

/** نسبة توافق ثابتة لنفس الزوج (30 إلى 100) */
function compat(a, b) {
    let h = 0;
    for (const ch of [a, b].sort().join('-')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return 30 + (h % 71);
}

function verdict(p) {
    if (p >= 90) return '✨ توأم الروح! مبروك';
    if (p >= 70) return '🥰 زواج سعيد بإذن الله';
    if (p >= 50) return '😅 يحتاج بعض الصبر والتفاهم';
    return '😂 الله يعينكم على بعض';
}

module.exports.run = async ({ api, event, args, helpers, deco }) => {
    const reply = t => helpers.reply(api, event, t);
    const sender = String(event.senderID);
    const botId = String(api.getCurrentUserID());

    let target = helpers.getTarget(event, args);
    let random = false;
    if (!target) {
        if (event.isGroup === false) return reply(deco.warning('منشن الشخص الذي تريد الزواج منه، أو ردّ على رسالته'));
        const info = await call(api, 'getThreadInfo', event.threadID);
        const pool = ((info && info.participantIDs) || []).map(String).filter(id => id !== sender && id !== botId);
        if (!pool.length) return reply(deco.warning('منشن الشخص الذي تريد الزواج منه، أو ردّ على رسالته'));
        target = pool[Math.floor(Math.random() * pool.length)];
        random = true;
    }
    if (target === sender) return reply(deco.warning('لا يمكنك الزواج من نفسك 😅'));
    if (target === botId) return reply(deco.warning('أنا بوت 🤖 ولا أتزوج!'));

    const info = (await call(api, 'getUserInfo', [sender, target])) || {};
    const nameOf = id => (info[id] && info[id].name) || `مستخدم ${id.slice(-4)}`;
    const thumbOf = id => { const u = info[id] || {}; return u.thumbSrc || u.avatar || u.profilePicture || null; };

    const [imgA, imgB] = await Promise.all([fetchAvatar(thumbOf(sender)), fetchAvatar(thumbOf(target))]);
    const file = path.join(os.tmpdir(), `kira-marry-${Date.now()}-${Math.floor(Math.random() * 1e6)}.png`);
    fs.writeFileSync(file, makeMarryImage(imgA, imgB, sender, target));

    const a = nameOf(sender), b = nameOf(target), percent = compat(sender, target);
    const body = `💒 تم الزواج! 🎉\n💍 @${a} ❤️ @${b}\n`
        + (random ? '🎲 اختار لك البوت شريكًا عشوائيًا\n' : '')
        + `📊 نسبة التوافق: ${percent}%\n${verdict(percent)}`;

    try {
        await reply({
            body,
            attachment: fs.createReadStream(file),
            mentions: [{ tag: `@${a}`, id: sender }, { tag: `@${b}`, id: target }]
        });
    } finally {
        fs.unlink(file, () => {});
    }
};
