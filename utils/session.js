/**
 * 🍪 حفظ دائم للكوكيز المحدّثة (Heba_DB/fb_cookies.json)
 *
 * - البوت يحفظ فيه أحدث كوكيز بعد كل دخول وبشكل دوري، فيرفعها cloudSync إلى GitHub مع باقي البيانات
 *   وتُسترجع بعد كل إعادة نشر على Render (بدل الرجوع للقيمة القديمة في FB_COOKIE).
 * - لو غيّرتَ FB_COOKIE (أو appstate.json) بكوكيز جديدة، تُعتمد الجديدة تلقائيًا بدل المحفوظة.
 * - أمر «رفع كوكيز» ولوحة التحكم يكتبان هنا أيضًا.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIR = process.env.SYNC_LOCAL_DIR || path.join(__dirname, '..', 'Heba_DB');
const FILE = path.join(DIR, 'fb_cookies.json');

const hash = text => crypto.createHash('sha1').update(String(text || '')).digest('hex');
const valid = s => Array.isArray(s) && s.length > 0 && s.some(c => c && c.key === 'c_user') && s.some(c => c && c.key === 'xs');
const fingerprint = s => hash(JSON.stringify((s || []).map(c => [c.key, c.value]).sort()));

/** يرجع { state, srcHash, origin, savedAt } أو null */
function load() {
    try {
        const j = JSON.parse(fs.readFileSync(FILE, 'utf8'));
        if (j && valid(j.state)) return j;
    } catch (e) { /* لا يوجد ملف أو تالف */ }
    return null;
}

/**
 * srcHash: بصمة مصدر الكوكيز الأصلي (FB_COOKIE أو محتوى appstate.json) وقت الحفظ.
 * عند التشغيل إن تغيّرت بصمة المصدر الحالي نعرف أنك وضعت كوكيز جديدة يدويًا.
 */
function save(state, origin, srcHash) {
    if (!valid(state)) return false;
    try {
        const prev = load();
        if (prev && fingerprint(prev.state) === fingerprint(state) && !origin) return false; // لا تغيير
        fs.mkdirSync(DIR, { recursive: true });
        const body = JSON.stringify({
            savedAt: new Date().toISOString(),
            origin: origin || 'auto',
            srcHash: srcHash !== undefined ? srcHash : (prev ? prev.srcHash : ''),
            state
        });
        const tmp = FILE + '.' + process.pid + '.tmp';
        fs.writeFileSync(tmp, body, { mode: 0o600 });
        fs.renameSync(tmp, FILE);
        return true;
    } catch (e) {
        console.log('[session] تعذّر حفظ الكوكيز:', e.message);
        return false;
    }
}

/* مزوّد الكوكيز الحيّة (يضبطه main.js بعد كل دخول) */
let provider = null;
let srcHashFn = () => '';
function setProvider(fn, srcFn) { provider = fn; if (srcFn) srcHashFn = srcFn; }

/** يحفظ أحدث كوكيز من الجلسة الحالية إن تغيّرت (يُستدعى دوريًا وقبل كل رفع إلى GitHub) */
function flushNow() {
    try {
        if (!provider) return false;
        const fresh = provider();
        return save(fresh, null, srcHashFn());
    } catch (e) { return false; }
}

function info() {
    const j = load();
    return j ? { savedAt: j.savedAt, origin: j.origin } : null;
}

module.exports = { load, save, hash, valid, setProvider, flushNow, info, FILE };
