/**
 * .تحميل <رابط> — يحمّل الفيديو/الصوت/الصورة من أي رابط ويرسله
 * (انستغرام، تيك توك، فيسبوك، يوتيوب، تويتر، ساوندكلاود، وروابط الملفات المباشرة وغيرها مما يدعمه yt-dlp).
 * أو ردّ على رسالة تحتوي رابطًا بـ .تحميل
 *
 * الحدود (يمكن تغييرها بمتغيرات البيئة):
 *   DL_MAX_MB  الحجم الأقصى بالميجا (الافتراضي 100)
 *   DL_MAX_MIN المدة القصوى بالدقائق (الافتراضي 60)
 *   DL_TIMEOUT_MS مهلة التحميل (الافتراضي 10 دقائق)
 * إن فشل إرسال ملف أكبر من 25 ميجا (حد ماسنجر الآمن) يعيد البوت التحميل بجودة أقل تلقائيًا.
 *
 * انستغرام وبعض المواقع تطلب تسجيل دخول: ضع كوكيز بصيغة Netscape في Heba_DB/ytdlp_cookies.txt
 * أو في متغير البيئة YTDLP_COOKIES.
 * تحميل الجودة العالية في يوتيوب (فيديو وصوت منفصلان) يحتاج ffmpeg على الخادم، وبدونه يُحمَّل ملف جاهز بجودة أقل.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const axios = require('axios');
const { execFile } = require('child_process');

module.exports.config = {
    name: 'تحميل', aliases: ['download', 'dl', 'تنزيل', 'فيديو'],
    description: 'تحميل فيديو أو صوت أو صورة من أي رابط وإرساله',
    usage: 'تحميل <رابط>  (أو رد على رسالة فيها رابط)', category: 'media', cooldown: 20, adminOnly: false
};

const num = (name, def) => Number(process.env[name]) || def;
const MAX_MB = num('DL_MAX_MB', 100), MAX_MIN = num('DL_MAX_MIN', 60), TIMEOUT_MS = num('DL_TIMEOUT_MS', 10 * 60 * 1000);
const SAFE_MB = 25, MAX_PARALLEL = 2;
let running = 0;

let ffmpegOk = null;
const hasFfmpeg = () => ffmpegOk !== null ? Promise.resolve(ffmpegOk)
    : new Promise(r => execFile('ffmpeg', ['-version'], { timeout: 10000 }, e => { ffmpegOk = !e; r(ffmpegOk); }));

/** من الأفضل للأقل: دمج فيديو+صوت (إن وُجد ffmpeg) ثم ملف واحد جاهز، وأخيرًا أي صيغة متاحة (صوت، فيديو بصيغة أخرى...) */
function formatFor(limitMB, merge) {
    const L = `${limitMB}M`, f = [];
    if (merge) for (const h of [1080, 720, 480]) f.push(`bv*[height<=${h}][filesize<${L}]+ba`, `bv*[height<=${h}][filesize_approx<${L}]+ba`);
    for (const h of [1080, 720]) f.push(`b[ext=mp4][height<=${h}][filesize<${L}]`, `b[ext=mp4][height<=${h}][filesize_approx<${L}]`);
    f.push('b[ext=mp4][height<=480]', '18', 'b[height<=480]', 'b[height<=360]', 'b', 'w');
    return f.join('/');
}

/** كوكيز اختيارية لـ yt-dlp (انستغرام وغيره) */
function cookiesArg() {
    try {
        let file = path.join(__dirname, '..', '..', 'Heba_DB', 'ytdlp_cookies.txt');
        if (process.env.YTDLP_COOKIES) {
            file = path.join(os.tmpdir(), 'kira-ytdlp-cookies.txt');
            fs.writeFileSync(file, process.env.YTDLP_COOKIES.replace(/\\n/g, '\n'), { mode: 0o600 });
        }
        return fs.existsSync(file) ? ['--cookies', file] : [];
    } catch (e) { return []; }
}

const extractUrl = text => { const m = String(text || '').match(/https?:\/\/[^\s<>"']+/i); return m ? m[0].replace(/[)\].,،]+$/, '') : null; };

/** يمنع الروابط المحلية/الداخلية (حماية من SSRF) */
function isSafeUrl(u) {
    let url; try { url = new URL(u); } catch (e) { return false; }
    if (!/^https?:$/.test(url.protocol)) return false;
    const h = url.hostname.toLowerCase();
    if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h === '[::1]' || h.includes(':')) return false;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
        const [a, b] = h.split('.').map(Number);
        if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return false;
    }
    return true;
}

const runYtdlp = (bin, args) => new Promise(resolve => {
    execFile(bin, args, { timeout: TIMEOUT_MS, maxBuffer: 5 * 1024 * 1024, env: { ...process.env, LC_ALL: 'C.UTF-8' } },
        (err, stdout, stderr) => resolve({ err, stdout: String(stdout || ''), stderr: String(stderr || '') }));
});

function friendlyError(stderr, timedOut) {
    const s = stderr.toLowerCase();
    if (timedOut) return 'انتهت مهلة التحميل، جرّب فيديو أقصر';
    if (s.includes('unsupported url')) return 'هذا الرابط غير مدعوم أو لا يحتوي فيديو';
    if (s.includes('sign in') || s.includes('login') || s.includes('private') || s.includes('cookies')) return 'الفيديو خاص أو يتطلب تسجيل دخول';
    if (s.includes('video unavailable') || s.includes('not available') || s.includes('removed')) return 'الفيديو غير متاح أو حُذف';
    if (s.includes('does not pass filter')) return `الفيديو أطول من ${MAX_MIN} دقيقة`;
    if (s.includes('http error 429') || s.includes('too many requests')) return 'الموقع يحدّ الطلبات الآن، حاول لاحقًا';
    if (s.includes('no video') || s.includes('there is no video')) return 'لا يوجد فيديو في هذا المنشور';
    return 'تعذّر تحميل الملف من هذا الرابط (إن كان انستغرام فقد يحتاج كوكيز)';
}

const MB = 1024 * 1024;
const IMG_URL = /\.(jpe?g|png|gif|webp)(\?|#|$)/i;
const listFiles = id => fs.readdirSync(os.tmpdir()).filter(f => f.startsWith(`kira-dl-${id}.`) && !f.endsWith('.part')).map(f => path.join(os.tmpdir(), f));
const cleanup = id => { try { for (const f of fs.readdirSync(os.tmpdir())) if (f.startsWith(`kira-dl-${id}.`)) fs.unlinkSync(path.join(os.tmpdir(), f)); } catch (e) { /* تجاهل */ } };

/** رابط صورة مباشر: ننزّله بلا yt-dlp */
async function fetchImage(url, prefix) {
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000, maxContentLength: SAFE_MB * MB, maxRedirects: 5 });
    const ext = (new URL(url).pathname.match(/\.(jpe?g|png|gif|webp)$/i) || [, 'jpg'])[1].toLowerCase();
    const file = `${prefix}.${ext}`;
    fs.writeFileSync(file, Buffer.from(res.data));
    return file;
}

const send = (api, event, body, file) => new Promise(resolve => {
    const stream = fs.createReadStream(file);
    stream.on('error', () => {}); // لا نُسقط البوت إن حُذف الملف أثناء القراءة
    try { api.sendMessage({ body, attachment: stream }, event.threadID, e => resolve(!e), event.messageID); }
    catch (e) { resolve(false); }
});

module.exports.run = async ({ api, event, args, helpers, deco, cfg }) => {
    const reply = t => helpers.reply(api, event, t);
    const p = cfg.getPrefix();

    const url = extractUrl(args.join(' ')) || (event.type === 'message_reply' && event.messageReply ? extractUrl(event.messageReply.body) : null);
    if (!url) return reply(deco.warning(`أرسل أي رابط بعد الأمر أو ردّ على رسالة فيها رابط\nمثال: ${p}تحميل https://www.instagram.com/reel/...`));
    if (!isSafeUrl(url)) return reply(deco.warning('هذا الرابط غير مسموح'));
    if (running >= MAX_PARALLEL) return reply(deco.warning('البوت مشغول بتحميلات أخرى، حاول بعد قليل'));

    running++;
    const id = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const prefix = path.join(os.tmpdir(), `kira-dl-${id}`);
    let wait = null;
    const dropWait = () => { if (wait && wait.messageID && typeof api.unsendMessage === 'function') api.unsendMessage(String(wait.messageID), () => {}); };
    try {
        wait = await reply(deco.infoBox('⏳ التحميل', 'جاري التحميل... قد يستغرق بضع دقائق للفيديوهات الطويلة'));

        // صورة مباشرة
        let direct = null;
        try { direct = IMG_URL.test(new URL(url).pathname + new URL(url).search) ? await fetchImage(url, prefix) : null; } catch (e) { direct = null; }
        if (direct) {
            const ok = await send(api, event, '🖼️ تم التحميل', direct);
            if (ok) dropWait(); else await reply(deco.errorBox('تعذّر إرسال الصورة'));
            return;
        }

        let bin;
        try { bin = await require('../../utils/ytdlp').ensure(); }
        catch (e) { return reply(deco.errorBox('تعذّر تجهيز أداة التحميل على الخادم، حاول لاحقًا')); }
        const merge = await hasFfmpeg();
        const cookies = cookiesArg();

        const limits = MAX_MB > SAFE_MB ? [MAX_MB, SAFE_MB] : [MAX_MB];
        for (let i = 0; i < limits.length; i++) {
            const limit = limits[i], last = i === limits.length - 1;
            cleanup(id);
            const { err, stdout, stderr } = await runYtdlp(bin, [
                '--no-playlist', '--no-warnings', '--restrict-filenames', '--socket-timeout', '30',
                '--max-filesize', `${limit}M`, '--match-filter', `!is_live & duration<=?${MAX_MIN * 60}`,
                '-f', formatFor(limit, merge), ...(merge ? ['--merge-output-format', 'mp4'] : []), ...cookies,
                '-o', `${prefix}.%(ext)s`, '--print', '%(title).70s', '--no-simulate',
                '--', url
            ]);
            const file = listFiles(id)[0] || null;

            if (!file) {
                if (!err && /larger than max-filesize|too large/i.test(stderr + stdout)) return reply(deco.warning(`الملف أكبر من ${limit} ميجا`));
                return reply(deco.errorBox(err ? friendlyError(stderr, err.killed) : `الملف أكبر من ${limit} ميجا أو لا يمكن تحميله`));
            }
            const size = fs.statSync(file).size;
            if (size > limit * MB) return reply(deco.warning(`الملف أكبر من ${limit} ميجا`));

            const title = stdout.split('\n').map(s => s.trim()).filter(Boolean)[0] || 'تم التحميل';
            if (await send(api, event, `🎬 ${title}`, file)) { dropWait(); return; }

            // فشل الإرسال: إن كان الملف أكبر من حد ماسنجر الآمن نعيد بجودة أقل، وإلا نبلّغ
            if (size > SAFE_MB * MB && !last) continue;
            return reply(deco.errorBox(size > SAFE_MB * MB
                ? `تعذّر إرسال الملف (${Math.round(size / MB)} ميجا) لأن ماسنجر رفضه`
                : 'تعذّر إرسال الملف (ربما بصيغة غير مدعومة)'));
        }
    } finally {
        running--;
        cleanup(id);
    }
};
