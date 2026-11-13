/**
 * .تخيل <وصف>  — توليد صورة بالذكاء الاصطناعي من وصف نصي (مجاني)
 *
 * أمثلة:
 *   .تخيل قطة ترتدي نظارة شمسية على الشاطئ
 *   .تخيل a cyberpunk city at night, neon lights
 *
 * المزوّدون بالترتيب (يُتخطّى من لا مفتاح له):
 *   1) Cloudflare Workers AI (FLUX schnell) — الأساسي، مجاني بلا بطاقة (10,000 نيرون/يوم ≈ 170 صورة)
 *   2) Google Gemini (صورة) — إن وُجد GEMINI_API_KEY (الخطة المجانية قد تتغيّر، تحقق منها في AI Studio)
 *   3) Pollinations — احتياط أخير مجاني بلا مفتاح
 * ترجمة الوصف العربي للإنجليزية (تحسّن النتيجة كثيرًا): تلقائية إن وُجد GROQ_API_KEY، وإلا يُرسل الوصف كما هو.
 *
 * متغيرات البيئة (كلها اختيارية):
 *   GROQ_API_KEY          لترجمة الوصف العربي إلى الإنجليزية (نفس مفتاح ريمو)
 *   POLLINATIONS_KEY      مفتاح Pollinations إن أردت حدًّا أعلى (غير لازم)
 *   CF_API_TOKEN          توكن Cloudflare (صلاحيتا Workers AI + Account Settings Read) — يكفي وحده
 *   CF_ACCOUNT_ID         اختياري؛ إن لم يُوضع يُجلب تلقائيًا من التوكن
 *   GEMINI_API_KEY        مزوّد Gemini الاختياري (GEMINI_IMAGE_MODEL لتغيير النموذج)
 *   IMAGINE_DAILY_PER_USER  عدد الصور اليومي لكل عضو عادي (افتراضي 8، المطور بلا حد)
 *   IMAGINE_DAILY_TOTAL     سقف يومي للبوت كله (افتراضي 150)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const axios = require('axios');

module.exports.config = {
    name: 'تخيل', aliases: ['imagine', 'ارسم', 'توليد', 'صورة_ذكاء'],
    description: 'توليد صورة بالذكاء الاصطناعي من وصف نصي',
    usage: 'تخيل <وصف الصورة>', category: 'media', cooldown: 20, adminOnly: false
};

const PER_USER = Number(process.env.IMAGINE_DAILY_PER_USER) || 8;
const TOTAL = Number(process.env.IMAGINE_DAILY_TOTAL) || 150;
const MAX_PROMPT = 400;

let busy = false;
const usage = new Map();
const total = { day: '', n: 0 };
const today = () => new Date().toISOString().slice(0, 10);
const sleep = ms => new Promise(r => setTimeout(r, ms));

function takeQuota(uid, isAdmin) {
    if (total.day !== today()) { total.day = today(); total.n = 0; }
    if (total.n >= TOTAL) return 'total';
    if (!isAdmin) {
        const u = usage.get(uid);
        if (!u || u.day !== today()) usage.set(uid, { day: today(), n: 1 });
        else if (u.n >= PER_USER) return 'user';
        else u.n++;
    }
    total.n++;
    return null;
}
function refundQuota(uid, isAdmin) {
    if (total.n > 0) total.n--;
    if (!isAdmin) { const u = usage.get(uid); if (u && u.n > 0) u.n--; }
}

/** ترجمة الوصف إلى إنجليزية عبر Groq (اختياري؛ عند أي فشل يُستعمل الوصف الأصلي) */
async function toEnglish(text) {
    const key = process.env.GROQ_API_KEY;
    if (!key || !/[\u0600-\u06FF]/.test(text)) return text;
    try {
        const r = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: 'llama-3.1-8b-instant',
            temperature: 0.3,
            max_tokens: 200,
            messages: [
                { role: 'system', content: 'Translate the user text into a vivid, concise English image-generation prompt. Output only the prompt, nothing else.' },
                { role: 'user', content: text }
            ]
        }, { headers: { Authorization: `Bearer ${key}` }, timeout: 15000 });
        const out = String(r.data?.choices?.[0]?.message?.content || '').trim().replace(/^["']|["']$/g, '');
        return out || text;
    } catch (e) { return text; }
}

/* ─────────── المزوّدون ─────────── */
async function viaPollinations(prompt) {
    const seed = Math.floor(Math.random() * 1e9);
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
        `?width=1024&height=1024&model=flux&nologo=true&private=true&seed=${seed}`;
    const headers = process.env.POLLINATIONS_KEY ? { Authorization: `Bearer ${process.env.POLLINATIONS_KEY}` } : {};
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 90000, headers, maxContentLength: 25 * 1024 * 1024 });
            const type = String(r.headers['content-type'] || '');
            if (!/image\//i.test(type)) throw Object.assign(new Error('not an image'), { code: 'BAD_TYPE' });
            return { buf: Buffer.from(r.data), type };
        } catch (e) {
            const st = e && e.response && e.response.status;
            if (attempt === 0 && (st === 429 || st === 502 || st === 503 || e.code === 'ECONNABORTED')) { await sleep(16000); continue; }
            throw e;
        }
    }
}

let cfAccountId = null;
/** معرّف الحساب: من CF_ACCOUNT_ID إن وُجد، وإلا يُجلب تلقائيًا من التوكن (يحتاج صلاحية Account Settings: Read) */
async function getCfAccountId(token) {
    if (process.env.CF_ACCOUNT_ID) return String(process.env.CF_ACCOUNT_ID).trim();
    if (cfAccountId) return cfAccountId;
    const r = await axios.get('https://api.cloudflare.com/client/v4/accounts', {
        headers: { Authorization: `Bearer ${token}` }, timeout: 20000
    });
    const id = r.data?.result?.[0]?.id;
    if (!id) throw new Error('cloudflare: لا يوجد حساب يظهر لهذا التوكن (أضف صلاحية Account Settings: Read أو ضع CF_ACCOUNT_ID)');
    cfAccountId = id;
    return id;
}

async function viaCloudflare(prompt) {
    const token = process.env.CF_API_TOKEN;
    if (!token) return null;
    const id = await getCfAccountId(token);
    const r = await axios.post(
        `https://api.cloudflare.com/client/v4/accounts/${id}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
        { prompt, steps: 4 },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 90000 }
    );
    const b64 = r.data?.result?.image;
    if (!b64) throw new Error('cloudflare: no image');
    return { buf: Buffer.from(b64, 'base64'), type: 'image/jpeg' };
}

async function viaGemini(prompt) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return null;
    const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
    const r = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        { contents: [{ parts: [{ text: prompt }] }] },
        { headers: { 'x-goog-api-key': key }, timeout: 90000 }
    );
    const parts = r.data?.candidates?.[0]?.content?.parts || [];
    const img = parts.find(x => x.inlineData && x.inlineData.data);
    if (!img) throw new Error('gemini: no image');
    return { buf: Buffer.from(img.inlineData.data, 'base64'), type: img.inlineData.mimeType || 'image/png' };
}

/** الترتيب: Cloudflare ← Gemini ← Pollinations (يُتخطّى كل مزوّد لا مفتاح له، وPollinations يعمل بلا مفتاح) */
async function generate(prompt) {
    let lastErr = null;
    for (const fn of [viaCloudflare, viaGemini, viaPollinations]) {
        try { const r = await fn(prompt); if (r) return r; }
        catch (e) {
            lastErr = e;
            console.error('[تخيل]', fn.name, 'status=' + (e && e.response && e.response.status), String((e && e.message) || '').slice(0, 160));
        }
    }
    throw lastErr || new Error('no provider');
}

/* ─────────── الأمر ─────────── */
module.exports.run = async ({ api, event, args, helpers, deco, cfg }) => {
    const reply = t => helpers.reply(api, event, t);
    const p = cfg.getPrefix();
    const uid = String(event.senderID);
    const isAdmin = cfg.isAdmin(uid);

    let prompt = args.join(' ').trim();
    if (!prompt && event.messageReply && event.messageReply.body) prompt = String(event.messageReply.body).trim();

    if (!prompt) {
        return reply(deco.infoBox('توليد الصور بالذكاء الاصطناعي', [
            `🎨 اكتب ${p}تخيل <وصف الصورة>`,
            `مثال: ${p}تخيل قطة ترتدي نظارة شمسية على الشاطئ`,
            `مثال: ${p}تخيل مدينة مستقبلية في الليل بأضواء نيون`,
            `💡 كلما كان الوصف أدق كانت الصورة أجمل`
        ].join('\n')));
    }
    if (prompt.length > MAX_PROMPT) return reply(deco.warning(`الوصف طويل، اختصره إلى ${MAX_PROMPT} حرفًا`));
    if (busy) return reply(deco.warning('البوت مشغول بتوليد صورة أخرى، حاول بعد قليل'));

    const denied = takeQuota(uid, isAdmin);
    if (denied === 'user') return reply(deco.warning(`وصلت حدّك اليومي (${PER_USER} صور). جرّب غدًا`));
    if (denied === 'total') return reply(deco.warning('وصل البوت إلى حدّه اليومي من الصور. جرّب غدًا'));

    busy = true;
    let ok = false, wait = null, file = null;
    try {
        wait = await reply(deco.title('🎨 جاري رسم الصورة...'));

        const en = await toEnglish(prompt);
        const { buf, type } = await generate(en);

        const ext = /png/.test(type) ? 'png' : /webp/.test(type) ? 'webp' : 'jpg';
        file = path.join(os.tmpdir(), `kira-imagine-${Date.now()}-${Math.floor(Math.random() * 1e6)}.${ext}`);
        fs.writeFileSync(file, buf);

        const sent = await new Promise(resolve => {
            const stream = fs.createReadStream(file);
            stream.on('error', () => {});
            try { api.sendMessage({ body: `🎨 ${prompt}`, attachment: stream }, event.threadID, e => resolve(!e), event.messageID); }
            catch (e) { resolve(false); }
        });
        if (!sent) return reply(deco.errorBox('تم توليد الصورة لكن تعذّر إرسالها'));

        ok = true;
        if (wait && wait.messageID && typeof api.unsendMessage === 'function') api.unsendMessage(String(wait.messageID), () => {});
    } catch (e) {
        const st = e && e.response && e.response.status;
        console.error('[تخيل]', 'status=' + st, 'code=' + (e && e.code), String((e && e.message) || '').slice(0, 300));
        const msg = st === 429 ? 'الخدمة مزدحمة الآن، حاول بعد دقيقة'
            : 'تعذّر توليد الصورة، جرّب وصفًا آخر أو حاول بعد قليل';
        await reply(deco.errorBox(msg));
    } finally {
        busy = false;
        if (!ok) refundQuota(uid, isAdmin);
        if (file) fs.unlink(file, () => {});
    }
};
