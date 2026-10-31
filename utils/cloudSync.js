/**
 * ☁️ حفظ مجاني لبيانات البوت (Heba_DB/*.json) في مستودع GitHub خاص، ليبقى كل شيء بعد إعادة النشر.
 * - عند التشغيل: ينزّل من المستودع أي ملف json غير موجود محليًا (على Render المجاني يكون المجلد فارغًا فيُسترجع كل شيء).
 *   الملف الموجود محليًا لا يُستبدل أبدًا (إلا إن وضعت SYNC_FORCE_RESTORE=1).
 * - أثناء العمل: كل SYNC_INTERVAL_MIN دقيقة (افتراضيًا 5) يرفع الملفات التي تغيّرت فقط، ويرفع آخر مرة عند إيقاف الخدمة.
 * يعمل فقط إذا وُجد SYNC_GITHUB_TOKEN و SYNC_GITHUB_REPO (بصيغة user/repo)، وإلا لا يفعل شيئًا.
 * اختياري: SYNC_GITHUB_DIR (مجلد داخل المستودع، افتراضيًا kira-data)، SYNC_GITHUB_BRANCH.
 * يتعامل مع ملفات json في أعلى مجلد Heba_DB فقط (بلا مجلدات فرعية ولا صور ولا yt-dlp).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');

const DIR = process.env.SYNC_LOCAL_DIR || path.join(__dirname, '..', 'Heba_DB');
const API = process.env.SYNC_API_URL || 'https://api.github.com';
const MAX_FILE = 20 * 1024 * 1024;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('[sync]', ...a);

const cfg = () => ({
    token: process.env.SYNC_GITHUB_TOKEN, repo: process.env.SYNC_GITHUB_REPO,
    dir: (process.env.SYNC_GITHUB_DIR || 'kira-data').replace(/^\/+|\/+$/g, ''),
    branch: process.env.SYNC_GITHUB_BRANCH || ''
});
const enabled = () => { const c = cfg(); return !!(c.token && c.repo && /^[\w.-]+\/[\w.-]+$/.test(c.repo)); };

const hash = buf => crypto.createHash('sha1').update(buf).digest('hex');
const remote = new Map();   // اسم الملف ← sha في GitHub
const pushed = new Map();   // اسم الملف ← هاش آخر محتوى رُفع/نُزّل
let pushing = false;
let ready = false;          // لا نرفع شيئًا قبل أن ننجح في قراءة المستودع مرة واحدة (حتى لا نكتب فوق نسخة سليمة ببيانات فارغة)

function http(method, url, data, extra = {}) {
    const c = cfg();
    return axios({
        method, url: `${API}/repos/${c.repo}/contents/${url}`, data, timeout: 30000, validateStatus: () => true,
        params: c.branch ? { ref: c.branch } : undefined,
        headers: { Authorization: `Bearer ${c.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'kira-bot-sync', ...(extra.headers || {}) },
        responseType: extra.responseType
    });
}
const remotePath = name => `${cfg().dir}/${name}`;
const localFiles = () => { try { return fs.readdirSync(DIR).filter(f => /^[^/\\]+\.json$/i.test(f)); } catch (e) { return []; } };

async function listRemote() {
    const res = await http('get', cfg().dir);
    if (res.status === 404) return [];
    if (res.status !== 200 || !Array.isArray(res.data)) throw new Error(`GitHub ${res.status}: تعذّر قراءة المستودع (تحقق من التوكن واسم المستودع)`);
    return res.data.filter(f => f.type === 'file' && /\.json$/i.test(f.name));
}

/** عند بدء التشغيل: يسترجع الملفات الناقصة محليًا */
async function restore(forceOverride = false) {
    if (!enabled()) return;
    const force = forceOverride || process.env.SYNC_FORCE_RESTORE === '1';
    fs.mkdirSync(DIR, { recursive: true });
    let files;
    try { files = await listRemote(); } catch (e) { log(e.message); return; }
    ready = true;
    let n = 0;
    for (const f of files) {
        remote.set(f.name, f.sha);
        const local = path.join(DIR, f.name);
        if (fs.existsSync(local) && !force) { continue; }              // المحلي له الأولوية
        const res = await http('get', remotePath(f.name), undefined, { headers: { Accept: 'application/vnd.github.raw+json' }, responseType: 'arraybuffer' });
        if (res.status !== 200) { log(`فشل تنزيل ${f.name} (${res.status})`); continue; }
        const buf = Buffer.from(res.data);
        try { JSON.parse(buf.toString('utf8')); } catch (e) { log(`تجاهلت ${f.name}: ليس json سليمًا`); continue; }
        const tmp = local + '.restore.tmp'; fs.writeFileSync(tmp, buf); fs.renameSync(tmp, local);
        pushed.set(f.name, hash(buf)); n++;
    }
    log(`تم استرجاع ${n} ملف من GitHub (${files.length} موجود في المستودع)`);
}

async function putFile(name, buf) {
    const body = (sha) => ({ message: `backup ${name} ${new Date().toISOString()}`, content: buf.toString('base64'), ...(sha ? { sha } : {}), ...(cfg().branch ? { branch: cfg().branch } : {}) });
    let res = await http('put', remotePath(name), body(remote.get(name)));
    if (res.status === 409 || res.status === 422) {                      // sha قديم: نجلب الحالي ونعيد مرة واحدة
        const cur = await http('get', remotePath(name));
        if (cur.status === 200 && cur.data && cur.data.sha) { remote.set(name, cur.data.sha); res = await http('put', remotePath(name), body(cur.data.sha)); }
    }
    if (res.status === 200 || res.status === 201) { remote.set(name, res.data.content.sha); return true; }
    log(`فشل رفع ${name} (${res.status})`);
    return false;
}

/** يرفع الملفات التي تغيّرت منذ آخر رفع */
async function pushChanges() {
    if (!enabled() || pushing) return 0;
    pushing = true; let n = 0;
    try {
        if (!ready) { // فشل الاسترجاع عند التشغيل: نعيد المحاولة، وعند النجاح تُنزَّل نسخة GitHub فوق المحلي (المحلي حديث جدًا)
            await restore(true);
            if (!ready) { log('GitHub غير متاح، أجّلت الرفع'); return 0; }
        }
        for (const name of localFiles()) {
            const file = path.join(DIR, name);
            let buf; try { buf = fs.readFileSync(file); } catch (e) { continue; }
            if (buf.length === 0 || buf.length > MAX_FILE) continue;
            try { JSON.parse(buf.toString('utf8')); } catch (e) { continue; }   // لا نرفع ملفًا نصف مكتوب
            const h = hash(buf);
            if (pushed.get(name) === h) continue;
            if (await putFile(name, buf)) { pushed.set(name, h); n++; }
            await sleep(300);
        }
        if (n) log(`تم رفع ${n} ملف إلى GitHub`);
    } catch (e) { log('خطأ أثناء الرفع:', e.message); }
    finally { pushing = false; }
    return n;
}

function startAutoPush() {
    if (!enabled()) { log('الحفظ السحابي غير مفعّل (أضف SYNC_GITHUB_TOKEN و SYNC_GITHUB_REPO)'); return; }
    const min = Math.max(1, Number(process.env.SYNC_INTERVAL_MIN) || 5);
    setInterval(() => { pushChanges(); }, min * 60 * 1000).unref();
    let closing = false;
    for (const sig of ['SIGTERM', 'SIGINT']) process.once(sig, async () => {
        if (closing) return; closing = true;
        await Promise.race([pushChanges(), sleep(10000)]);
        process.exit(0);
    });
    log(`الحفظ السحابي شغّال: رفع كل ${min} دقائق إلى ${cfg().repo}/${cfg().dir}`);
}

module.exports = { restore, pushChanges, startAutoPush, enabled };
