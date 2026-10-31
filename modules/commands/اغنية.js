/**
 * .اغنية <اسم الأغنية أو رابط> — يبحث ويرسل الأغنية كملف صوتي (بدون أي مفتاح).
 * يعتمد على yt-dlp: يجرّب يوتيوب أولًا ثم ساوندكلاود إن فشل (يوتيوب يحجب خوادم الاستضافة أحيانًا).
 * الحد: 25 ميجا (حد ماسنجر) ومدة أقصاها 10 دقائق.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

module.exports.config = {
    name: 'اغنية', aliases: ['song', 'اغنيه', 'أغنية', 'music', 'غنية'],
    description: 'ابحث عن أغنية وأرسلها كملف صوتي',
    usage: 'اغنية <اسم الأغنية أو رابطها>', category: 'media', cooldown: 20, adminOnly: false
};

const MAX_MB = 25, MAX_MIN = 10, TIMEOUT_MS = 150000, MAX_PARALLEL = 2;
let running = 0;

// ملف صوتي واحد جاهز (m4a/mp3) فلا نحتاج ffmpeg
const FORMAT = 'bestaudio[ext=m4a][filesize<25M]/bestaudio[ext=m4a][filesize_approx<25M]/bestaudio[ext=mp3]/bestaudio[ext=m4a]/bestaudio[protocol^=http]/bestaudio';
const SOURCES = [{ prefix: 'ytsearch1:', label: 'يوتيوب' }, { prefix: 'scsearch1:', label: 'ساوندكلاود' }];

const extractUrl = text => { const m = String(text || '').match(/https?:\/\/[^\s<>"']+/i); return m ? m[0].replace(/[)\].,،]+$/, '') : null; };
function isSafeUrl(u) {
    let url; try { url = new URL(u); } catch (e) { return false; }
    if (!/^https?:$/.test(url.protocol)) return false;
    const h = url.hostname.toLowerCase();
    if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h.includes(':')) return false;
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
const findFile = id => fs.readdirSync(os.tmpdir()).filter(f => f.startsWith(`kira-song-${id}.`) && !f.endsWith('.part')).map(f => path.join(os.tmpdir(), f))[0] || null;

module.exports.run = async ({ api, event, args, helpers, deco, cfg }) => {
    const reply = t => helpers.reply(api, event, t);
    const p = cfg.getPrefix();

    let input = args.join(' ').trim();
    if (!input && event.type === 'message_reply' && event.messageReply) input = String(event.messageReply.body || '').trim();
    input = input.replace(/[\u0000-\u001f]/g, ' ').trim();
    if (!input) return reply(deco.warning(`اكتب اسم الأغنية بعد الأمر\nمثال: ${p}اغنية سيد خليفة`));
    if (input.length > 120) return reply(deco.warning('الاسم طويل جدًا'));
    const url = extractUrl(input);
    if (url && !isSafeUrl(url)) return reply(deco.warning('هذا الرابط غير مسموح'));
    if (running >= MAX_PARALLEL) return reply(deco.warning('البوت مشغول بتحميلات أخرى، حاول بعد قليل'));

    running++;
    const id = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const prefix = path.join(os.tmpdir(), `kira-song-${id}`);
    try {
        const wait = await reply(deco.infoBox('🎵 الأغنية', `جاري البحث وتحميل: ${url ? 'الرابط' : input}\nقد يستغرق دقيقة`));
        let bin;
        try { bin = await require('../../utils/ytdlp').ensure(); }
        catch (e) { return reply(deco.errorBox('تعذّر تجهيز أداة التحميل على الخادم، حاول لاحقًا')); }

        // الرابط المباشر يُستعمل كما هو، والاسم يُبحث عنه في المصادر بالترتيب
        const targets = url ? [{ target: url, label: 'الرابط' }] : SOURCES.map(s => ({ target: s.prefix + input, label: s.label }));
        let file = null, title = '', source = '', tooBig = false, lastErr = '';
        for (const t of targets) {
            const { err, stdout, stderr } = await runYtdlp(bin, [
                '--no-playlist', '--no-warnings', '--restrict-filenames', '--socket-timeout', '20',
                '--max-filesize', `${MAX_MB}M`, '--match-filter', `!is_live & duration<=${MAX_MIN * 60}`,
                '-f', FORMAT, '-o', `${prefix}.%(ext)s`,
                '--print', '%(title).70s', '--no-simulate', '--', t.target
            ]);
            file = findFile(id);
            if (file) { title = stdout.split('\n').map(s => s.trim()).filter(Boolean)[0] || input; source = t.label; break; }
            if (/larger than max-filesize/i.test(stderr + stdout)) tooBig = true;
            lastErr = err ? stderr : lastErr;
        }

        if (!file) {
            if (tooBig) return reply(deco.warning(`الأغنية أكبر من ${MAX_MB} ميجا ولا يمكن إرسالها`));
            const s = lastErr.toLowerCase();
            const msg = s.includes('unsupported url') ? 'هذا الرابط غير مدعوم'
                : s.includes('does not pass filter') ? `الأغنية أطول من ${MAX_MIN} دقائق`
                : 'لم أجد الأغنية أو تعذّر تحميلها، جرّب اسمًا آخر أو أضف اسم المغني';
            return reply(deco.errorBox(msg));
        }
        if (fs.statSync(file).size > MAX_MB * 1024 * 1024) return reply(deco.warning(`الأغنية أكبر من ${MAX_MB} ميجا ولا يمكن إرسالها`));

        const stream = fs.createReadStream(file);
        stream.on('error', () => {});
        await new Promise(resolve => {
            api.sendMessage({ body: `🎵 ${title}\n🔎 المصدر: ${source}`, attachment: stream }, event.threadID, e => {
                if (e) return reply(deco.errorBox('تعذّر إرسال الملف الصوتي (ربما صيغته غير مدعومة)')).then(resolve);
                resolve();
            }, event.messageID);
        });
        if (wait && wait.messageID && typeof api.unsendMessage === 'function') api.unsendMessage(String(wait.messageID), () => {});
    } finally {
        running--;
        try { for (const f of fs.readdirSync(os.tmpdir())) if (f.startsWith(`kira-song-${id}.`)) fs.unlinkSync(path.join(os.tmpdir(), f)); } catch (e) { /* تجاهل */ }
    }
};
