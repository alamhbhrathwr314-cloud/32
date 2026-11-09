/**
 * .معلومات_رابط <رابط>
 * يجلب بيانات العرض العامة (Open Graph) لأي رابط عام: العنوان، الوصف،
 * اسم الموقع/الصفحة، والصورة — تماماً مثل ما يظهر عند مشاركة الرابط في ماسنجر.
 * يعمل فقط مع صفحات عامة يمكن لأي زائر فتحها؛ لا يستخدم جلسة أو صلاحيات خاصة،
 * ولا يجلب بيانات محمية أو خاصة بأي حساب.
 */
const axios = require('axios');

module.exports.config = {
    name: 'معلومات',
    aliases: ['تحقيق', 'بحث', 'رابط'],
    version: '1.0.0',
    hasPermssion: 0,
    credits: 'ايمن',
    description: 'يجلب عنوان ووصف وصورة أي رابط عام (منشور، صفحة، فيديو...)',
    commandCategory: 'tools',
    usages: 'معلومات_رابط <رابط>',
    cooldowns: 10
};

const UA = 'Mozilla/5.0 (compatible; facebookexternalhit/1.1; +http://www.facebook.com/externalhit_uatext.php)';

function pick(html, prop) {
    // يبحث عن <meta property="og:xxx" content="..."> أو name="xxx" بأي ترتيب للسمات
    const re = new RegExp(
        `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']`,
        'i'
    );
    const m = html.match(re) || html.match(new RegExp(
        `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`,
        'i'
    ));
    return m ? m[1].replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&') : null;
}

function plainTitle(html) {
    const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    return m ? m[1].trim() : null;
}

module.exports.run = async function ({ api, event, args, helpers, deco }) {
    const { threadID, messageID } = event;
    const reply = t => helpers.reply(api, event, t);

    const url = (args[0] || '').trim();
    if (!/^https?:\/\//i.test(url)) {
        return reply(deco.warning('أرسل رابطاً صحيحاً يبدأ بـ http:// أو https://\nمثال: .معلومات_رابط https://example.com'));
    }

    api.setMessageReaction('🔍', messageID, () => {}, true);

    try {
        const res = await axios.get(url, {
            headers: { 'User-Agent': UA, 'Accept-Language': 'ar,en;q=0.8' },
            timeout: 15000,
            maxRedirects: 5,
            validateStatus: s => s < 500
        });

        const html = String(res.data || '');
        const title = pick(html, 'og:title') || plainTitle(html) || 'بدون عنوان';
        const desc = pick(html, 'og:description') || pick(html, 'description') || 'لا يوجد وصف';
        const site = pick(html, 'og:site_name') || new URL(url).hostname;
        const image = pick(html, 'og:image');
        const author = pick(html, 'og:article:author') || pick(html, 'article:author') || pick(html, 'author');

        let text = `${deco.title('معلومات الرابط')}\n\n`;
        text += `📝 العنوان: ${title}\n`;
        text += `📄 الوصف: ${desc.slice(0, 300)}\n`;
        text += `🌐 الموقع: ${site}\n`;
        if (author) text += `👤 الكاتب/الناشر: ${author}\n`;
        text += `🔗 ${url}`;

        api.setMessageReaction('✅', messageID, () => {}, true);

        if (image) {
            try {
                const imgRes = await axios.get(image, { responseType: 'stream', timeout: 15000 });
                return api.sendMessage({ body: text, attachment: imgRes.data }, threadID, messageID);
            } catch (e) {
                // تعذّر جلب الصورة، نرسل النص فقط
            }
        }
        return api.sendMessage(text, threadID, messageID);
    } catch (e) {
        api.setMessageReaction('❌', messageID, () => {}, true);
        return reply(deco.errorBox('تعذّر جلب معلومات الرابط. تأكد أنه رابط عام صحيح.\n' + (e.message || '')));
    }
};
