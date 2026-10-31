/**
 * ◈ ───『 سجل المستخدمين: Heba_DB/users.json 』─── ◈
 * يحفظ لكل مستخدم: الأيدي والاسم وأول ظهور وآخر ظهور وعدد الرسائل والمجموعات التي تحدث فيها.
 * لا يحفظ نصوص الرسائل إطلاقًا. ومن شاء خرج من التسجيل بالأمر: .بياناتي حذف
 *
 * الحفظ مؤجّل ومجمّع (كل 5 ثوانٍ) حتى لا نكتب الملف مع كل رسالة، ويُحفظ فورًا عند إيقاف البوت.
 */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', '..', 'Heba_DB');
const FILE = path.join(DIR, 'users.json');
const FLUSH_MS = Number(process.env.USERS_FLUSH_MS) || 5000;
const NAME_TTL = 7 * 24 * 60 * 60 * 1000;   // نحدّث الاسم أسبوعيًا
const NAME_RETRY = 10 * 60 * 1000;          // لا نكرر طلب الاسم الفاشل قبل 10 دقائق
const MAX_THREADS = 20;

fs.mkdirSync(DIR, { recursive: true });

let db = {};
try {
    db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (!db || typeof db !== 'object' || Array.isArray(db)) throw new Error('صيغة غير متوقعة');
} catch (e) {
    db = {};
    if (e.code !== 'ENOENT') { // ملف تالف: نحتفظ بنسخة منه ونبدأ سجلًا جديدًا بدل أن نفقده
        try { fs.renameSync(FILE, path.join(DIR, `users.corrupt-${Date.now()}.json`)); } catch (_) { /* تجاهل */ }
        console.error('users: الملف تالف، حُفظت نسخة منه وبدأ سجل جديد');
    }
}

let dirty = false;
let timer = null;
const nameTried = new Map(); // id → وقت آخر محاولة جلب اسم (في الذاكرة فقط)

function flush() {
    if (!dirty) return;
    try {
        const tmp = FILE + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
        fs.renameSync(tmp, FILE); // كتابة ذرّية: لا يتلف الملف إن انقطع التيار أثناء الحفظ
        dirty = false;
    } catch (e) {
        console.error('users: فشل الحفظ:', e.message);
    }
}

function schedule() {
    dirty = true;
    if (timer) return;
    timer = setTimeout(() => { timer = null; flush(); }, FLUSH_MS);
    if (timer.unref) timer.unref();
}

process.on('exit', flush);
for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => { flush(); process.exit(0); });
}

/* ───────── الواجهة ───────── */
const key = id => String(id);

/** يسجّل رسالة من مستخدم (يتجاهل من خرج من التسجيل) */
function touch(id, threadID) {
    id = key(id);
    const now = Date.now();
    let u = db[id];
    if (u && u.optOut) return null;
    if (!u) u = db[id] = { id, name: null, nameAt: 0, firstSeen: now, lastSeen: now, messages: 0, threads: [] };
    u.lastSeen = now;
    u.messages++;
    const t = key(threadID);
    if (threadID !== undefined && !u.threads.includes(t)) {
        u.threads.push(t);
        if (u.threads.length > MAX_THREADS) u.threads.shift();
    }
    schedule();
    return u;
}

function needsName(id) {
    id = key(id);
    const u = db[id];
    if (!u || u.optOut) return false;
    if (u.name && Date.now() - u.nameAt < NAME_TTL) return false;
    if (Date.now() - (nameTried.get(id) || 0) < NAME_RETRY) return false;
    nameTried.set(id, Date.now());
    return true;
}

function setName(id, name) {
    const u = db[key(id)];
    if (!u || u.optOut || !name) return;
    u.name = String(name).slice(0, 80);
    u.nameAt = Date.now();
    schedule();
}

const get = id => db[key(id)] || null;
const all = () => Object.values(db).filter(u => !u.optOut);
const isOptedOut = id => !!(db[key(id)] && db[key(id)].optOut);

/** الخروج من التسجيل: يحذف بيانات المستخدم ويوقف تسجيله */
function optOut(id) {
    nameTried.delete(key(id));
    db[key(id)] = { id: key(id), optOut: true };
    schedule();
    flush();
}

/** العودة للتسجيل */
function optIn(id) {
    nameTried.delete(key(id)); // يبدأ سجلًا جديدًا فنسمح بجلب الاسم فورًا
    delete db[key(id)];
    schedule();
    flush();
}

module.exports = { touch, needsName, setName, get, all, isOptedOut, optOut, optIn, flush, FILE };
