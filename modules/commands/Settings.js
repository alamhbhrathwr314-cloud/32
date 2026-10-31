/**
 * ⚙️ .اعدادات — حماية المجموعة (لأدمن المجموعة والمطور فقط)
 *   1) 🏷️ حماية الكنية        تمنع تغيير كنية أي عضو (تُعاد كما كانت وقت التفعيل)
 *   2) 📝 حماية اسم المجموعة   تمنع تغيير الاسم
 *   3) 🖼️ حماية صورة المجموعة  تمنع تغيير الصورة
 * كل حماية تُشغَّل وتُوقَف على حدة: ردّ على رسالة القائمة برقم الإعداد، أو اكتب .اعدادات 1 [تشغيل|ايقاف]
 * عند التفعيل نحفظ لقطة من الحالة الحالية، وأي تغيير بعدها يُلغى تلقائيًا (يستقبل أحداث المجموعة عبر onEvent).
 * الإعدادات في Heba_DB/group_settings.json وصورة المجموعة المحفوظة في Heba_DB/group_images/.
 */
const fs = require('fs-extra');
const path = require('path');

const DIR = path.join(__dirname, '..', '..', 'Heba_DB');
const FILE = path.join(DIR, 'group_settings.json');
const IMG_DIR = path.join(DIR, 'group_images');
const SESSION_TTL = 15 * 60 * 1000;

module.exports.config = {
    name: 'اعدادات', aliases: ['settings', 'اعداد', 'الاعدادات', 'حماية'],
    description: 'حماية المجموعة: الكنية والاسم والصورة (للأدمن والمطور)',
    usage: 'اعدادات [رقم | كنية | اسم | صورة] [تشغيل | ايقاف]', category: 'admin', cooldown: 3, adminOnly: false
};

const FEATURES = [
    { key: 'nick',  n: 1, emoji: '🏷️', name: 'حماية الكنية',         words: ['كنية', 'كنيه', 'الكنية', 'nick'] },
    { key: 'name',  n: 2, emoji: '📝', name: 'حماية اسم المجموعة',   words: ['اسم', 'الاسم', 'name'] },
    { key: 'image', n: 3, emoji: '🖼️', name: 'حماية صورة المجموعة',  words: ['صورة', 'صوره', 'الصورة', 'image'] }
];
const ON_WORDS = ['تشغيل', 'تفعيل', 'فتح', 'on', 'شغل'];
const OFF_WORDS = ['ايقاف', 'إيقاف', 'تعطيل', 'اطفاء', 'إطفاء', 'off', 'وقف'];

/* ═══════════ التخزين ═══════════ */
function readAll() { try { return JSON.parse(fs.readFileSync(FILE, 'utf-8')); } catch (e) { return {}; } }
function writeAll(o) {
    fs.mkdirSync(DIR, { recursive: true });
    const tmp = `${FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(o, null, 2));
    fs.renameSync(tmp, FILE);
}
const imgFile = tid => path.join(IMG_DIR, `${String(tid).replace(/\W/g, '')}.jpg`);
const toLatin = t => String(t || '').replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x660));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const logWarn = m => { try { require('../../utils/log')(m, 'warn'); } catch (e) { console.warn(m); } };

/* ═══════════ مساعدات ماسنجر ═══════════ */
const getInfo = (api, tid) => new Promise(resolve => {
    try { api.getThreadInfo(tid, (err, info) => resolve(err ? null : info)); } catch (e) { resolve(null); }
});
const isGroupAdmin = (info, uid) => ((info && info.adminIDs) || []).some(a => String(a && a.id !== undefined ? a.id : a) === String(uid));

/** المطور أو أدمن المجموعة */
async function canManage(api, event, cfg) {
    if (cfg.isAdmin(String(event.senderID))) return { ok: true };
    const info = await getInfo(api, event.threadID);
    return { ok: isGroupAdmin(info, event.senderID), info };
}

/* ═══════════ تشغيل / إيقاف ═══════════ */
async function enable(api, tid, feature) {
    const info = await getInfo(api, tid);
    if (!info) return { error: 'تعذّر قراءة معلومات المجموعة، حاول لاحقًا' };
    const all = readAll(), st = all[tid] || {};
    if (feature.key === 'nick') {
        st.nick = { on: true, map: Object.assign({}, info.nicknames || {}) };
    } else if (feature.key === 'name') {
        if (!info.threadName) return { error: 'المجموعة بلا اسم، ضع لها اسمًا أولًا ثم فعّل الحماية' };
        st.name = { on: true, value: info.threadName };
    } else {
        if (!info.imageSrc) return { error: 'المجموعة بلا صورة، ضع لها صورة أولًا ثم فعّل الحماية' };
        try {
            const axios = require('axios');
            const res = await axios.get(info.imageSrc, { responseType: 'arraybuffer', timeout: 20000 });
            fs.mkdirSync(IMG_DIR, { recursive: true });
            fs.writeFileSync(imgFile(tid), Buffer.from(res.data));
        } catch (e) { return { error: 'تعذّر حفظ صورة المجموعة الحالية، حاول لاحقًا' }; }
        st.image = { on: true };
    }
    all[tid] = st; writeAll(all);
    return { ok: true };
}
function disable(tid, feature) {
    const all = readAll();
    if (all[tid]) {
        delete all[tid][feature.key];
        if (!Object.keys(all[tid]).length) delete all[tid];
        writeAll(all);
    }
    if (feature.key === 'image') try { fs.unlinkSync(imgFile(tid)); } catch (e) { /* غير موجود */ }
}
const isOn = (tid, key) => !!(readAll()[tid] && readAll()[tid][key] && readAll()[tid][key].on);

async function apply(api, tid, feature, desired) {
    const on = isOn(tid, feature.key);
    const want = desired === 'toggle' ? !on : desired;
    if (want === on) return `${feature.emoji} ${feature.name} ${on ? 'مفعّلة' : 'متوقفة'} أصلًا`;
    if (want) {
        const r = await enable(api, tid, feature);
        return r.error ? `⚠️ ${r.error}` : `✅ تم تفعيل ${feature.name}`;
    }
    disable(tid, feature);
    return `⛔ تم إيقاف ${feature.name}`;
}

/* ═══════════ الواجهة ═══════════ */
function menu(tid, deco, note) {
    const rows = FEATURES.map(f => `[${f.n}] ${f.emoji} ${f.name} — ${isOn(tid, f.key) ? '✅ مفعّلة' : '⛔ متوقفة'}`);
    return deco.infoBox('⚙️ إعدادات المجموعة', [note || null, note ? '' : null, ...rows, '', '↩️ رد برقم الإعداد لتشغيله أو إيقافه']
        .filter(x => x !== null).join('\n'));
}
const sessions = new Map(); // معرّف رسالة القائمة ← { tid, at }
function remember(info, tid) {
    if (!info || !info.messageID || info.messageID === 'sent') return;
    const now = Date.now();
    for (const [k, v] of sessions) if (now - v.at > SESSION_TTL) sessions.delete(k);
    sessions.set(String(info.messageID), { tid: String(tid), at: now });
}

module.exports.run = async ({ api, event, args, helpers, deco, cfg }) => {
    const reply = t => helpers.reply(api, event, t);
    if (event.isGroup === false) return reply(deco.warning('هذا الأمر يعمل داخل المجموعات فقط'));
    const perm = await canManage(api, event, cfg);
    if (!perm.ok) return reply(deco.reject('هذا الأمر لأدمن المجموعة والمطور فقط'));

    const tid = String(event.threadID);
    let note = null;
    if (args[0]) {
        const a = toLatin(args[0]).toLowerCase();
        const feature = FEATURES.find(f => String(f.n) === a || f.words.includes(a));
        if (!feature) return reply(deco.warning(`لا يوجد إعداد «${args[0]}»\nاكتب ${cfg.getPrefix()}اعدادات لعرض القائمة`));
        const w = String(args[1] || '').toLowerCase();
        const desired = ON_WORDS.includes(w) ? true : OFF_WORDS.includes(w) ? false : 'toggle';
        note = await apply(api, tid, feature, desired);
    }
    remember(await reply(menu(tid, deco, note)), tid);
};

/** الرد على رسالة القائمة برقم الإعداد */
module.exports.onMessage = async ({ api, event, helpers, deco, cfg }) => {
    if (event.type !== 'message_reply' || !event.messageReply) return false;
    const s = sessions.get(String(event.messageReply.messageID));
    if (!s) return false;
    if (Date.now() - s.at > SESSION_TTL) { sessions.delete(String(event.messageReply.messageID)); return false; }
    if (String(event.threadID) !== s.tid) return false;
    const feature = FEATURES.find(f => String(f.n) === toLatin(event.body).trim());
    if (!feature) return false;

    const perm = await canManage(api, event, cfg);
    if (!perm.ok) { await helpers.reply(api, event, deco.reject('هذا الأمر لأدمن المجموعة والمطور فقط')); return true; }
    const note = await apply(api, s.tid, feature, 'toggle');
    remember(await helpers.reply(api, event, menu(s.tid, deco, note)), s.tid);
    return true;
};

/* ═══════════ الحماية: أحداث المجموعة (يستدعيها main.js) ═══════════ */
const recent = new Map(); // يمنع تكرار الاسترجاع لنفس الحدث خلال ثانيتين
const noticed = new Map(); // تنبيه واحد كل 30 ثانية لكل مجموعة وميزة
function guard(map, key, ms) {
    const now = Date.now();
    if (now - (map.get(key) || 0) < ms) return false;
    map.set(key, now);
    return true;
}
const call = (fn) => new Promise(resolve => { try { fn(err => resolve(err || null)); } catch (e) { resolve(e); } });

module.exports.onEvent = async ({ api, event }) => {
    const type = event.logMessageType;
    if (!['log:thread-name', 'log:user-nickname', 'log:thread-image'].includes(type)) return;
    if (String(event.author) === String(api.getCurrentUserID())) return; // تغييرات البوت نفسه
    const tid = String(event.threadID);
    const st = readAll()[tid];
    if (!st) return;
    const data = event.logMessageData || {};
    const notice = (key, text) => { if (guard(noticed, `${tid}:${key}`, 30000)) { try { api.sendMessage(text, tid); } catch (e) { /* تجاهل */ } } };

    if (type === 'log:user-nickname' && st.nick && st.nick.on) {
        const pid = String(data.participant_id);
        const want = (st.nick.map && st.nick.map[pid]) || '';
        if ((data.nickname || '') === want || !guard(recent, `${tid}:n:${pid}`, 2000)) return;
        await sleep(700);
        const err = await call(cb => api.changeNickname(want, tid, pid, cb));
        if (err) return logWarn(`حماية الكنية: تعذّر الاسترجاع (${(err && (err.error || err.message)) || err})`);
        notice('nick', '🛡️ حماية الكنية مفعّلة: تم إلغاء تغيير الكنية');
    }

    if (type === 'log:thread-name' && st.name && st.name.on) {
        if ((data.name || '') === st.name.value || !guard(recent, `${tid}:name`, 2000)) return;
        await sleep(700);
        const err = await call(cb => api.setTitle(st.name.value, tid, cb));
        if (err) return logWarn(`حماية الاسم: تعذّر الاسترجاع (${(err && (err.error || err.message)) || err})`);
        notice('name', '🛡️ حماية اسم المجموعة مفعّلة: تم إلغاء تغيير الاسم');
    }

    if (type === 'log:thread-image' && st.image && st.image.on) {
        if (!fs.existsSync(imgFile(tid)) || !guard(recent, `${tid}:image`, 2000)) return;
        await sleep(700);
        const stream = fs.createReadStream(imgFile(tid));
        stream.on('error', () => {}); // لا نُسقط البوت إن حُذف الملف أثناء القراءة
        const err = await call(cb => api.changeGroupImage(stream, tid, cb));
        if (err) return logWarn(`حماية الصورة: تعذّر الاسترجاع (${(err && (err.error || err.message)) || err})`);
        notice('image', '🛡️ حماية صورة المجموعة مفعّلة: تم إلغاء تغيير الصورة');
    }
};
