/**
 * ⏻ حالة تشغيل/إيقاف البوت في المجموعات (Heba_DB/power.json، فتُحفظ مع بقية البيانات)
 *   all: true  ← كل المجموعات موقوفة، ويمكن تشغيل مجموعة بعينها باستثناء (threads[id] = 'on')
 *   all: false ← كل المجموعات تعمل، ويمكن إيقاف مجموعة بعينها (threads[id] = 'off')
 * لا يُخزَّن إلا ما يخالف الوضع العام، فالملف يبقى صغيرًا.
 */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'Heba_DB');
const FILE = path.join(DIR, 'power.json');

// كلمات أوامر الإيقاف والتشغيل: يمرّرها main.js للمطور حتى داخل مجموعة موقوفة
const OFF_WORDS = ['ايقاف', 'إيقاف', 'stop'];
const ON_WORDS = ['تشغيل', 'start'];
const POWER_WORDS = [...OFF_WORDS, ...ON_WORDS];

let state = { all: false, threads: {} };

function load() {
    try {
        const d = JSON.parse(fs.readFileSync(FILE, 'utf8'));
        const threads = {};
        if (d && d.threads && typeof d.threads === 'object') {
            for (const [k, v] of Object.entries(d.threads)) if (v === 'on' || v === 'off') threads[k] = v;
        }
        state = { all: !!(d && d.all === true), threads };
    } catch (e) {
        if (e.code !== 'ENOENT') console.error('power: تعذر قراءة power.json:', e.message);
    }
}
function save() {
    try {
        fs.mkdirSync(DIR, { recursive: true });
        const tmp = `${FILE}.${process.pid}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(state));
        fs.renameSync(tmp, FILE);
    } catch (e) { console.error('power: تعذر حفظ power.json:', e.message); }
}
load();

/** هل البوت موقوف في هذه المجموعة؟ */
function isOff(threadID) {
    const t = state.threads[String(threadID)];
    return t ? t === 'off' : state.all;
}

/** يوقف/يشغّل مجموعة واحدة */
function setThread(threadID, off) {
    const id = String(threadID), globalOff = state.all;
    if (off === globalOff) delete state.threads[id];      // يطابق الوضع العام: لا حاجة لاستثناء
    else state.threads[id] = off ? 'off' : 'on';
    save();
}

/** يوقف/يشغّل كل المجموعات ويمسح الاستثناءات */
function setAll(off) {
    state = { all: !!off, threads: {} };
    save();
}

function status() {
    return { all: state.all, exceptions: Object.keys(state.threads).length };
}

/** هل الرسالة أمر إيقاف/تشغيل من المطور؟ (تمرّ حتى في مجموعة موقوفة ليتمكن من إعادة التشغيل) */
function isPowerCommand(body, prefix, isAdmin) {
    if (!isAdmin || typeof body !== 'string' || !body.startsWith(prefix)) return false;
    const word = body.slice(prefix.length).trim().split(/\s+/)[0].toLowerCase();
    return POWER_WORDS.includes(word);
}

module.exports = { isOff, setThread, setAll, status, isPowerCommand, OFF_WORDS, ON_WORDS };
