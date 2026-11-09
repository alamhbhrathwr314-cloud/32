/**
 * ◈ ───『 السلوك البشري — humanize.js 』─── ◈
 * يضع في utils/humanize.js. يستدعيه main.js:
 *   humanize.wrap(api)            عند تسجيل الدخول (يلفّ api.sendMessage)
 *   humanize.onIncoming(api, ev)  عند كل رسالة واردة (قراءة متأخرة طبيعية)
 *
 * ماذا يفعل:
 *  1) «تمت القراءة» بعد تأخير عشوائي، لا فورًا.
 *  2) قبل كل رد: وقت تفكير ثم مؤشر «يكتب...» بمدة تناسب طول النص.
 *  3) الردود في نفس المحادثة تُرسل بالتتابع مع فاصل عشوائي (لا رشق متزامن).
 *  4) حد أدنى للفاصل بين أي رسالتين من الحساب (يخفف الضغط على الحساب).
 *  5) إن تراكمت الردود تُسرَّع الانتظارات تلقائيًا حتى لا يتأخر الرد كثيرًا.
 *
 * كل القيم تُضبط بمتغيرات بيئة (اختيارية). HUMANIZE=0 يعطّل الملف كله.
 */
const num = (name, def) => {
    const raw = process.env[name];
    if (raw === undefined || raw === '') return def;
    const v = Number(raw);
    return Number.isFinite(v) ? v : def;
};

const CFG = {
    get enabled() { return process.env.HUMANIZE !== '0'; },
    readMin: num('HUMAN_READ_MIN_MS', 700),       // تأخير «تمت القراءة»
    readMax: num('HUMAN_READ_MAX_MS', 4000),
    thinkMin: num('HUMAN_THINK_MIN_MS', 400),     // «تفكير» قبل بدء الكتابة
    thinkMax: num('HUMAN_THINK_MAX_MS', 1800),
    cpm: num('HUMAN_CPM', 320),                   // سرعة الكتابة (حرف/دقيقة)
    typeMinMs: num('HUMAN_TYPE_MIN_MS', 600),
    typeMaxMs: num('HUMAN_TYPE_MAX_MS', 8000),
    mediaTypeMin: num('HUMAN_MEDIA_MIN_MS', 800), // رسائل المرفقات بلا نص
    mediaTypeMax: num('HUMAN_MEDIA_MAX_MS', 2000),
    gapMin: num('HUMAN_GAP_MIN_MS', 900),         // فاصل بين رسائل نفس المحادثة
    gapMax: num('HUMAN_GAP_MAX_MS', 2600),
    globalGap: num('HUMAN_GLOBAL_GAP_MS', 400),   // أقل فاصل بين أي رسالتين من الحساب
    warmMs: num('HUMAN_WARM_MS', 20000),          // محادثة «نشطة»: تفكير أقصر
    backlog: num('HUMAN_BACKLOG', 4)              // عدد الردود المتراكمة قبل التسريع
};

const sleep = ms => new Promise(r => setTimeout(r, Math.max(0, ms)));
const rand = (a, b) => a + Math.random() * Math.max(0, b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const stats = { sent: 0, queuedNow: 0, lastSendAt: 0 };
const queues = new Map();       // threadID -> آخر وعد في السلسلة
const lastThreadSend = new Map(); // threadID -> وقت آخر إرسال
const readTimers = new Map();   // threadID -> مؤقت «تمت القراءة»
let sendGate = Promise.resolve(); // يضمن الفاصل العام بين الرسائل

function textLength(msg) {
    if (typeof msg === 'string') return msg.length;
    if (msg && typeof msg.body === 'string') return msg.body.length;
    return 0;
}

function hasMedia(msg) {
    return !!(msg && typeof msg === 'object' && (msg.attachment || msg.sticker || msg.url));
}

/** يبدأ مؤشر «يكتب...» ويرجع دالة لإيقافه، مع تحمّل اختلاف المكتبات */
function startTyping(api, threadID) {
    const noop = () => {};
    try {
        if (typeof api.sendTypingIndicator !== 'function') return noop;
        const r = api.sendTypingIndicator(String(threadID), () => {});
        if (typeof r === 'function') return () => { try { r(() => {}); } catch (e) { /* تجاهل */ } };
        if (r && typeof r.then === 'function') {
            let end = null;
            r.then(e => { end = e; }).catch(() => {});
            return () => { try { if (typeof end === 'function') end(() => {}); } catch (e) { /* تجاهل */ } };
        }
    } catch (e) { /* تجاهل */ }
    return noop;
}

/** يضمن حدًا أدنى للفاصل بين أي رسالتين خارجتين من الحساب */
function globalSlot() {
    const turn = sendGate.then(async () => {
        const wait = stats.lastSendAt + CFG.globalGap + rand(0, CFG.globalGap) - Date.now();
        if (wait > 0) await sleep(wait);
        stats.lastSendAt = Date.now();
    });
    sendGate = turn.catch(() => {});
    return turn;
}

function typingDuration(msg, speedUp) {
    const len = textLength(msg);
    let ms;
    if (len > 0) ms = (len / (CFG.cpm / 60000)) * rand(0.75, 1.2);
    else ms = hasMedia(msg) ? rand(CFG.mediaTypeMin, CFG.mediaTypeMax) : CFG.typeMinMs;
    return clamp(ms * speedUp, CFG.typeMinMs * speedUp, CFG.typeMaxMs);
}

/**
 * يلفّ api.sendMessage. التوقيعات المدعومة تبقى كما هي:
 *   sendMessage(msg, threadID, callback?, replyToMessageID?, isGroup?)
 *   sendMessage(msg, threadID, replyToMessageID)   (نمط قديم)
 */
function wrap(api) {
    if (!api || api.__humanized || typeof api.sendMessage !== 'function') return api;
    const original = api.sendMessage.bind(api);

    api.sendMessage = function humanSendMessage(msg, threadID, callback, replyTo, ...rest) {
        if (typeof callback !== 'function') {
            if (typeof callback === 'string' && replyTo === undefined) replyTo = callback;
            callback = undefined;
        }
        // تعطيل، أو إرسال لعدة محادثات دفعة واحدة: نمرّر كما هو
        if (!CFG.enabled || Array.isArray(threadID)) return original(msg, threadID, callback, replyTo, ...rest);

        const key = String(threadID);
        return new Promise((resolve, reject) => {
            const job = async () => {
                const depth = stats.queuedNow;
                const speedUp = depth >= CFG.backlog ? 0.4 : depth >= 2 ? 0.7 : 1;
                const warm = Date.now() - (lastThreadSend.get(key) || 0) < CFG.warmMs;

                await sleep(rand(CFG.thinkMin, CFG.thinkMax) * (warm ? 0.5 : 1) * speedUp);
                const stopTyping = startTyping(api, key);
                await sleep(typingDuration(msg, speedUp));
                await globalSlot();
                stopTyping();

                await new Promise(done => {
                    const finish = (err, info) => {
                        lastThreadSend.set(key, Date.now());
                        stats.sent++;
                        try { if (callback) callback(err, info); } catch (e) { /* تجاهل */ }
                        if (err && !callback) reject(err); else resolve(err ? undefined : info);
                        done();
                    };
                    try { original(msg, threadID, finish, replyTo, ...rest); }
                    catch (e) { finish(e); }
                });
            };

            stats.queuedNow++;
            const prev = queues.get(key) || Promise.resolve();
            const next = prev
                .then(job)
                .catch(e => { if (!callback) reject(e); else try { callback(e); } catch (x) { /* تجاهل */ } })
                .then(() => sleep(rand(CFG.gapMin, CFG.gapMax) * (stats.queuedNow > CFG.backlog ? 0.4 : 1)))
                .finally(() => {
                    stats.queuedNow = Math.max(0, stats.queuedNow - 1);
                    if (queues.get(key) === next) queues.delete(key);
                });
            queues.set(key, next);
        });
    };

    api.__humanized = true;
    api.__humanStats = stats;
    return api;
}

/** رسالة واردة: «تمت القراءة» بعد مهلة عشوائية (آخر رسالة في المحادثة هي التي تُقرأ) */
function onIncoming(api, event) {
    if (!CFG.enabled || !api || !event || !event.threadID) return;
    if (typeof api.markAsRead !== 'function') return;
    const key = String(event.threadID);
    clearTimeout(readTimers.get(key));
    const t = setTimeout(() => {
        readTimers.delete(key);
        try {
            const r = api.markAsRead(key, true, () => {});
            if (r && typeof r.catch === 'function') r.catch(() => {});
        } catch (e) { /* تجاهل */ }
    }, rand(CFG.readMin, CFG.readMax));
    if (typeof t.unref === 'function') t.unref();
    readTimers.set(key, t);
}

module.exports = { wrap, onIncoming, config: CFG, stats };
