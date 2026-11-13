/**
 * 🚪 مغادرة المجموعات الواردة في «طلبات المراسلة» تلقائيًا
 *
 * يفحص مجلدَي الطلبات (PENDING) و«أخرى» (OTHER) دوريًا، ويغادر كل مجموعة فيهما ثم يحذف المحادثة.
 * لا يلمس المجموعات المقبولة في صندوق الوارد (INBOX).
 *
 * متغيرات البيئة (اختيارية):
 *   AUTO_LEAVE_PENDING        0 لإيقاف الميزة (افتراضي: مفعّلة)
 *   AUTO_LEAVE_INTERVAL_MIN   كل كم دقيقة يفحص (افتراضي 10)
 *   AUTO_LEAVE_MAX_PER_CYCLE  أقصى عدد مغادرات في الدورة الواحدة (افتراضي 5) لتخفيف الضغط على فيسبوك
 *   AUTO_LEAVE_KEEP_ADMIN     1 ليتجاوز المجموعات التي فيها أحد المطورين (افتراضي 0: يغادر الجميع)
 */
const TAGS = ['PENDING', 'OTHER'];
const PAGE = 50;
const MAX_PAGES = 3;
const MAX_ATTEMPTS = 3;                      // بعدها نتوقف عن محاولة مجموعة فشلت مرارًا

const num = (name, def) => Number(process.env[name]) || def;
const sleep = ms => new Promise(r => setTimeout(r, ms));

let timer = null, first = null, running = false;
const attempts = new Map();                  // threadID ← عدد المحاولات الفاشلة

/** يستدعي دالة بنمط callback/promise ويرجع true عند النجاح */
const call = fn => new Promise(resolve => {
    try {
        const r = fn(err => resolve(!err));
        if (r && typeof r.then === 'function') r.then(() => resolve(true), () => resolve(false));
    } catch (e) { resolve(false); }
});

async function listGroups(api, tag, log) {
    const out = [];
    let ts = null;
    for (let page = 0; page < MAX_PAGES; page++) {
        let batch;
        try {
            batch = await new Promise((resolve, reject) => {
                api.getThreadList(PAGE, ts, [tag], (e, d) => (e ? reject(e) : resolve(d || [])));
            });
        } catch (e) {
            if (page === 0) log(`autoLeave: تعذّر جلب ${tag}: ${e && e.message || e}`, 'warn');
            break;
        }
        for (const t of batch) if (t && t.isGroup && t.threadID) out.push(t);
        if (batch.length < PAGE) break;
        ts = batch[batch.length - 1].timestamp;
        if (!ts) break;
    }
    return out;
}

async function leave(api, botID, threadID) {
    const removed = await call(cb => api.removeUserFromGroup(botID, threadID, cb));
    const deleted = typeof api.deleteThread === 'function' ? await call(cb => api.deleteThread(threadID, cb)) : false;
    return removed || deleted;
}

async function runOnce(api, cfg, log) {
    if (running) return 0;
    try { if (require('./humanize').isAsleep()) return 0; } catch (e) { /* تجاهل */ }   // وقت النوم: لا طلبات لفيسبوك
    running = true;
    let left = 0;
    try {
        const botID = String(api.getCurrentUserID());
        const keepAdmin = process.env.AUTO_LEAVE_KEEP_ADMIN === '1';
        const seen = new Set();
        let groups = [];
        for (const tag of TAGS) {
            for (const t of await listGroups(api, tag, log)) {
                const id = String(t.threadID);
                if (seen.has(id)) continue;
                seen.add(id);
                groups.push(t);
            }
        }
        groups = groups.filter(t => (attempts.get(String(t.threadID)) || 0) < MAX_ATTEMPTS);
        if (keepAdmin && cfg && typeof cfg.isAdmin === 'function') {
            groups = groups.filter(t => !(t.participantIDs || []).some(id => cfg.isAdmin(String(id))));
        }
        const batch = groups.slice(0, num('AUTO_LEAVE_MAX_PER_CYCLE', 5));
        for (const t of batch) {
            const id = String(t.threadID);
            if (await leave(api, botID, id)) {
                left++;
                attempts.delete(id);
                log(`غادرت مجموعة من طلبات المراسلة: ${String(t.name || 'بدون اسم').slice(0, 40)} (${id})`);
            } else {
                attempts.set(id, (attempts.get(id) || 0) + 1);
                log(`autoLeave: فشلت مغادرة ${id}`, 'warn');
            }
            await sleep(3000 + Math.floor(Math.random() * 3000));   // مهلة بين كل مغادرة
        }
        const rest = groups.length - batch.length;
        if (rest > 0) log(`autoLeave: بقي ${rest} مجموعة للدورة القادمة`);
    } catch (e) {
        log('autoLeave: ' + (e && e.message || e), 'warn');
    } finally { running = false; }
    return left;
}

/** يبدأ الفحص الدوري بعد كل تسجيل دخول (يلغي المؤقت القديم) */
function start(api, cfg, log) {
    stop();
    if (process.env.AUTO_LEAVE_PENDING === '0') return;
    if (!api || typeof api.getThreadList !== 'function' || typeof api.removeUserFromGroup !== 'function') return;
    const everyMs = Math.max(2, num('AUTO_LEAVE_INTERVAL_MIN', 10)) * 60 * 1000;
    first = setTimeout(() => runOnce(api, cfg, log), 60 * 1000);       // أول فحص بعد دقيقة من الدخول
    timer = setInterval(() => runOnce(api, cfg, log), everyMs);
    if (first.unref) first.unref();
    if (timer.unref) timer.unref();
}

function stop() {
    clearTimeout(first); clearInterval(timer);
    first = timer = null;
}

module.exports = { start, stop, runOnce };
