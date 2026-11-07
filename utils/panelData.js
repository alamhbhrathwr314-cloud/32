/**
 * 🗄️ بيانات لوحة التحكم (يستعملها utils/panel.js):
 *   - الأوامر المعطّلة والمستخدمون المحظورون  ← Heba_DB/panel.json
 *   - إحصاءات الاستخدام                          ← Heba_DB/panel_stats.json
 *   - قائمة المجموعات (اسم/عدد أعضاء)            ← Heba_DB/panel_threads.json
 *   - صور الأوامر المخصّصة                       ← Heba_DB/custom_images.json (نفس ملف الأمر رفع)
 * كل الملفات في أعلى Heba_DB فيرفعها cloudSync إلى GitHub تلقائيًا.
 */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'Heba_DB');
const readJSON = (name, def) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, name), 'utf8')); } catch (e) { return def; } };
function writeJSON(name, obj) {
    try {
        fs.mkdirSync(DIR, { recursive: true });
        const p = path.join(DIR, name), tmp = `${p}.${process.pid}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(obj));
        fs.renameSync(tmp, p);
    } catch (e) { console.error(`panel: تعذر حفظ ${name}:`, e.message); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ═════════ الإعدادات: أوامر معطّلة + محظورون ═════════ */
const settings = readJSON('panel.json', {});
const disabled = new Set((Array.isArray(settings.disabled) ? settings.disabled : []).map(x => String(x).toLowerCase()));
const banned = new Set((Array.isArray(settings.banned) ? settings.banned : []).map(String));
const saveSettings = () => writeJSON('panel.json', { disabled: [...disabled], banned: [...banned] });

/* ═════════ الإحصاءات ═════════ */
const stats = Object.assign({ days: {}, cmds: {}, threads: {}, users: {} }, readJSON('panel_stats.json', {}));
let statsDirty = false, statsTimer = null;
const dayKey = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);   // بتوقيت UTC

function markStats() {
    statsDirty = true;
    if (statsTimer) return;
    statsTimer = setTimeout(() => { statsTimer = null; flushStats(); }, 30000);
    if (statsTimer.unref) statsTimer.unref();
}
function flushStats() {
    if (!statsDirty) return;
    statsDirty = false;
    const keys = Object.keys(stats.days).sort();
    for (const k of keys.slice(0, Math.max(0, keys.length - 30))) delete stats.days[k];   // نحتفظ بآخر 30 يومًا
    const tids = Object.keys(stats.threads);
    if (tids.length > 300) for (const k of tids.sort((a, b) => (stats.threads[b].t || 0) - (stats.threads[a].t || 0)).slice(300)) delete stats.threads[k];
    const uids = Object.keys(stats.users);
    if (uids.length > 1500) for (const k of uids.sort((a, b) => stats.users[b] - stats.users[a]).slice(1500)) delete stats.users[k];
    writeJSON('panel_stats.json', stats);
}
const dayRec = () => (stats.days[dayKey()] = stats.days[dayKey()] || { m: 0, c: 0 });
const threadRec = tid => (stats.threads[String(tid)] = stats.threads[String(tid)] || { m: 0, c: 0, t: 0 });

function noteMessage(threadID) {
    dayRec().m++; const t = threadRec(threadID); t.m++; t.t = Date.now(); markStats();
}
function noteCommand(name, threadID, userID) {
    dayRec().c++; const n = String(name).toLowerCase();
    stats.cmds[n] = (stats.cmds[n] || 0) + 1;
    threadRec(threadID).c++;
    stats.users[String(userID)] = (stats.users[String(userID)] || 0) + 1;
    markStats();
}

function getStats() {
    const days = [];
    for (let i = 13; i >= 0; i--) {
        const d = dayKey(Date.now() - i * 86400000), r = stats.days[d] || { m: 0, c: 0 };
        days.push({ d, m: r.m, c: r.c });
    }
    const sum = arr => arr.reduce((a, x) => ({ m: a.m + x.m, c: a.c + x.c }), { m: 0, c: 0 });
    const topCmds = Object.entries(stats.cmds).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, n]) => ({ name, n }));
    const topThreads = Object.entries(stats.threads).filter(([, t]) => t.m || t.c).sort((a, b) => b[1].m - a[1].m).slice(0, 6)
        .map(([id, t]) => ({ id, name: (threadsCache.threads[id] && threadsCache.threads[id].name) || null, m: t.m, c: t.c }));
    const topUsers = users().all().sort((a, b) => (b.messages || 0) - (a.messages || 0)).slice(0, 8)
        .map(u => ({ id: u.id, name: u.name || null, messages: u.messages || 0, commands: stats.users[u.id] || 0 }));
    return { days, today: days[days.length - 1], week: sum(days.slice(-7)), topCmds, topThreads, topUsers, since: Object.keys(stats.days).sort()[0] || null };
}

/* ═════════ المستخدمون ═════════ */
function users() { return require('./db/users'); }
function states() { return require('./db/states'); }

function listUsers({ q = '', offset = 0, limit = 30 }) {
    const all = states().getAll();
    const needle = String(q).trim().toLowerCase();
    let list = users().all().map(u => {
        const s = all[u.id] || {};
        return { id: u.id, name: u.name || null, messages: u.messages || 0, lastSeen: u.lastSeen || 0, level: s.level || 1, points: s.points || 0, rank: s.rank || '', banned: banned.has(String(u.id)) };
    });
    if (needle) list = list.filter(u => String(u.id).includes(needle) || (u.name || '').toLowerCase().includes(needle));
    list.sort((a, b) => b.lastSeen - a.lastSeen);
    return { total: list.length, users: list.slice(offset, offset + limit) };
}

function changePoints(id, delta) {
    if (!/^\d{5,25}$/.test(String(id))) throw new Error('أيدي غير صالح');
    if (!Number.isInteger(delta) || Math.abs(delta) > 1e9 || delta === 0) throw new Error('مبلغ غير صالح');
    if (!users().get(id)) throw new Error('المستخدم غير موجود');
    const d = states().getData(String(id));
    d.points = Math.max(0, Math.floor(d.points + delta));
    states().saveData(String(id), d);
    return d.points;
}

/* ═════════ المجموعات ═════════ */
let threadsCache = Object.assign({ updatedAt: 0, threads: {} }, readJSON('panel_threads.json', {}));
let refreshing = false;

async function refreshThreads(api) {
    if (refreshing) return null;
    refreshing = true;
    try {
        const found = {};
        for (const tag of [['INBOX'], ['ARCHIVED']]) {
            let ts = null;
            for (let page = 0; page < 20; page++) {
                const list = await new Promise(res => { try { api.getThreadList(50, ts, tag, (err, l) => res(err ? null : l)); } catch (e) { res(null); } });
                if (!Array.isArray(list) || !list.length) break;
                for (const t of list) {
                    if (t && t.isGroup) found[String(t.threadID)] = { name: t.name || null, members: (t.participants || t.participantIDs || []).length || null };
                }
                const next = list[list.length - 1] && list[list.length - 1].timestamp;
                if (list.length < 50 || !next || String(next) === String(ts)) break;
                ts = next;
                await sleep(400);
            }
        }
        const n = Object.keys(found).length;
        if (n) { threadsCache = { updatedAt: Date.now(), threads: found }; writeJSON('panel_threads.json', threadsCache); }
        return n;
    } finally { refreshing = false; }
}

function listGroups(power) {
    const list = Object.entries(threadsCache.threads).map(([id, t]) => {
        const s = stats.threads[id] || {};
        return { id, name: t.name, members: t.members, m: s.m || 0, c: s.c || 0, off: power.isOff(id) };
    });
    list.sort((a, b) => (b.m + b.c) - (a.m + a.c) || String(a.name).localeCompare(String(b.name), 'ar'));
    return { groups: list, updatedAt: threadsCache.updatedAt, refreshing };
}
const isRefreshing = () => refreshing;
const threadsUpdatedAt = () => threadsCache.updatedAt;
const groupCount = () => Object.keys(threadsCache.threads).length;

/* ═════════ صور الأوامر (نفس منطق الأمر رفع ونفس ملف التخزين) ═════════ */
const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const IMG_RE = /\.(jpe?g|png)$/i;
const MAX_IMG = 6 * 1024 * 1024;
const TARGETS = [
    { key: 'help', label: 'اوامر (قائمة الأوامر)', kind: 'file', file: path.join(ASSETS, 'help') },
    { key: 'divorce', label: 'طلاق', kind: 'dir', dir: path.join(ASSETS, 'divorce') },
    { key: 'slap', label: 'صفع (قالب الصفعة)', kind: 'dir', dir: path.join(ASSETS, 'slap') },
    { key: 'lock', label: 'القفل (إضافة البوت من غير المطور)', kind: 'file', file: path.join(ASSETS, 'lock') },
    { key: 'level', label: 'مستوى (خلفية بطاقة المستوى)', kind: 'file', file: path.join(ASSETS, 'level', 'background') },
    { key: 'marry', label: 'زواج (خلفية صورة الزواج)', kind: 'file', file: path.join(ASSETS, 'marry', 'background') }
];
const REMOVABLE = ['level', 'marry'];   // لها تصميم افتراضي يمكن العودة إليه
const targetOf = key => TARGETS.find(t => t.key === key) || null;
const imagesIn = dir => { try { return fs.readdirSync(dir).filter(f => IMG_RE.test(f)).sort(); } catch (e) { return []; } };
const fileImage = t => ['jpg', 'jpeg', 'png'].map(e => `${t.file}.${e}`).find(p => fs.existsSync(p)) || null;
const imageFiles = t => (t.kind === 'file' ? [fileImage(t)].filter(Boolean) : imagesIn(t.dir).map(f => path.join(t.dir, f)));
const writeAtomic = (p, buf) => { const t = p + '.tmp'; fs.writeFileSync(t, buf); fs.renameSync(t, p); };
const readStore = () => readJSON('custom_images.json', {}) || {};

function materialize(t, list) {
    if (t.kind === 'file') {
        fs.mkdirSync(path.dirname(t.file), { recursive: true });
        for (const e of ['jpg', 'jpeg', 'png']) { try { fs.unlinkSync(`${t.file}.${e}`); } catch (err) { /* غير موجود */ } }
        const last = list[list.length - 1];
        writeAtomic(`${t.file}.${last.ext}`, Buffer.from(last.b64, 'base64'));
        return;
    }
    fs.mkdirSync(t.dir, { recursive: true });
    for (const f of imagesIn(t.dir)) { try { fs.unlinkSync(path.join(t.dir, f)); } catch (err) { /* تجاهل */ } }
    list.forEach((img, i) => writeAtomic(path.join(t.dir, `custom_${i + 1}.${img.ext}`), Buffer.from(img.b64, 'base64')));
}
const currentDirImages = t => imagesIn(t.dir).map(f => ({ ext: /png$/i.test(f) ? 'png' : 'jpg', b64: fs.readFileSync(path.join(t.dir, f)).toString('base64') }));

function sniff(buf) {
    if (buf.length > 4 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'jpg';
    if (buf.length > 8 && buf.readUInt32BE(0) === 0x89504E47) return 'png';
    return null;
}

function saveImage(key, buf, add) {
    const t = targetOf(key);
    if (!t) throw new Error('هدف غير معروف');
    if (!buf || !buf.length || buf.length > MAX_IMG) throw new Error('حجم الصورة غير مقبول (الحد 6MB)');
    const ext = sniff(buf);
    if (!ext) throw new Error('الملف ليس صورة JPG أو PNG');
    const store = readStore();
    let list = [];
    if (t.kind === 'dir' && add) list = Array.isArray(store[t.key]) && store[t.key].length ? store[t.key] : currentDirImages(t);
    list = [...list, { ext, b64: buf.toString('base64') }];
    materialize(t, list);
    store[t.key] = list;
    writeJSON('custom_images.json', store);
    return list.length;
}

function resetImage(key) {
    const t = targetOf(key);
    if (!t || !REMOVABLE.includes(t.key)) throw new Error('الحذف متاح لخلفيتَي المستوى والزواج فقط');
    for (const e of ['jpg', 'jpeg', 'png']) { try { fs.unlinkSync(`${t.file}.${e}`); } catch (err) { /* غير موجود */ } }
    const store = readStore();
    delete store[t.key];
    writeJSON('custom_images.json', store);
}

function listImages() {
    const store = readStore();
    return TARGETS.map(t => ({
        key: t.key, label: t.label, kind: t.kind, count: imageFiles(t).length,
        custom: Array.isArray(store[t.key]) && store[t.key].length > 0, canReset: REMOVABLE.includes(t.key)
    }));
}
function imagePreview(key, i) {
    const t = targetOf(key);
    if (!t) return null;
    const p = imageFiles(t)[Number(i) || 0];
    if (!p) return null;
    try { return { buf: fs.readFileSync(p), type: /png$/i.test(p) ? 'image/png' : 'image/jpeg' }; } catch (e) { return null; }
}

process.on('exit', () => { try { flushStats(); } catch (e) { /* تجاهل */ } });

module.exports = {
    disabled, banned, saveSettings,
    noteMessage, noteCommand, getStats, flushStats,
    listUsers, changePoints,
    refreshThreads, listGroups, isRefreshing, threadsUpdatedAt, groupCount,
    saveImage, resetImage, listImages, imagePreview, MAX_IMG, TARGETS
};
