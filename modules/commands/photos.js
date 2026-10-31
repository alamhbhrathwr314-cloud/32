/**
 * .صور [عدد] <ما تبحث عنه> — يرسل 5 صور عالية الجودة (أو العدد الذي تحدده حتى 10) بدون مفتاح.
 * مثال: .صور قطط     |     .صور 3 جبال
 * بحث آمن مفعّل دائمًا، ومحظورة الكلمات الإباحية.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const imageSearch = require('../../utils/imageSearch');

module.exports.config = {
    name: 'صور', aliases: ['images', 'img', 'pics', 'صوره'],
    description: 'يرسل 5 صور عالية الجودة لما تبحث عنه',
    usage: 'صور [عدد] <كلمة البحث>', category: 'media', cooldown: 20, adminOnly: false
};

const DEFAULT_COUNT = 5, MAX_COUNT = 10, MAX_PARALLEL = 2;
let running = 0;
const BLOCKED = /(porn|porno|sex|xxx|nude|naked|nsfw|hentai|boobs|erotic|سكس|اباحي|إباحي|عاري|عارية|عاريه|جنس|نيك|بورن)/i;

module.exports.run = async ({ api, event, args, helpers, deco, cfg }) => {
    const reply = t => helpers.reply(api, event, t);
    const p = cfg.getPrefix();

    const words = args.slice();
    let count = DEFAULT_COUNT;
    if (words.length > 1 && /^\d{1,2}$/.test(words[0])) count = Math.min(MAX_COUNT, Math.max(1, parseInt(words.shift(), 10)));
    let q = words.join(' ').replace(/[\u0000-\u001f]/g, ' ').trim();
    if (!q && event.type === 'message_reply' && event.messageReply) q = String(event.messageReply.body || '').trim().slice(0, 100);
    if (!q) return reply(deco.warning(`اكتب ما تريد البحث عنه\nمثال: ${p}صور قطط\nأو: ${p}صور 3 جبال`));
    if (q.length > 100) return reply(deco.warning('كلمة البحث طويلة جدًا'));
    if (BLOCKED.test(q)) return reply(deco.reject('هذا الطلب غير مسموح'));
    if (running >= MAX_PARALLEL) return reply(deco.warning('البوت مشغول بطلبات صور أخرى، حاول بعد قليل'));

    running++;
    const files = [];
    let wait = null;
    try {
        wait = await reply(deco.infoBox('🖼️ الصور', `جاري البحث عن «${q}»...`));
        const cands = await imageSearch.search(q);
        if (!cands.length) return reply(deco.warning('لم أجد صورًا لهذا البحث، جرّب كلمات أخرى'));
        const imgs = await imageSearch.pickImages(cands, count);
        if (!imgs.length) return reply(deco.errorBox('وجدت نتائج لكن تعذّر تحميل الصور (مواقعها تمنع التحميل)، جرّب بحثًا آخر'));

        const id = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
        imgs.forEach((im, i) => { const f = path.join(os.tmpdir(), `kira-img-${id}-${i}.${im.ext}`); fs.writeFileSync(f, im.buf); files.push(f); });
        const note = imgs.length < count ? `\n⚠️ وجدت ${imgs.length} فقط من ${count}` : '';
        const caption = `🖼️ ${q} — ${imgs.length === 1 ? 'صورة واحدة' : imgs.length === 2 ? 'صورتان' : imgs.length + ' صور'}${note}`;
        const sendFiles = (list, body) => new Promise(resolve => {
            const streams = list.map(f => { const s = fs.createReadStream(f); s.on('error', () => {}); return s; });
            try { api.sendMessage(body ? { body, attachment: streams } : { attachment: streams }, event.threadID, e => resolve(!e), event.messageID); }
            catch (e) { resolve(false); }
        });
        let ok = await sendFiles(files, caption);
        if (!ok && files.length > 1) { // قد تفسد صورة واحدة الإرسال كله: نجرّب إرسالها واحدة واحدة
            let sent = 0;
            for (const f of files) if (await sendFiles([f], sent ? '' : caption)) sent++;
            ok = sent > 0;
        }
        if (!ok) await reply(deco.errorBox('تعذّر إرسال الصور، حاول لاحقًا'));
    } catch (e) {
        return reply(deco.errorBox('تعذّر البحث الآن، حاول لاحقًا'));
    } finally {
        running--;
        if (wait && wait.messageID && typeof api.unsendMessage === 'function') api.unsendMessage(String(wait.messageID), () => {});
        for (const f of files) fs.unlink(f, () => {});
    }
};
