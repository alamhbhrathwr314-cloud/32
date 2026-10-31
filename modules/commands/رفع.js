/**
 * .رفع — تغيير صور الأوامر (للمطور فقط)
 *
 * الطريقة:
 *   1) ردّ على صورة بـ  .رفع   (أو أرسل الصورة وفي تعليقها .رفع)
 *   2) يعرض البوت الأوامر التي تستعمل صورًا، ردّ برقم الأمر (أو اكتب .رفع <رقم>)
 *      - الرقم وحده: يستبدل الصور القديمة بالجديدة
 *      - الرقم + اضافة: (للأوامر ذات المجلد) يضيف الصورة بجانب القديمة
 *   3) يحفظ البوت الصورة مكان القديمة فورًا، بلا إعادة تشغيل.
 *
 * الحفظ بعد إعادة النشر: الصور تُخزَّن أيضًا في Heba_DB/custom_images.json
 * فيرفعها cloudSync إلى GitHub تلقائيًا، وتُستعاد عند التشغيل.
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');

module.exports.config = {
    name: 'رفع', aliases: ['upload', 'تغيير_صورة'],
    description: 'ردّ على صورة بـ رفع لتغيير صورة أحد الأوامر',
    usage: 'رفع (ردًّا على صورة) ثم رقم الأمر', category: 'tools', cooldown: 3, adminOnly: true
};

const ROOT = path.join(__dirname, '..', '..');
const ASSETS = path.join(ROOT, 'assets');
const STORE = path.join(ROOT, 'Heba_DB', 'custom_images.json');
const IMG_RE = /\.(jpe?g|png)$/i;
const MAX_BYTES = 6 * 1024 * 1024;
const TTL = 3 * 60 * 1000;
const CANCEL = ['الغاء', 'إلغاء', 'cancel'];
const ADD_WORDS = ['اضافة', 'إضافة', 'اضافه', 'add'];

/** الأوامر التي تقرأ صورًا من assets (kind=file: صورة واحدة باسم ثابت، kind=dir: مجلد صور) */
const TARGETS = [
    { key: 'help',    label: 'اوامر (قائمة الأوامر)',          kind: 'file', file: path.join(ASSETS, 'help') },
    { key: 'divorce', label: 'طلاق',                            kind: 'dir',  dir: path.join(ASSETS, 'divorce') },
    { key: 'slap',    label: 'صفع (قالب الصفعة)',               kind: 'dir',  dir: path.join(ASSETS, 'slap') },
    { key: 'lock',    label: 'القفل (إضافة البوت من غير المطور)', kind: 'file', file: path.join(ASSETS, 'lock') }
];

/* ─────────── التخزين الدائم ─────────── */
const readStore = () => { try { return JSON.parse(fs.readFileSync(STORE, 'utf8')) || {}; } catch (e) { return {}; } };
function writeStore(obj) {
    fs.mkdirSync(path.dirname(STORE), { recursive: true });
    const tmp = STORE + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(obj));
    fs.renameSync(tmp, STORE);
}

/* ─────────── الكتابة على القرص ─────────── */
const writeAtomic = (p, buf) => { const t = p + '.tmp'; fs.writeFileSync(t, buf); fs.renameSync(t, p); };
const imagesIn = dir => { try { return fs.readdirSync(dir).filter(f => IMG_RE.test(f)); } catch (e) { return []; } };

/** يضع قائمة الصور [{ext, b64}] مكان صور الهدف الحالية */
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

/** عند تحميل الأمر (بعد استرجاع GitHub): يطبّق الصور المخصّصة فوق صور المستودع */
function applyAll() {
    const store = readStore();
    for (const t of TARGETS) {
        const list = store[t.key];
        if (Array.isArray(list) && list.length) { try { materialize(t, list); } catch (e) { /* تجاهل */ } }
    }
}
try { applyAll(); } catch (e) { /* لا نمنع تحميل الأمر */ }

/** الصور الموجودة الآن في مجلد الهدف، لتدخل في التخزين عند "اضافة" */
function currentDirImages(t) {
    return imagesIn(t.dir).map(f => ({ ext: /png$/i.test(f) ? 'png' : 'jpg', b64: fs.readFileSync(path.join(t.dir, f)).toString('base64') }));
}

function saveImage(t, buf, ext, add) {
    const store = readStore();
    let list;
    if (t.kind === 'dir' && add) list = (Array.isArray(store[t.key]) && store[t.key].length ? store[t.key] : currentDirImages(t));
    else list = [];
    list = [...list, { ext, b64: buf.toString('base64') }];
    materialize(t, list);
    store[t.key] = list;
    writeStore(store);
    return list.length;
}

/* ─────────── الصورة المرفقة ─────────── */
const toLatinDigits = s => String(s).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));

function findPhoto(event) {
    const lists = [event.messageReply && event.messageReply.attachments, event.attachments];
    for (const l of lists) {
        const a = (l || []).find(x => x && ['photo', 'image'].includes(String(x.type)) && (x.url || x.largePreviewUrl || x.previewUrl));
        if (a) return a.url || a.largePreviewUrl || a.previewUrl;
    }
    return null;
}

function sniff(buf) {
    if (buf.length > 4 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'jpg';
    if (buf.length > 8 && buf.readUInt32BE(0) === 0x89504E47) return 'png';
    return null;
}

/* ─────────── الجلسات المعلّقة (صورة بانتظار اختيار الأمر) ─────────── */
const pending = new Map(); // `${threadID}:${senderID}` ← { buf, ext, at }
const keyOf = e => `${e.threadID}:${e.senderID}`;
const live = key => {
    const p = pending.get(key);
    if (!p) return null;
    if (Date.now() - p.at > TTL) { pending.delete(key); return null; }
    return p;
};

function menu(deco, prefix) {
    const store = readStore();
    const lines = TARGETS.map((t, i) => {
        const tag = Array.isArray(store[t.key]) && store[t.key].length ? '🖼️ مخصّصة' : '⚙️ الافتراضية';
        const extra = t.kind === 'dir' ? ` (${imagesIn(t.dir).length} صور)` : '';
        return `${i + 1}️⃣ ${t.label}${extra} — ${tag}`;
    });
    return deco.infoBox('رفع صورة', [
        'اختر الأمر الذي تريد تغيير صورته:',
        ...lines,
        '',
        '↩️ ردّ برقم الأمر، أو اكتب: ' + prefix + 'رفع <رقم>',
        '➕ للأوامر ذات الصور المتعددة: أضف كلمة «اضافة» بعد الرقم لإضافتها بدل الاستبدال',
        '❌ «الغاء» للإلغاء (تنتهي المهلة بعد 3 دقائق)'
    ].join('\n'));
}

/** يحاول تنفيذ الاختيار؛ يعيد true إن عالج الرسالة */
async function choose(ctx, p, text) {
    const { api, event, helpers, deco, cfg } = ctx;
    const say = t => helpers.reply(api, event, t);
    const key = keyOf(event);
    const clean = toLatinDigits(text).trim();

    if (CANCEL.includes(clean.toLowerCase())) {
        pending.delete(key);
        await say(deco.successLine('تم إلغاء الرفع'));
        return true;
    }
    const words = clean.split(/\s+/).filter(Boolean);
    const add = words.some(w => ADD_WORDS.includes(w.toLowerCase()));
    const numWord = words.find(w => /^\d{1,2}$/.test(w));
    if (!numWord) return false;
    const n = parseInt(numWord, 10);
    if (n < 1 || n > TARGETS.length) {
        await say(deco.warning(`اكتب رقمًا من 1 إلى ${TARGETS.length}`));
        return true;
    }
    const t = TARGETS[n - 1];
    pending.delete(key);
    try {
        const count = saveImage(t, p.buf, p.ext, add && t.kind === 'dir');
        const lines = [`✅ تم تغيير صورة «${t.label}»`];
        if (t.kind === 'dir') lines.push(add ? `➕ أُضيفت للمجلد (المجموع ${count})` : '🔄 استُبدلت الصور القديمة بالجديدة');
        if (t.key === 'slap') lines.push(`📐 إن اختلفت أماكن الوجوه: ${cfg.getPrefix()}صفع شبكة ثم ${cfg.getPrefix()}صفع ضبط`);
        await say(deco.successLine(lines.join('\n')));
    } catch (e) {
        await say(deco.errorBox('تعذّر حفظ الصورة: ' + (e && e.message || e)));
    }
    return true;
}

/* ─────────── الأمر ─────────── */
module.exports.run = async ctx => {
    const { api, event, args, helpers, deco, cfg } = ctx;
    const say = t => helpers.reply(api, event, t);
    const key = keyOf(event);

    // .رفع <رقم> بعد أن أُرسلت الصورة
    const existing = live(key);
    if (existing && args.length && !findPhoto(event)) {
        const done = await choose(ctx, existing, args.join(' '));
        if (done) return;
    }

    const url = findPhoto(event);
    if (!url) {
        return say(deco.warning(`ردّ على صورة بالأمر ${cfg.getPrefix()}رفع\n(أو أرسل الصورة وفي تعليقها ${cfg.getPrefix()}رفع)`));
    }

    let buf;
    try {
        const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000, maxContentLength: MAX_BYTES });
        buf = Buffer.from(res.data);
    } catch (e) {
        return say(deco.errorBox('تعذّر تنزيل الصورة، أعد إرسالها وجرّب مرة ثانية'));
    }
    const ext = sniff(buf);
    if (!ext) return say(deco.errorBox('صيغة الصورة غير مدعومة. أرسلها بصيغة JPG أو PNG'));

    pending.set(key, { buf, ext, at: Date.now() });

    // رقم مكتوب مع الأمر مباشرة: .رفع 2 (ردًّا على الصورة)
    if (args.length && await choose(ctx, pending.get(key), args.join(' '))) return;

    return say(menu(deco, cfg.getPrefix()));
};

/** ردّ المطور برقم بلا بادئة (يُستدعى من main.js للرسائل العادية) */
module.exports.onMessage = async ctx => {
    const { event, cfg } = ctx;
    const p = live(keyOf(event));
    if (!p) return false;
    if (!cfg.isAdmin(String(event.senderID))) return false;
    const text = String(event.body || '').trim();
    if (!text || text.length > 30) return false;
    return choose(ctx, p, text);
};
