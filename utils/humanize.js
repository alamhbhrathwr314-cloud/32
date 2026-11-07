/**
 * ◈ ───『 سلوك شبيه بالبشر 』─── ◈
 * - يُظهر حالة "نشط الآن" ويجددها دوريًا
 * - يضع علامة "تمت القراءة" على كل رسالة واردة (مجموعات وخاص) حتى لو لم تكن أمرًا
 * - يُظهر "يكتب الآن..." قبل كل رد بمدة تناسب طول النص
 * - يرسل الردود بالتتابع مع فاصل عشوائي بدل إرسال دفعة واحدة
 *
 * لإيقافه: HUMANIZE=0
 * إيقاف حالة النشاط فقط: HUMAN_ONLINE=0
 * ضبط السرعة (اختياري): HUMAN_READ_MIN_MS, HUMAN_READ_MAX_MS, HUMAN_GAP_MIN_MS, HUMAN_GAP_MAX_MS
 * تجديد حالة النشاط (اختياري): HUMAN_ONLINE_REFRESH_MS (الافتراضي 4 دقائق)
 */
const log = require('./log');

const num = (name, def) => (process.env[name] !== undefined && !isNaN(Number(process.env[name])) ? Number(process.env[name]) : def);
const ENABLED = process.env.HUMANIZE !== '0';
const ONLINE = process.env.HUMAN_ONLINE !== '0';
const READ_MIN = num('HUMAN_READ_MIN_MS', 800);
const READ_MAX = num('HUMAN_READ_MAX_MS', 3500);
const GAP_MIN = num('HUMAN_GAP_MIN_MS', 1200);
const GAP_MAX = num('HUMAN_GAP_MAX_MS', 3000);
const ONLINE_REFRESH = num('HUMAN_ONLINE_REFRESH_MS', 4 * 60 * 1000);
const MAX_QUEUE = 60;           // حماية: لا نكدّس أكثر من هذا العدد من الردود المنتظرة

const sleep = ms => new Promise(r => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);

/* ─────────── علامة القراءة ─────────── */
const readTimers = new Map(); // threadID -> timer (دمج الرسائل المتتالية في قراءة واحدة)
const MESSAGE_TYPES = new Set(['message', 'message_reply']);

function onIncoming(api, event) {
    if (!ENABLED || !event || !event.threadID) return;
    // نتجاهل الأحداث التي ليست رسائل (كتابة، تفاعلات، تغيير اسم...)
    if (event.type && !MESSAGE_TYPES.has(event.type)) return;
    // نتجاهل رسائل الحساب نفسه
    try {
        const me = typeof api.getCurrentUserID === 'function' ? String(api.getCurrentUserID()) : null;
        if (me && String(event.senderID) === me) return;
    } catch (e) { /* تجاهل */ }

    const tid = String(event.threadID);
    const mid = event.messageID;

    // "وصلت" مباشرة، ثم "تمت القراءة" بعد تأخير عشوائي
    try {
        if (mid && typeof api.markAsDelivered === 'function') api.markAsDelivered(tid, mid, () => {});
    } catch (e) { /* تجاهل */ }

    if (readTimers.has(tid)) return;
    const t = setTimeout(() => {
        readTimers.delete(tid);
        try {
            if (typeof api.markAsRead === 'function') api.markAsRead(tid, true, () => {});
            else if (typeof api.markAsReadAll === 'function') api.markAsReadAll(() => {});
        } catch (e) { /* تجاهل */ }
    }, rand(READ_MIN, READ_MAX));
    readTimers.set(tid, t);
}

/* اعتراض الاستماع: كل رسالة واردة تمر على onIncoming حتى لو لم تطابق أي أمر */
function patchListen(api) {
    ['listenMqtt', 'listen'].forEach(key => {
        if (typeof api[key] !== 'function') return;
        const orig = api[key].bind(api);
        api[key] = function (...args) {
            const i = args.findIndex(a => typeof a === 'function');
            if (i !== -1) {
                const cb = args[i];
                args[i] = function (err, ev) {
                    if (!err && ev) { try { onIncoming(api, ev); } catch (e) { /* تجاهل */ } }
                    return cb.apply(this, arguments);
                };
            }
            return orig(...args);
        };
    });
}

/* ─────────── حالة النشاط ─────────── */
function keepOnline(api) {
    if (!ONLINE || typeof api.setOptions !== 'function') return;
    const set = () => { try { api.setOptions({ online: true }); } catch (e) { /* تجاهل */ } };
    set();
    const iv = setInterval(set, ONLINE_REFRESH);
    if (iv.unref) iv.unref();
}

/* ─────────── الإرسال البشري ─────────── */
function typingTime(msg) {
    const text = typeof msg === 'string' ? msg : (msg && msg.body) || '';
    const base = typeof msg === 'string' || (msg && msg.body) ? 500 + text.length * 30 : 700; // مرفقات بلا نص: مدة قصيرة
    return Math.min(base, 5000) * rand(0.8, 1.25);
}

function wrap(api) {
    if (!ENABLED || !api || api.__humanized) return api;
    const original = api.sendMessage.bind(api);
    let chain = Promise.resolve();
    let pending = 0;

    patchListen(api);
    keepOnline(api);

    api.sendMessage = function (msg, threadID, callback, replyMessageID) {
        // تدعم الاستدعاء بصيغة (msg, threadID, replyMessageID) أيضًا
        if (typeof callback === 'string' && replyMessageID === undefined) { replyMessageID = callback; callback = undefined; }
        if (pending >= MAX_QUEUE) {
            log('طابور الردود ممتلئ، تم تجاهل رد لحماية الحساب', 'warn');
            if (typeof callback === 'function') callback(new Error('queue full'));
            return;
        }
        pending++;
        chain = chain.then(async () => {
            let stopTyping = null;
            try {
                if (typeof api.sendTypingIndicator === 'function') {
                    try { stopTyping = api.sendTypingIndicator(String(threadID), () => {}); } catch (e) { /* تجاهل */ }
                }
                await sleep(typingTime(msg));
            } finally {
                try { if (typeof stopTyping === 'function') stopTyping(); } catch (e) { /* تجاهل */ }
            }
            original(msg, threadID, callback, replyMessageID);
            await sleep(rand(GAP_MIN, GAP_MAX));
        }).catch(e => log('خطأ في الإرسال البشري: ' + (e && e.message || e), 'warn'))
          .finally(() => { pending--; });
    };
    api.__humanized = true;
    log.loader(`وضع السلوك البشري مُفعّل (نشط + قراءة كل الرسائل + "يكتب الآن" + فواصل بين الردود)`);
    return api;
}

module.exports = { wrap, onIncoming };
