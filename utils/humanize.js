/**
 * ◈ ───『 السلوك البشري — humanize.js 』─── ◈
 * يضع في utils/humanize.js. يستدعيه main.js:
 *   humanize.wrap(api)            عند تسجيل الدخول (يلفّ api.sendMessage)
 *   humanize.onIncoming(api, ev)  عند كل رسالة واردة (قراءة متأخرة + تفاعل أحيانًا)
 *   humanize.startLife(api, {})   عند تسجيل الدخول (النوم المجدول + رسائل المطور + تبديل الأسلوب)
 *   humanize.stopLife()           عند انقطاع الاتصال
 *   humanize.offlineLeft()        كم بقي من وقت النوم بالمللي ثانية (0 = مستيقظ)
 *
 * ماذا يفعل:
 *  1) «تمت القراءة» بعد تأخير عشوائي، لا فورًا.
 *  2) قبل كل رد: وقت تفكير ثم مؤشر «يكتب...» بمدة تناسب طول النص.
 *  3) الردود في نفس المحادثة تُرسل بالتتابع مع فاصل عشوائي (لا رشق متزامن).
 *  4) حد أدنى للفاصل بين أي رسالتين من الحساب، وتسريع تلقائي عند التراكم.
 *  5) 😴 النوم: يقطع البوت اتصاله بفيسبوك 8 ساعات يوميًا (من منتصف الليل حتى الصباح) ثم يعود.
 *  6) ❤️ التفاعل: يضع تفاعلًا (إيموجي) على بعض الرسائل الواردة بلا إفراط.
 *  7) 🚫 منع التكرار: لا يرسل البوت نفس النص مرتين متتاليتين في نفس المحادثة خلال مهلة قصيرة.
 *  8) 🗣️ الأسلوب: يتبدّل أسلوب كلامه (ودود/مرِح/هادئ/حماسي) كل بضع ساعات.
 *  9) 📩 يراسل المطور الرئيسي في الخاص برسائل تلقائية متنوعة لا تتكرر (تحية صباح، تقرير، اطمئنان، تصبح على خير).
 *
 * كل القيم تُضبط بمتغيرات بيئة (اختيارية):
 *   HUMANIZE=0                 يعطّل الملف كله
 *   HUMAN_SLEEP=0              يعطّل النوم فقط
 *   HUMAN_SLEEP_AT=00:00       وقت بدء النوم (يمكن أكثر من وقت: 00:00,14:00)
 *   HUMAN_SLEEP_MIN=480        مدة النوم بالدقائق (480 = 8 ساعات)
 *   HUMAN_SLEEP_START_JITTER_MIN=10   تقديم/تأخير عشوائي لوقت البدء (±دقائق، ثابت خلال اليوم الواحد)
 *   HUMAN_SLEEP_LEN_JITTER_MIN=0      تفاوت عشوائي في المدة
 *   HUMAN_TZ=Africa/Khartoum   المنطقة الزمنية لحساب منتصف الليل
 *   HUMAN_REACT=0              يعطّل التفاعل • HUMAN_REACT_CHANCE=0.08 احتمال التفاعل مع رسالة عادية
 *   HUMAN_DEDUPE_MS=20000      مهلة منع التكرار (0 = معطّل)
 *   HUMAN_DM=0                 يعطّل رسائل المطور • HUMAN_DM_PER_DAY=4 • HUMAN_DM_MIN_GAP_MIN=120
 *   HUMAN_VOICE_MIN_H=3 / HUMAN_VOICE_MAX_H=8   مدة بقاء الأسلوب الواحد
 *   HUMAN_STATE_FILE           مسار ملف الحالة (الافتراضي Heba_DB/human_state.json)
 */
const fs = require('fs');
const path = require('path');

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
    backlog: num('HUMAN_BACKLOG', 4),             // عدد الردود المتراكمة قبل التسريع
    get dedupeMs() { return Math.max(0, num('HUMAN_DEDUPE_MS', 20000)); }
};

const sleep = ms => new Promise(r => setTimeout(r, Math.max(0, ms)));
const rand = (a, b) => a + Math.random() * Math.max(0, b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const stats = { sent: 0, reacts: 0, deduped: 0, queuedNow: 0, lastSendAt: 0 };
const queues = new Map();       // threadID -> آخر وعد في السلسلة
const lastThreadSend = new Map(); // threadID -> وقت آخر إرسال
const readTimers = new Map();   // threadID -> مؤقت «تمت القراءة»
let sendGate = Promise.resolve(); // يضمن الفاصل العام بين الرسائل

function textLength(msg) {
    if (typeof msg === 'string') return msg.length;
    if (msg && typeof msg.body === 'string') return msg.body.length;
    return 0;
}

const recentOut = new Map(); // threadID+نص ← { at, p }

/** مفتاح منع التكرار: للنصوص الخالصة فقط (الرسائل ذات المرفقات لا تُعدّ مكررة) */
function dedupeKey(msg, replyTo) {
    if (!(CFG.dedupeMs > 0)) return null;
    const body = typeof msg === 'string' ? msg : (msg && typeof msg.body === 'string' && !hasMedia(msg) && !msg.mentions ? msg.body : null);
    if (!body || !body.trim()) return null;
    return String(replyTo || '') + '\u0002' + body.trim();
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

        // أثناء النوم لا نرسل شيئًا (الاتصال مقطوع أصلًا)
        if (isAsleep()) {
            const err = Object.assign(new Error('البوت نائم الآن'), { code: 'ASLEEP' });
            if (callback) { try { callback(err); } catch (e) { /* تجاهل */ } return Promise.resolve(undefined); }
            return Promise.reject(err);
        }

        const key = String(threadID);

        // منع التكرار: نفس النص (ونفس الرسالة المردود عليها) في نفس المحادثة خلال مهلة قصيرة
        const dkey = dedupeKey(msg, replyTo);
        if (dkey) {
            const hit = recentOut.get(key + '\u0001' + dkey);
            if (hit && Date.now() - hit.at < CFG.dedupeMs) {
                stats.deduped++;
                return hit.p.then(
                    info => { try { if (callback) callback(null, info); } catch (e) { /* تجاهل */ } return info; },
                    err => { try { if (callback) callback(err); } catch (e) { /* تجاهل */ } if (!callback) throw err; }
                );
            }
        }

        const outPromise = new Promise((resolve, reject) => {
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
        if (dkey) {
            const now = Date.now();
            for (const [k, v] of recentOut) if (now - v.at > CFG.dedupeMs) recentOut.delete(k);
            recentOut.set(key + '\u0001' + dkey, { at: now, p: outPromise.catch(() => undefined) });
        }
        return outPromise;
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
    try { maybeReact(api, event); } catch (e) { /* تجاهل */ }
}

/* ═══════════════════ الوقت والمنطقة الزمنية ═══════════════════ */
const toLatin = t => String(t || '').replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x660));
const fmtCache = new Map();
function dtf(tz) {
    let f = fmtCache.get(tz);
    if (!f) {
        try {
            f = new Intl.DateTimeFormat('en-US', {
                timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            });
        } catch (e) { f = tz === 'UTC' ? null : dtf('UTC'); }
        fmtCache.set(tz, f);
    }
    return f;
}
const tzName = () => process.env.HUMAN_TZ || 'Africa/Khartoum';

/** أجزاء الوقت المحلي في المنطقة الزمنية */
function localParts(ms, tz = tzName()) {
    const p = dtf(tz).formatToParts(new Date(ms));
    const g = t => Number((p.find(x => x.type === t) || {}).value || 0);
    return { y: g('year'), m: g('month') - 1, d: g('day'), hh: g('hour') % 24, mm: g('minute'), ss: g('second') };
}
const tzOffset = (ms, tz) => {
    const p = localParts(ms, tz);
    return Date.UTC(p.y, p.m, p.d, p.hh, p.mm, p.ss) - Math.floor(ms / 1000) * 1000;
};
/** وقت محلي (يوم + ساعة + دقيقة) إلى لحظة UTC بالمللي ثانية */
function localToEpoch(y, m, d, hh, mm, tz) {
    const guess = Date.UTC(y, m, d, hh, mm);
    let t = guess - tzOffset(guess, tz);
    t = guess - tzOffset(t, tz);
    return t;
}
const pad2 = n => String(n).padStart(2, '0');
const dayKey = (ms = Date.now()) => { const p = localParts(ms); return `${p.y}-${pad2(p.m + 1)}-${pad2(p.d)}`; };
const clockStr = (ms = Date.now()) => { const p = localParts(ms); return `${pad2(p.hh)}:${pad2(p.mm)}`; };

function seeded(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    let a = h >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

/* ═══════════════════ 😴 النوم المجدول ═══════════════════ */
const SLEEP = {
    get enabled() { return false; },   // النوم وقطع الاتصال معطّلان نهائيًا: البوت يبقى متصلًا دائمًا
    get at() {
        const out = [];
        for (const s of toLatin(process.env.HUMAN_SLEEP_AT || '00:00').split(',')) {
            const m = s.trim().match(/^(\d{1,2}):(\d{2})$/);
            if (m && +m[1] < 24 && +m[2] < 60) out.push([+m[1], +m[2]]);
        }
        return out.length ? out : [[0, 0]];
    },
    get mins() {
        const out = toLatin(process.env.HUMAN_SLEEP_MIN || '480').split(',').map(x => Number(x.trim())).filter(x => x > 0);
        return out.length ? out : [480];
    },
    get startJitter() { return Math.max(0, num('HUMAN_SLEEP_START_JITTER_MIN', 10)); },
    get lenJitter() { return Math.max(0, num('HUMAN_SLEEP_LEN_JITTER_MIN', 0)); }
};

/** نوافذ النوم حول لحظة معيّنة (أمس واليوم وغدًا). التفاوت العشوائي ثابت لكل يوم فلا يتغير بين استدعاء وآخر */
function windows(now = Date.now()) {
    const tz = tzName(), base = localParts(now, tz), at = SLEEP.at, mins = SLEEP.mins, out = [];
    for (let dd = -1; dd <= 1; dd++) {
        const day = new Date(Date.UTC(base.y, base.m, base.d + dd));
        const y = day.getUTCFullYear(), m = day.getUTCMonth(), d = day.getUTCDate();
        at.forEach(([hh, mm], i) => {
            const rnd = seeded(`${y}-${m}-${d}-${i}`);
            const startJ = (rnd() * 2 - 1) * SLEEP.startJitter * 60000;
            const lenJ = (rnd() * 2 - 1) * SLEEP.lenJitter * 60000;
            const start = Math.round(localToEpoch(y, m, d, hh, mm, tz) + startJ);
            const len = Math.max(60000, Math.round(mins[i % mins.length] * 60000 + lenJ));
            out.push({ start, end: start + len });
        });
    }
    return out.sort((a, b) => a.start - b.start);
}

/** كم بقي من النوم (مللي ثانية)، 0 إن كان مستيقظًا */
function offlineLeft(now = Date.now()) {
    if (!SLEEP.enabled) return 0;
    const w = windows(now).find(x => now >= x.start && now < x.end);
    return w ? w.end - now : 0;
}
const isAsleep = () => offlineLeft() > 0;
const scheduleInfo = (now = Date.now()) => {
    const w = windows(now);
    return { asleep: offlineLeft(now) > 0, current: w.find(x => now >= x.start && now < x.end) || null, next: w.find(x => x.start > now) || null };
};

/* ═══════════════════ ملف الحالة (يبقى بعد إعادة التشغيل) ═══════════════════ */
const STATE_FILE = () => process.env.HUMAN_STATE_FILE || path.join(__dirname, '..', 'Heba_DB', 'human_state.json');
let state = null;
function loadState() {
    if (state) return state;
    try { state = JSON.parse(fs.readFileSync(STATE_FILE(), 'utf8')); } catch (e) { state = null; }
    if (!state || typeof state !== 'object') state = {};
    state.dm = state.dm || { day: '', count: 0, last: 0 };
    state.recent = Array.isArray(state.recent) ? state.recent : [];
    return state;
}
let saveTimer = null;
function saveState() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
        saveTimer = null;
        try {
            const f = STATE_FILE();
            fs.mkdirSync(path.dirname(f), { recursive: true });
            fs.writeFileSync(f, JSON.stringify(state));
        } catch (e) { /* تجاهل */ }
    }, 500);
    if (typeof saveTimer.unref === 'function') saveTimer.unref();
}

/* ═══════════════════ 🗣️ الأسلوب (لهجة سودانية خفيفة) ═══════════════════ */
const VOICES = [
    {
        id: 'ودود', emojis: ['❤️', '😂', '👍', '😍', '🥰'],
        open: ['سلامات يا غالي 🌹', 'يا هلا بيك يا زول 🤍', 'كيفك يا باشا؟', 'وينك يا زول، اشتقنا ليك'],
        checkin: ['كل حاجة تمام من ناحيتي، لو دايرني في أي حاجة أنا موجود', 'جيت أطمّن عليك، وكان عندك أي طلب للبوت قول لي', 'البوت شغّال وبخير، ويومك يكون حلو إن شاء الله', 'ما في أي مشكلة عندي، بس قلت أسلّم عليك'],
        status: [c => `البوت شغّال من ${c.up}، أرسل ${c.sent} رسالة وتفاعل مع ${c.reacts} رسالة${c.grp}`, c => `تقرير صغير: مرّ ${c.up} على تشغيلي والرسائل المرسلة ${c.sent}${c.grp}`, c => `كل حاجة ماشة، شغّال من ${c.up} 👌 وبعتّ ${c.sent} رسالة`],
        wake: ['صباح الخير، صحيت ورجعت للشغل ☀️', 'صباح النور يا زول، خلصت نومي وجاهز من جديد', 'صحيت يا غالي والبوت رجع يشتغل 🌅'],
        sleep: ['تصبح على خير، ماشي أنوم وأرجع ليك الصباح 🌙', 'تعبت الليلة، بنوم شوية وأرجع الصباح إن شاء الله 😴', 'قربت أنوم، كان في حاجة ضرورية قول لي قبل ما أطفّي']
    },
    {
        id: 'مرح', emojis: ['😂', '🤣', '😜', '🔥', '😎'],
        open: ['ياخ أنا هنا، لا تخاف 😎', 'ها يا كبير، اشتقنا ليك 😂', 'طلّيت عليك من الشباك 🤣', 'يا مطوّر زمااان 😜'],
        checkin: ['قعدت أعدّ الرسائل لحدي ما انشغلت وما جاك خبر 😂', 'كان في زول بزعّلك قول لي، أنا جاهز 😜', 'قلت أنا من زمان ما كلمتو فقلت أطلّ عليك', 'شغّال زي الحصان، وإنت كيف حالك؟ 🐎'],
        status: [c => `شغّال من ${c.up} وما تعبت، بعتّ ${c.sent} رسالة وتفاعلت مع ${c.reacts} 😂${c.grp}`, c => `إحصائية على السريع: ${c.up} تشغيل و${c.sent} رسالة${c.grp} 🤣`, c => `لو سألوك عني قول ليهم: شغّال من ${c.up} وبخير 😎`],
        wake: ['يا صباح الفل، صحيت وجبت معاي طاقة 😎', 'صحّيت من النوم! وين القهوة؟ ☕😂', 'رجعت ليكم يا شباب، البوت صحي 🌞'],
        sleep: ['عيوني بدت تغمض، ماشي أنوم 😴 ما تشتاق لي كتير', 'نوم العافية، أجي ليك الصباح وأنا منتعش 🌙😂', 'بنوم لحدي الصباح، ما تسوي حفلة من غيري 🤣']
    },
    {
        id: 'هادئ', emojis: ['👍', '🙏', '✨', '👌'],
        open: ['السلام عليكم ورحمة الله', 'مرحبًا، أتمنى يومك يكون كويس', 'تحية طيبة يا غالي', 'أهلًا بيك'],
        checkin: ['أطمّنك إنو البوت شغّال بشكل طبيعي وما في أي أعطال', 'ما في جديد يُذكر، والأمور مستقرة تمام', 'حبّيت أطمّن عليك، وأنا في الخدمة متى ما احتجت', 'كل شي ماشي زي ما ينبغي، ربنا يحفظك'],
        status: [c => `البوت شغّال منذ ${c.up}، وأُرسلت ${c.sent} رسالة وتم التفاعل مع ${c.reacts} رسالة${c.grp}`, c => `تقرير موجز: مدة التشغيل ${c.up}، والرسائل المرسلة ${c.sent}${c.grp}`, c => `الحالة مستقرة، ومرّ على التشغيل ${c.up}`],
        wake: ['صباح الخير، انتهت فترة الراحة وعاد البوت للعمل', 'صباح النور، البوت متصل الآن وجاهز لأي طلب', 'رجعت للخدمة بعد الراحة، صباحك خير'],
        sleep: ['تصبح على خير، البوت بيقطع الآن للراحة ويرجع الصباح', 'حان وقت الراحة، سأعود الصباح بإذن الله', 'بستأذنك للراحة، وأرجع الصباح إن شاء الله']
    },
    {
        id: 'حماسي', emojis: ['🔥', '💪', '🚀', '😎', '⚡'],
        open: ['يا بطل! 💪', 'جاهزين للانطلاق 🚀', 'طاقة كاملة هنا ⚡', 'أهلًا يا مطوّر 🔥'],
        checkin: ['كل الأنظمة شغّالة بأعلى كفاءة، جاهز لأي أمر!', 'ما في حاجة توقفنا النهاردة، اطلب وأنا بنفّذ 🔥', 'البوت في قمة نشاطه، في مهمة جديدة؟ 💪', 'كله تمام والأداء ممتاز، خلّينا نكمّل 🚀'],
        status: [c => `شغّال من ${c.up} بدون توقف! ${c.sent} رسالة و${c.reacts} تفاعل ⚡${c.grp}`, c => `أرقام النهاردة: ${c.up} تشغيل، ${c.sent} رسالة مرسلة 🔥${c.grp}`, c => `الأداء ممتاز، ومرّ ${c.up} وأنا على أتم الاستعداد 💪`],
        wake: ['صباح النشاط! صحيت وجاهز لليوم ☀️🔥', 'يوم جديد وطاقة جديدة، البوت رجع للشغل 🚀', 'صحيت بأعلى طاقة، يلا نبدأ 💪'],
        sleep: ['وقت شحن الطاقة، بنوم وأرجع الصباح أقوى ⚡😴', 'خلّصنا يوم كامل، ماشي أنوم وأرجع بكرة 🌙💪', 'الشحن بدأ دلوقتي! نلتقي الصباح 🔋']
    }
];

/** الأسلوب الحالي؛ يتبدّل كل بضع ساعات (وعند كل صباح) */
function currentVoice(force = false) {
    const st = loadState(), now = Date.now();
    let v = VOICES.find(x => x.id === (st.voice && st.voice.id));
    if (force || !v || !(st.voice.until > now)) {
        const others = VOICES.filter(x => !v || x.id !== v.id);
        v = pick(others);
        const lo = Math.max(1, num('HUMAN_VOICE_MIN_H', 3)), hi = Math.max(lo, num('HUMAN_VOICE_MAX_H', 8));
        st.voice = { id: v.id, until: now + rand(lo, hi) * 3600000 };
        saveState();
    }
    return v;
}

/* ═══════════════════ ❤️ التفاعل مع الرسائل ═══════════════════ */
const REACT = {
    get enabled() { return CFG.enabled && process.env.HUMAN_REACT !== '0'; },
    get chance() { return Math.min(1, Math.max(0, num('HUMAN_REACT_CHANCE', 0.08))); },
    get devChance() { return Math.min(1, Math.max(0, num('HUMAN_REACT_DEV_CHANCE', 0.35))); },
    get perHour() { return Math.max(1, num('HUMAN_REACT_PER_HOUR', 15)); },
    get threadGapMs() { return Math.max(0, num('HUMAN_REACT_THREAD_GAP_MS', 180000)); }
};
const lastReactAt = new Map();
let reactTimes = [];

function maybeReact(api, event) {
    if (!REACT.enabled || isAsleep() || typeof api.setMessageReaction !== 'function') return;
    if (!event.messageID || (!event.body && !(event.attachments && event.attachments.length))) return;
    let cfg = null;
    try { cfg = require('./config'); } catch (e) { /* تجاهل */ }
    const body = String(event.body || '');
    try { const pre = cfg && cfg.getPrefix && cfg.getPrefix(); if (pre && body.startsWith(pre)) return; } catch (e) { /* تجاهل */ }

    let dev = false;
    try { dev = !!(cfg && cfg.isAdmin && cfg.isAdmin(String(event.senderID))); } catch (e) { /* تجاهل */ }
    const p = dev ? REACT.devChance : (event.isGroup === false ? REACT.chance * 2 : REACT.chance);
    if (Math.random() >= p) return;

    const now = Date.now(), tid = String(event.threadID);
    if (now - (lastReactAt.get(tid) || 0) < REACT.threadGapMs) return;
    reactTimes = reactTimes.filter(t => now - t < 3600000);
    if (reactTimes.length >= REACT.perHour) return;
    lastReactAt.set(tid, now);
    reactTimes.push(now);

    const emoji = pick(currentVoice().emojis);
    const t = setTimeout(() => {
        if (isAsleep()) return;
        try {
            const r = api.setMessageReaction(emoji, event.messageID, tid, () => {}, true);
            if (r && typeof r.catch === 'function') r.catch(() => {});
            stats.reacts++;
        } catch (e) { /* تجاهل */ }
    }, rand(2500, 14000));
    if (typeof t.unref === 'function') t.unref();
}

/* ═══════════════════ 📩 رسائل المطور الرئيسي ═══════════════════ */
const DM = {
    get enabled() { return CFG.enabled && process.env.HUMAN_DM !== '0'; },
    get perDay() { return Math.max(0, num('HUMAN_DM_PER_DAY', 4)); },
    get minGapMs() { return Math.max(1, num('HUMAN_DM_MIN_GAP_MIN', 120)) * 60000; },
    warmupMs: 10 * 60000,
    tickMs: 5 * 60000,
    chancePerTick: 0.12
};

const crypto = require('crypto');
const norm = t => crypto.createHash('sha1').update(String(t).toLowerCase().replace(/[\s\u200f\u200e]+/g, '')).digest('hex').slice(0, 12);
const seen = t => loadState().recent.includes(norm(t));
function remember(t) {
    const st = loadState();
    st.recent.push(norm(t));
    if (st.recent.length > 1500) st.recent.splice(0, st.recent.length - 1500);   // بصمات قصيرة: آلاف الرسائل بلا حجم يُذكر
    saveState();
}

function fmtUp(ms) {
    const m = Math.max(1, Math.floor(ms / 60000)), h = Math.floor(m / 60);
    return h ? `${h} ساعة${m % 60 ? ` و${m % 60} دقيقة` : ''}` : `${m} دقيقة`;
}
function ctxStats() {
    let grp = '';
    try {
        const n = require('./panelData').listGroups(require('./power')).groups.length;
        if (n) grp = ` وعدد المجموعات ${n}`;
    } catch (e) { /* تجاهل */ }
    const since = global.client && global.client.connectedAt ? Date.now() - global.client.connectedAt : process.uptime() * 1000;
    return { up: fmtUp(since), sent: stats.sent, reacts: stats.reacts, grp, stamp: `${dayKey()} ${clockStr()}` };
}

/** رسالة جديدة لا تتكرر أبدًا: تُجرَّب تركيبات كثيرة، وإن تكررت كلها نضيف الوقت */
function composeDm(kind) {
    const v = currentVoice(kind === 'wake'), c = ctxStats();
    const build = () => {
        const body = kind === 'wake' ? pick(v.wake) : kind === 'sleep' ? pick(v.sleep)
            : kind === 'status' ? pick(v.status)(c) : pick(v.checkin);
        const tail = Math.random() < 0.5 ? ' ' + pick(v.emojis) : '';
        return `${pick(v.open)}\n${body}${tail}`;
    };
    for (let i = 0; i < 60; i++) { const t = build(); if (!seen(t)) return t; }
    // كل التركيبات استُهلكت: نضيف التاريخ والوقت بالثانية فتبقى الرسالة فريدة دائمًا
    return `${build()}\n🕒 ${c.stamp}:${pad2(localParts(Date.now()).ss)}`;
}

const life = { api: null, timers: [], startedAt: 0, log: () => {} };

function devId() {
    try { return String(require('./config').getFirstAdmin()); } catch (e) { return ''; }
}

/** يرسل رسالة للمطور الرئيسي في الخاص. counts=false لرسائل الصباح/المساء */
function sendDm(kind, counts = true) {
    const api = life.api, to = devId();
    if (!api || !to || isAsleep()) return Promise.resolve(false);
    try { if (String(api.getCurrentUserID()) === to) return Promise.resolve(false); } catch (e) { /* تجاهل */ }
    const text = composeDm(kind);
    return new Promise(resolve => {
        try {
            api.sendMessage(text, to, err => {
                if (err) { life.log(`تعذّر إرسال رسالة المطور: ${String(err.error || err.message || err).slice(0, 100)}`, 'warn'); return resolve(false); }
                remember(text);
                const st = loadState();
                if (counts) { st.dm.count++; st.dm.last = Date.now(); saveState(); }
                life.log(`رسالة للمطور (${kind})`, 'LIFE');
                resolve(true);
            });
        } catch (e) { resolve(false); }
    });
}

function dmTick() {
    if (!life.api || !DM.enabled || isAsleep()) return;
    const now = Date.now(), st = loadState();
    if (now - life.startedAt < DM.warmupMs) return;
    const today = dayKey(now);
    if (st.dm.day !== today) { st.dm.day = today; st.dm.count = 0; saveState(); }
    if (st.dm.count >= DM.perDay || now - (st.dm.last || 0) < DM.minGapMs) return;
    const nxt = scheduleInfo(now).next;
    if (nxt && nxt.start - now < 20 * 60000) return;          // قريب من وقت النوم: رسالة «تصبح على خير» تكفي
    if (Math.random() >= DM.chancePerTick) return;
    sendDm(Math.random() < 0.45 ? 'status' : 'checkin');
}

/* ═══════════════════ دورة الحياة (يستدعيها main.js) ═══════════════════ */
function stopLife() {
    for (const t of life.timers) { clearTimeout(t); clearInterval(t); }
    life.timers = [];
    life.api = null;
}

function startLife(api, hooks = {}) {
    stopLife();
    life.api = api;
    life.startedAt = Date.now();
    life.log = typeof hooks.log === 'function' ? hooks.log : () => {};
    if (!CFG.enabled) return;
    const later = (fn, ms) => { const t = setTimeout(fn, Math.max(0, ms)); if (t.unref) t.unref(); life.timers.push(t); return t; };
    const now = Date.now(), st = loadState(), info = scheduleInfo(now);

    // 1) قطع الاتصال عند بدء النوم
    if (SLEEP.enabled && info.next && typeof hooks.onSleep === 'function') {
        later(() => { life.log('حان وقت النوم', 'LIFE'); hooks.onSleep(); }, Math.min(info.next.start - now + 1500, 2147000000));   // +1.5ث لنكون داخل النافذة فعلًا
    }
    // 2) رسالة الصباح بعد انتهاء نوم حديث
    if (DM.enabled && SLEEP.enabled) {
        const ended = windows(now).filter(w => w.end <= now && now - w.end < 3 * 3600000).pop();
        if (ended && st.wokeFor !== ended.start) {
            st.wokeFor = ended.start; saveState();
            later(() => sendDm('wake', false), rand(30000, 120000));
        }
        // 3) رسالة «تصبح على خير» قبل النوم بدقائق
        if (info.next && st.bedFor !== info.next.start) {
            const at = info.next.start - rand(3, 6) * 60000;
            if (at > now) later(() => { st.bedFor = info.next.start; saveState(); sendDm('sleep', false); }, at - now);
        }
    }
    // 4) رسائل المطور خلال النهار
    if (DM.enabled && DM.perDay > 0) {
        const iv = setInterval(dmTick, DM.tickMs);
        if (iv.unref) iv.unref();
        life.timers.push(iv);
    }
}

module.exports = {
    wrap, onIncoming, config: CFG, stats,
    startLife, stopLife, offlineLeft, isAsleep, scheduleInfo,
    _internal: { windows, composeDm, sendDm, currentVoice, localParts, dedupeKey, VOICES, loadState }
};
