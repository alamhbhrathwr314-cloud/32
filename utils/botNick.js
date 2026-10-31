/**
 * 🏷️ كنية البوت الثابتة في كل المجموعات.
 *  1) عند تسجيل الدخول: يمرّ بكل المجموعات ببطء (فاصل 4–8 ثوانٍ لحماية الحساب) ويضبط كنية البوت.
 *     ما ضُبط مرة يُسجَّل في Heba_DB/bot_nick.json فلا يُعاد، ويُتحقق من الكنية الحالية قبل التغيير
 *     حتى لا تظهر رسائل «غيّر كنيته» مكررة في المجموعات.
 *  2) عند إضافة البوت لمجموعة بيد المطور: يضبط الكنية بعد ثوانٍ.
 *  3) إن غيّر أحد كنية البوت: يعيدها (بحد أقصى 3 مرات في الدقيقة لكل مجموعة).
 * الكنية: متغير البيئة BOT_NICKNAME، أو BOT_NICKNAME في config.json، وإلا الافتراضية أدناه.
 */
const fs = require('fs');
const path = require('path');

const DEFAULT_NICK = 'ℝ𝕖𝕞𝕠 » . «';
const DIR = path.join(__dirname, '..', 'Heba_DB');
const FILE = path.join(DIR, 'bot_nick.json');
const FATAL = /rate[ _-]?limit|too many|checkpoint|spam|temporar|blocked|login|expired|not logged|try again|محظور/i;   // أخطاء تعني أن نتوقف لحماية الحساب

// قابلة للتعديل في الاختبارات فقط
const D = { gapMin: 4000, gapMax: 8000, subscribeWait: 3000, enforceWait: 2500, startWait: 20000, minInterval: 10 * 60 * 1000 };

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (m, lvl = 'info') => { try { require('./log')(m, lvl); } catch (e) { console.log(m); } };
const nick = () => process.env.BOT_NICKNAME || (global.config && global.config.BOT_NICKNAME) || DEFAULT_NICK;
const errText = e => (typeof e === 'string' ? e : (e && (e.error || e.message)) || 'خطأ غير معروف');
const wrap = fn => new Promise(resolve => { try { fn((err, data) => resolve({ err: err || null, data })); } catch (e) { resolve({ err: e, data: null }); } });

/* ═══════════ الحالة المحفوظة ═══════════ */
function loadState() {
    try {
        const d = JSON.parse(fs.readFileSync(FILE, 'utf8'));
        if (d && d.nick === nick() && d.done && typeof d.done === 'object') return { nick: d.nick, done: d.done, lastSweep: d.lastSweep || null };
    } catch (e) { /* ملف جديد */ }
    return { nick: nick(), done: {}, lastSweep: null };       // الكنية تغيّرت أو لا ملف: نبدأ من جديد
}
function saveState(s) {
    try {
        fs.mkdirSync(DIR, { recursive: true });
        const tmp = `${FILE}.${process.pid}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(s));
        fs.renameSync(tmp, FILE);
    } catch (e) { log('bot_nick: تعذر الحفظ: ' + e.message, 'warn'); }
}

/* ═══════════ مساعدات ماسنجر ═══════════ */
async function listGroups(api) {
    const ids = new Set();
    for (const tag of [['INBOX'], ['ARCHIVED']]) {
        let ts = null;
        for (let page = 0; page < 20; page++) {
            const r = await wrap(cb => api.getThreadList(50, ts, tag, cb));
            const list = r.data;
            if (!Array.isArray(list) || !list.length) break;
            for (const t of list) if (t && t.isGroup) ids.add(String(t.threadID));
            const last = list[list.length - 1], next = last && last.timestamp;
            if (list.length < 50 || !next || String(next) === String(ts)) break;
            ts = next;
        }
    }
    return [...ids];
}
const getInfo = (api, tid) => wrap(cb => api.getThreadInfo(tid, cb));
const setNick = (api, tid, botID) => wrap(cb => api.changeNickname(nick(), tid, botID, cb));

/* ═══════════ التطبيق على كل المجموعات ═══════════ */
let running = false, lastStats = null, lastStart = 0;
const isRunning = () => running;
const getLastStats = () => lastStats;

/** getApi: دالة تعيد api الحالي (يتغير بعد إعادة الاتصال). force: يتجاهل ما سُجّل منجزًا */
async function sweep(getApi, { force = false } = {}) {
    if (running) return null;
    running = true; lastStart = Date.now();
    const stats = { total: 0, changed: 0, skipped: 0, failed: 0, aborted: false, finishedAt: null };
    try {
        const state = loadState();
        const botID = String(getApi().getCurrentUserID());
        const groups = await listGroups(getApi());
        stats.total = groups.length;
        for (const tid of groups) {
            if (!force && state.done[tid]) { stats.skipped++; continue; }
            const info = await getInfo(getApi(), tid);
            if (info.err) {
                stats.failed++;
                if (FATAL.test(errText(info.err))) { stats.aborted = true; log(`كنية البوت: توقفت (${errText(info.err)})`, 'warn'); break; }
                await sleep(D.gapMin); continue;
            }
            const cur = info.data && info.data.nicknames && info.data.nicknames[botID];
            if (cur === nick()) { state.done[tid] = Date.now(); stats.skipped++; await sleep(300); continue; }
            const r = await setNick(getApi(), tid, botID);
            if (r.err) {
                stats.failed++;
                log(`كنية البوت: تعذّر الضبط في ${tid} (${errText(r.err)})`, 'warn');
                if (FATAL.test(errText(r.err))) { stats.aborted = true; break; }
            } else { state.done[tid] = Date.now(); stats.changed++; }
            saveState(state);
            await sleep(D.gapMin + Math.random() * (D.gapMax - D.gapMin));
        }
        if (!stats.aborted) state.lastSweep = Date.now();
        saveState(state);
    } catch (e) {
        stats.aborted = true; log('كنية البوت: خطأ ' + (e && e.message), 'error');
    } finally {
        running = false; stats.finishedAt = Date.now(); lastStats = stats;
    }
    log(`كنية البوت: المجموعات ${stats.total} | غُيّرت ${stats.changed} | سليمة ${stats.skipped} | فشلت ${stats.failed}${stats.aborted ? ' | توقفت مبكرًا' : ''}`);
    return stats;
}

let startTimer = null;
/** يُستدعى من main.js بعد كل تسجيل دخول: يبدأ المرور بعد مهلة قصيرة، ولا يكرره بأقل من 10 دقائق */
function startSweep(getApi) {
    if (startTimer || running) return;
    if (Date.now() - lastStart < D.minInterval && lastStart) return;
    startTimer = setTimeout(() => {
        startTimer = null;
        sweep(getApi).catch(e => log('كنية البوت: ' + (e && e.message), 'error'));
    }, D.startWait);
}

/* ═══════════ مجموعة واحدة / الأحداث ═══════════ */
async function applyOne(api, tid) {
    const botID = String(api.getCurrentUserID());
    const r = await setNick(api, String(tid), botID);
    if (r.err) { log(`كنية البوت: تعذّر الضبط في ${tid} (${errText(r.err)})`, 'warn'); return false; }
    const s = loadState(); s.done[String(tid)] = Date.now(); saveState(s);
    return true;
}

const recent = new Map();
function allow(key, max, windowMs) {
    const now = Date.now(), list = (recent.get(key) || []).filter(t => now - t < windowMs);
    if (list.length >= max) { recent.set(key, list); return false; }
    list.push(now); recent.set(key, list); return true;
}

/** يُستدعى من main.js مع كل حدث مجموعة */
async function handleEvent(api, event, cfg) {
    if (!event) return;
    const botID = String(api.getCurrentUserID()), tid = String(event.threadID), data = event.logMessageData || {};

    if (event.logMessageType === 'log:subscribe') {
        const added = (data.addedParticipants || []).map(p => String(p.userFbId || p.userID || p.id));
        if (!added.includes(botID)) return;
        const author = String(event.author || '');
        if (author && !cfg.isAdmin(author)) return;          // أضافه غير المطور: ownerLock يغادر
        await sleep(D.subscribeWait);
        await applyOne(api, tid);
        return;
    }

    if (event.logMessageType === 'log:user-nickname') {
        if (String(data.participant_id) !== botID || String(event.author) === botID) return;
        if ((data.nickname || '') === nick()) return;
        if (!allow(tid, 3, 60000)) return;
        await sleep(D.enforceWait);                          // بعد حماية الكنية في الإعدادات (0.7ث) لتكون الأخيرة
        await applyOne(api, tid);
    }
}

module.exports = { sweep, startSweep, handleEvent, applyOne, isRunning, getLastStats, nick, loadState, D };
