/**
 * 🎞️ مدير yt-dlp: يجد البرنامج أو ينزّله تلقائيًا (نسخة مستقلة لا تحتاج Python) ويحدّثه أسبوعيًا.
 * الترتيب: YTDLP_PATH (متغير بيئة) ← yt-dlp في PATH ← Heba_DB/bin/yt-dlp ← تنزيل من GitHub.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const axios = require('axios');

const ASSET = process.arch === 'arm64' ? 'yt-dlp_linux_aarch64' : 'yt-dlp_linux';
const URL = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${ASSET}`;
const WEEK = 7 * 24 * 3600 * 1000;

const binDirs = () => [path.join(__dirname, '..', 'Heba_DB', 'bin'), path.join(os.tmpdir(), 'kira-bin')];
const works = bin => new Promise(resolve => execFile(bin, ['--version'], { timeout: 20000 }, err => resolve(!err)));

let pending = null;
async function ensure() {
    if (process.env.YTDLP_PATH) return process.env.YTDLP_PATH;
    if (await works('yt-dlp')) return 'yt-dlp';
    for (const dir of binDirs()) {
        const bin = path.join(dir, 'yt-dlp');
        if (fs.existsSync(bin) && await works(bin)) { maybeUpdate(bin); return bin; }
    }
    if (!pending) pending = install().finally(() => { pending = null; });
    return pending;
}

async function install() {
    let lastErr;
    for (const dir of binDirs()) {
        try {
            fs.mkdirSync(dir, { recursive: true });
            const bin = path.join(dir, 'yt-dlp'), tmp = `${bin}.${process.pid}.part`;
            const res = await axios.get(URL, { responseType: 'arraybuffer', timeout: 180000, maxRedirects: 5, maxContentLength: 120 * 1024 * 1024 });
            fs.writeFileSync(tmp, Buffer.from(res.data));
            fs.chmodSync(tmp, 0o755);
            fs.renameSync(tmp, bin);
            if (await works(bin)) return bin;
            lastErr = new Error('النسخة المنزّلة لا تعمل على هذا النظام');
        } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('تعذّر تنزيل yt-dlp');
}

/** تحديث صامت إن مرّ أسبوع على آخر تحديث (يوتيوب وغيره يغيّرون طرقهم باستمرار) */
function maybeUpdate(bin) {
    try {
        if (Date.now() - fs.statSync(bin).mtimeMs < WEEK) return;
        execFile(bin, ['-U'], { timeout: 120000 }, () => { try { const t = new Date(); fs.utimesSync(bin, t, t); } catch (e) { /* تجاهل */ } });
    } catch (e) { /* تجاهل */ }
}

module.exports = { ensure };
