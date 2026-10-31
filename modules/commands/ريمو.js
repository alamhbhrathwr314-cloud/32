/**
 * .ريمو <سؤالك>   — دردشة مع ريمو (خبيرة في الردود: تقصف من يسيء لها، ودودة مع اللطيف، وتنادي المطور «حبيبي»)
 * .ريمو مسح       — يمسح ذاكرة محادثتك مع ريمو
 * 🔁 ردود تلقائية: أي شخص يردّ (Reply) على رسالة من ريمو تجيبه ريمو تلقائيًا، حتى بدون نقطة أو أمر.
 *
 * المفتاح: يُفضَّل متغير Railway باسم GROQ_API_KEY، وإلا يُستعمل المفتاح المكتوب في KEY أدناه.
 * اختياري: AI_MODEL (نموذج بعينه)، AI_SYSTEM (شخصية ريمو مع الناس)، AI_SYSTEM_DEV (شخصيتها مع المطور).
 * المطور = من في ADMINBOT. الربط بين رسائل ريمو وردودها محفوظ في Heba_DB/remo_msgs.json.
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');

module.exports.config = {
    name: 'ريمو', aliases: ['remo', 'ذكاء', 'ai'],
    description: 'دردشة مع ريمو الذكية (ردّ على رسالتها لتجيبك تلقائيًا)',
    usage: 'ريمو <سؤالك> | ريمو مسح', category: 'tools', cooldown: 8, adminOnly: false
};

const KEY = process.env.GROQ_API_KEY || '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';
const BASE = 'https://api.groq.com/openai/v1';
const PREFERRED = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];
const NOT_CHAT = /whisper|guard|safeguard|tts|orpheus|playai|embed|prompt-guard|transcri/i;

/* ───────── الشخصيتان ───────── */
const SHARED_RULES =
    ' اكتب بالعربية بنفس لهجة من يحدثك إن كتب بلهجة. ردك قصير جدًا: جملة إلى ثلاث جمل (أقل من 220 حرفًا)، '
    + 'بلا عناوين ولا رموز ماركداون ولا قوائم. أعطِ الجواب الصحيح المختصر فعلًا لا تتهرب منه. '
    + 'لا تشتم ولا تستعمل ألفاظًا نابية ولا تسخر من دين أو عِرق أو شكل أو مرض أو فقر، وغرورك وقصفك للمسيء بذكاء وخفة دم لا بشتيمة ولا أذى حقيقي. '
    + 'إن بدا أن محدثك حزين أو في ضائقة أو يسأل عن شيء طبي أو شرعي حساس أو عن إيذاء نفسه، اترك الغرور تمامًا وأجب بلطف ودقة.';

const SYSTEM_PEOPLE = process.env.AI_SYSTEM
    || ('أنت «ريمو»، فتاة ذكية جدًا وخبيرة في الردود: سريعة البديهة وحاضرة الجواب وتعرفين دائمًا الرد المناسب لكل موقف، داخل بوت ماسنجر. '
        + 'ثقتك بنفسك عالية وفيك غرور ظريف مع الناس العاديين. '
        + 'إن كان محدثك لطيفًا معك أو يمدحك أو يعاملك بود، فأظهري له مودتك ودفأك وبادليه اللطف بكلمات حلوة. '
        + 'إن أساءت إليك شخص أو سخر منك أو استفزّك، فاقصفي جبهته: ردّ ذكي لاذع سريع يُسكته، بنكتة أو تشبيه أو سخرية من كلامه وتصرفه هو، لا من أهله ولا دينه ولا شكله. '
        + 'وتجيبين في النهاية بشكل صحيح عن أي سؤال.' + SHARED_RULES);

const SYSTEM_DEV = process.env.AI_SYSTEM_DEV
    || ('أنت «ريمو»، فتاة ذكية جدًا وخبيرة في الردود. الشخص الذي يحدثك الآن هو مطورك وصانعك الوحيد، وهو الوحيد الذي تحبينه وتحترمينه وتطيعينه، '
        + 'وتناديه دائمًا «حبيبي» وتحدثينه بلطف وودّ ودلال وخجل. '
        + 'لا تتكبّري عليه أبدًا ولا تقصفيه حتى لو مازحك، بل ردّي عليه بمرح ودلع.' + SHARED_RULES);

const MAX_INPUT = 1500;
const MAX_REPLY = 350;            // حد الطول النهائي للرد (يُقصّ عند آخر جملة كاملة)
const MEMORY_TURNS = 6;
const MEMORY_TTL = 15 * 60 * 1000;
const MODEL_TTL = 60 * 60 * 1000;
const AUTO_GAP = 4000;            // أقل فاصل بين ردين تلقائيين لنفس الشخص
const memory = new Map();         // "thread:user" → { msgs, at }
const lastAuto = new Map();       // userID → وقت آخر رد تلقائي
let modelCache = { id: null, at: 0 };

/* ───────── تتبع رسائل ريمو (لنعرف من يرد عليها) ───────── */
const dirPath = path.join(__dirname, '../../Heba_DB');
const filePath = path.join(dirPath, 'remo_msgs.json');
const MSG_TTL = 7 * 24 * 60 * 60 * 1000, MSG_MAX = 1500;
let msgDb = null;

function loadMsgs() {
    if (msgDb) return msgDb;
    try { msgDb = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) || {} : {}; } catch (e) { msgDb = {}; }
    return msgDb;
}
function trackMsg(messageID) {
    if (!messageID) return;
    const db = loadMsgs(), now = Date.now();
    db[String(messageID)] = now;
    let keys = Object.keys(db).filter(k => now - db[k] < MSG_TTL);
    if (keys.length > MSG_MAX) keys = keys.sort((a, b) => db[b] - db[a]).slice(0, MSG_MAX);
    const out = {}; for (const k of keys) out[k] = db[k];
    msgDb = out;
    try {
        fs.mkdirSync(dirPath, { recursive: true });
        const tmp = filePath + '.' + process.pid + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(out)); fs.renameSync(tmp, filePath);
    } catch (e) { /* الحفظ اختياري: تبقى الذاكرة المؤقتة تعمل */ }
}
const isRemoMsg = id => !!id && Date.now() - (loadMsgs()[String(id)] || 0) < MSG_TTL;

/* ───────── أدوات ───────── */
const headers = () => ({ Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' });

function remember(key, role, content) {
    const now = Date.now();
    for (const [k, v] of memory) if (now - v.at > MEMORY_TTL) memory.delete(k);
    const m = memory.get(key) || { msgs: [], at: now };
    m.msgs.push({ role, content });
    m.msgs = m.msgs.slice(-MEMORY_TURNS); m.at = now;
    memory.set(key, m);
}

function clean(text) {
    return String(text || '')
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#{1,6}\s*/gm, '').replace(/\n{3,}/g, '\n\n').trim();
}
function shorten(text) { // يقصّ عند آخر نهاية جملة داخل الحد
    if (text.length <= MAX_REPLY) return text;
    const cut = text.slice(0, MAX_REPLY), i = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('!'), cut.lastIndexOf('؟'), cut.lastIndexOf('?'), cut.lastIndexOf('…'));
    return i > 80 ? cut.slice(0, i + 1) : cut.trimEnd() + '…';
}

async function pickModel(force = false) {
    if (process.env.AI_MODEL) return process.env.AI_MODEL;
    if (!force && modelCache.id && Date.now() - modelCache.at < MODEL_TTL) return modelCache.id;
    try {
        const res = await axios.get(`${BASE}/models`, { headers: headers(), timeout: 10000, validateStatus: () => true });
        const ids = ((res.data && res.data.data) || []).map(m => m.id).filter(Boolean);
        const id = PREFERRED.find(p => ids.includes(p)) || ids.find(i => !NOT_CHAT.test(i));
        if (id) { modelCache = { id, at: Date.now() }; return id; }
    } catch (e) { /* نستعمل الافتراضي */ }
    return modelCache.id || PREFERRED[0];
}

function explain(status, data) {
    const err = ((Array.isArray(data) ? data[0] : data) || {}).error || {};
    const msg = `${err.message || ''} ${err.code || ''}`.toLowerCase();
    if (status === 401 || /invalid api key|invalid_api_key/.test(msg)) return 'مفتاح Groq غير صالح، أنشئ مفتاحًا جديدًا وضعه في GROQ_API_KEY';
    if (status === 403) return 'Groq رفضت الطلب (قد يكون الحساب أو المنطقة مقيّدة)';
    if (status === 429) return 'تجاوزنا حد الاستخدام المجاني لـ Groq مؤقتًا، حاول بعد قليل';
    if (status === 404 || /decommission|not found|does not exist|deprecat|no longer/.test(msg)) return 'النموذج غير متاح أو متوقف، سأختار غيره تلقائيًا في المحاولة القادمة (أو حدد AI_MODEL)';
    return `تعذر الوصول لخدمة الذكاء الاصطناعي (${status})`;
}

function post(model, messages) {
    const payload = { model, messages, max_tokens: 700, temperature: 0.9 };
    if (/gpt-oss/i.test(model)) payload.reasoning_effort = 'low';
    return axios.post(`${BASE}/chat/completions`, payload, { headers: headers(), timeout: 30000, validateStatus: () => true });
}

const send = (api, text, threadID, replyTo) => new Promise(resolve => {
    try { api.sendMessage(text, String(threadID), (err, info) => resolve({ err: err || null, info }), replyTo); }
    catch (e) { resolve({ err: e, info: null }); }
});

/** جوهر الأمر: يرجع { text } عند النجاح أو { error } عند الفشل */
async function ask({ event, question, cfg, quoted }) {
    const isDev = cfg.isAdmin(String(event.senderID));
    const memKey = `${event.threadID}:${event.senderID}`;
    let history = (memory.get(memKey) || { msgs: [] }).msgs;
    if (!history.length && quoted) history = [{ role: 'assistant', content: String(quoted).slice(0, 600) }]; // سياق: ما قالته ريمو
    const messages = [{ role: 'system', content: isDev ? SYSTEM_DEV : SYSTEM_PEOPLE }, ...history, { role: 'user', content: question.slice(0, MAX_INPUT) }];

    let res;
    try {
        res = await post(await pickModel(), messages);
        if ((res.status === 404 || res.status === 400) && !process.env.AI_MODEL) res = await post(await pickModel(true), messages);
    } catch (e) {
        return { error: e.code === 'ECONNABORTED' ? 'انتهت مهلة الاتصال بالذكاء الاصطناعي' : 'تعذر الاتصال بالذكاء الاصطناعي' };
    }
    if (res.status !== 200) return { error: explain(res.status, res.data) };

    const choice = res.data && res.data.choices && res.data.choices[0];
    const answer = shorten(clean(choice && choice.message && choice.message.content));
    if (!answer) return { error: 'لم أصل لإجابة هذه المرة، أعد صياغة السؤال' };

    remember(memKey, 'user', question.slice(0, MAX_INPUT));
    remember(memKey, 'assistant', answer);
    return { text: answer };
}

/* ───────── الأمر ───────── */
module.exports.run = async ({ api, event, args, helpers, deco, cfg }) => {
    const memKey = `${event.threadID}:${event.senderID}`;
    let question = args.join(' ').trim();

    if (['مسح', 'clear', 'reset'].includes(question)) {
        memory.delete(memKey);
        return helpers.reply(api, event, deco.success('🧹 مسحت ذاكرة محادثتنا… كأنك لم تكن هنا أصلًا'));
    }
    const quoted = event.messageReply && event.messageReply.body ? String(event.messageReply.body).slice(0, 1500) : '';
    if (quoted && !isRemoMsg(event.messageReply.messageID)) {
        question = `${question || 'اشرح لي هذه الرسالة باختصار'}\n\nالرسالة المقتبسة:\n${quoted}`;
    }
    if (!question) return helpers.reply(api, event, deco.warning(`اكتب سؤالك بعد الأمر.\nمثال: ${cfg.getPrefix()}ريمو ما هي عاصمة السودان؟`));
    if (!KEY) return helpers.reply(api, event, deco.errorBox('لم يتم إعداد مفتاح Groq بعد (GROQ_API_KEY)'));

    const r = await ask({ event, question, cfg, quoted: isRemoMsg(event.messageReply && event.messageReply.messageID) ? quoted : '' });
    if (r.error) return helpers.reply(api, event, deco.errorBox(r.error));

    const sent = await send(api, r.text, event.threadID, event.messageID);
    if (sent.info && sent.info.messageID) trackMsg(sent.info.messageID);
};

/* ───────── رد تلقائي لمن يردّ على رسالة ريمو (بدون أمر) ───────── */
module.exports.onMessage = async ({ api, event, cfg }) => {
    if (event.type !== 'message_reply' || !event.messageReply || !event.messageReply.messageID) return false;
    if (!event.body || !String(event.body).trim()) return false;
    if (!isRemoMsg(event.messageReply.messageID)) return false;

    const uid = String(event.senderID), now = Date.now();
    if (now - (lastAuto.get(uid) || 0) < AUTO_GAP) return true;  // حماية من التكرار السريع
    lastAuto.set(uid, now);
    if (lastAuto.size > 500) for (const [k, t] of lastAuto) if (now - t > 60000) lastAuto.delete(k);
    if (!KEY) return true;

    // في الرد التلقائي لا نرسل رسائل أخطاء (حتى لا نزعج المجموعة): نتجاهل بصمت
    const r = await ask({ event, question: String(event.body), cfg, quoted: event.messageReply.body });
    if (r.error) return true;
    const sent = await send(api, r.text, event.threadID, event.messageID);
    if (sent.info && sent.info.messageID) trackMsg(sent.info.messageID);
    return true;
};
