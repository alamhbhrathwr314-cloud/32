/**
 * .طلاق [@شخص | رد على رسالة | أيدي]
 * يرسل صورة انفصال بين صاحب الأمر والشخص المقصود (قلب مكسور بين صورتيهما).
 * الصورة: يختار الأمر صورة أنمي عشوائية من assets/divorce/ (jpg أو png) ويضع فوقها شريطًا
 * فيه بروفايل الشخصين وبينهما قلب مكسور. إن لم توجد صور هناك يرسم صورة بديلة بالكود.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const axios = require('axios');
const { makeDivorceImage } = require('../../utils/divorceImage');
const { makeDivorceCard } = require('../../utils/divorceCard');

module.exports.config = {
    name: 'طلاق', aliases: ['divorce', 'طلقني', 'طلقها'],
    description: 'طلاق الشخص المقصود مع صورة انفصال (منشن أو رد)',
    usage: 'طلاق <@منشن | رد على رسالة | أيدي>', category: 'games', cooldown: 20, adminOnly: false
};

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

/** صورة أنمي من assets/divorce إن وُجدت (اختيار عشوائي) — تُفك JPEG وPNG فقط */
function baseImage() {
    try {
        const dir = path.join(__dirname, '..', '..', 'assets', 'divorce');
        const files = fs.readdirSync(dir).filter(f => /\.(jpe?g|png)$/i.test(f));
        return files.length ? path.join(dir, files[Math.floor(Math.random() * files.length)]) : null;
    } catch (e) { return null; }
}

const LINES = [
    '💔 انتهت القصة... كل واحد يمشي في طريقه',
    '🥀 طلاق بائن، ولا رجعة بعد اليوم',
    '😢 الله يعوّض كل واحد منكم بمن هو أفضل',
    '🌧️ أحيانًا الفراق أرحم من البقاء',
    '📜 تم توثيق الطلاق رسميًا'
];

module.exports.run = async ({ api, event, args, helpers, deco, cfg }) => {
    const reply = t => helpers.reply(api, event, t);
    const sender = String(event.senderID);
    const botId = String(api.getCurrentUserID());
    const p = cfg.getPrefix();

    const target = helpers.getTarget(event, args);
    if (!target) return reply(deco.warning(`منشن الشخص أو ردّ على رسالته\nمثال: ${p}طلاق @فلان`));
    if (target === sender) return reply(deco.warning('لا يمكنك تطليق نفسك 😅'));
    if (target === botId) return reply(deco.warning('أنا بوت 🤖 ولم نتزوج أصلًا!'));

    const info = (await call(api, 'getUserInfo', [sender, target])) || {};
    const nameOf = id => (info[id] && info[id].name) || `مستخدم ${id.slice(-4)}`;
    const thumbOf = id => { const u = info[id] || {}; return u.thumbSrc || u.avatar || u.profilePicture || null; };
    const a = nameOf(sender), b = nameOf(target);

    const body = `💔 تم الطلاق!\n@${a} 💔 @${b}\n${LINES[Math.floor(Math.random() * LINES.length)]}`;
    const mentions = [{ tag: `@${a}`, id: sender }, { tag: `@${b}`, id: target }];

    const [imgA, imgB] = await Promise.all([fetchAvatar(thumbOf(sender)), fetchAvatar(thumbOf(target))]);
    let out = null, ext = 'jpg';
    try {
        const basePath = baseImage();
        if (basePath) out = makeDivorceCard(fs.readFileSync(basePath), imgA, imgB, sender, target);
    } catch (e) { out = null; }
    if (!out) { out = makeDivorceImage(imgA, imgB, sender, target); ext = 'png'; } // لا صور أنمي أو تعذّر فكها
    const file = path.join(os.tmpdir(), `kira-divorce-${Date.now()}-${Math.floor(Math.random() * 1e6)}.${ext}`);
    fs.writeFileSync(file, out);
    const temp = true;

    try {
        await new Promise(resolve => {
            api.sendMessage({ body, attachment: fs.createReadStream(file), mentions }, event.threadID, err => {
                if (err) return reply(body).then(resolve); // فشل الإرفاق: نرسل النص وحده
                resolve();
            }, event.messageID);
        });
    } finally {
        if (temp) fs.unlink(file, () => {});
    }
};
