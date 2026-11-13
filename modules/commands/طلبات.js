/**
 * 📥 .طلبات — إدارة طلبات الانضمام للمجموعة (لأدمن المجموعة والمطور فقط)
 *   .طلبات                  يعرض حالة ميزة «الموافقة على الأعضاء» وقائمة المنتظرين بأرقام
 *   ردّ على القائمة برقم     يقبل صاحب الرقم  •  ردّ بـ 0 يشغّل/يوقف الميزة  •  ردّ بـ «الكل» يقبل الجميع
 *   .طلبات تشغيل | ايقاف     يشغّل أو يوقف الميزة مباشرة
 *   .طلبات قبول <رقم|الكل>   يقبل مباشرة
 *   .طلبات فحص              (للمطور) يعرض دوال المكتبة المتعلقة بالموافقة، لمعرفة ما تدعمه نسختك
 *
 * ملاحظات تقنية:
 *  - القبول يتم بإضافة الشخص عبر addUserToGroup (الأدمن حين يضيف شخصًا ينتظر موافقة يدخل مباشرة)، ويشترط أن يكون البوت أدمن.
 *  - تشغيل/إيقاف الميزة يحتاج دالة في مكتبة الدخول لتغيير وضع الموافقة؛ إن لم توجد في نسختك يخبرك الأمر بذلك بدل ادّعاء النجاح.
 *  - كل عملية يُتحقَّق من نتيجتها بإعادة قراءة المجموعة.
 */
module.exports.config = {
    name: 'طلبات', aliases: ['requests', 'الطلبات', 'طلبات_الانضمام', 'joinrequests'],
    description: 'طلبات الانضمام: عرضها وقبولها وتشغيل/إيقاف ميزة الموافقة (للأدمن والمطور)',
    usage: 'طلبات [تشغيل | ايقاف | قبول <رقم|الكل> | فحص]', category: 'admin', cooldown: 3, adminOnly: false
};

const SESSION_TTL = 15 * 60 * 1000;
const MAX_SHOWN = 20;
const ACCEPT_GAP_MS = 1800;
const ON_WORDS = ['تشغيل', 'تفعيل', 'فتح', 'on', 'شغل'];
const OFF_WORDS = ['ايقاف', 'إيقاف', 'تعطيل', 'اطفاء', 'إطفاء', 'off', 'وقف'];
const ACCEPT_WORDS = ['قبول', 'اقبل', 'قبل', 'accept'];
const ALL_WORDS = ['الكل', 'كل', 'all', 'الجميع'];
const PROBE_WORDS = ['فحص', 'probe', 'check'];
// أسماء محتملة لدالة تغيير وضع الموافقة في مكتبات الدخول (تُستعمل إن وُجدت، ثم يُتحقق من النتيجة فعليًا)
const TOGGLE_CANDIDATES = ['changeApprovalMode', 'setApprovalMode', 'changeGroupApprovalMode', 'changeThreadApprovalMode'];

const toLatin = t => String(t || '').replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x660));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const NUM_EMOJI = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
const numE = n => String(n).split('').map(d => NUM_EMOJI[+d] || d).join('');

const getInfo = (api, tid) => new Promise(resolve => {
    try {
        const r = api.getThreadInfo(tid, (err, info) => resolve(err ? null : info));
        if (r && typeof r.then === 'function') r.then(resolve, () => resolve(null));
    } catch (e) { resolve(null); }
});
const call = fn => new Promise(resolve => { try { fn(err => resolve(err || null)); } catch (e) { resolve(e); } });
const errText = e => String(e && (e.error || e.message) || e || '').slice(0, 120);
const isGroupAdmin = (info, uid) => ((info && info.adminIDs) || []).some(a => String(a && a.id !== undefined ? a.id : a) === String(uid));

async function canManage(api, event, cfg) {
    if (cfg.isAdmin(String(event.senderID))) return { ok: true };
    const info = await getInfo(api, event.threadID);
    return { ok: isGroupAdmin(info, event.senderID), info };
}

function ago(ts) {
    let t = Number(ts);
    if (!t) return null;
    if (t < 1e12) t *= 1000;                     // ثوانٍ → مللي ثانية
    const unit = (n, one, two, few, many) => (n === 1 ? one : n === 2 ? two : n <= 10 ? `${n} ${few}` : `${n} ${many}`);
    const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
    if (s < 60) return 'الآن';
    const m = Math.floor(s / 60);
    if (m < 60) return 'قبل ' + unit(m, 'دقيقة', 'دقيقتين', 'دقائق', 'دقيقة');
    const h = Math.floor(m / 60);
    if (h < 24) return 'قبل ' + unit(h, 'ساعة', 'ساعتين', 'ساعات', 'ساعة');
    const d = Math.floor(h / 24);
    if (d < 30) return 'قبل ' + unit(d, 'يوم', 'يومين', 'أيام', 'يومًا');
    return 'قبل ' + unit(Math.floor(d / 30), 'شهر', 'شهرين', 'أشهر', 'شهرًا');
}

/** قائمة المنتظرين من معلومات المجموعة (الأقدم أولًا) */
function queueOf(info) {
    const q = info && info.approvalQueue;
    if (!Array.isArray(q)) return null;
    return q.map(x => ({
        id: String(x && (x.requesterID || x.userID || x.id) || ''),
        inviter: x && x.inviterID ? String(x.inviterID) : null,
        ts: x && x.timestamp
    })).filter(x => x.id).sort((a, b) => Number(a.ts || 0) - Number(b.ts || 0));
}

/* ═══════════ العمليات ═══════════ */
async function setApproval(api, tid, want) {
    const fn = TOGGLE_CANDIDATES.find(n => typeof api[n] === 'function');
    if (!fn) return { error: 'unsupported' };
    const err = await call(cb => api[fn](want, tid, cb));
    if (err) return { error: errText(err) };
    await sleep(1500);
    const info = await getInfo(api, tid);
    if (info && Boolean(info.approvalMode) === want) return { ok: true };
    return { error: 'unchanged' };
}

/** يقبل شخصًا واحدًا ويتحقق من النتيجة */
async function acceptOne(api, tid, uid) {
    const err = await call(cb => api.addUserToGroup(uid, tid, cb));
    if (err) return { ok: false, why: errText(err) };
    await sleep(2000);
    const info = await getInfo(api, tid);
    if (!info) return { ok: true, unsure: true };
    if ((info.participantIDs || []).map(String).includes(String(uid))) return { ok: true };
    const q = queueOf(info);
    if (q && q.some(x => x.id === String(uid))) return { ok: false, why: 'ما زال الطلب معلّقًا (تأكد أن البوت أدمن في المجموعة)' };
    return { ok: true, unsure: true };
}

async function applyToggle(api, tid, want) {
    const r = await setApproval(api, tid, want);
    if (r.ok) return `✅ تم ${want ? 'تشغيل' : 'إيقاف'} ميزة طلبات الانضمام`;
    if (r.error === 'unsupported') {
        return '⚠️ مكتبة الدخول عندك لا تدعم تغيير هذه الميزة من البوت\n' +
            `غيّرها يدويًا: إعدادات المجموعة ← الموافقة على الأعضاء\n(للمطور: «.طلبات فحص» يعرض ما تدعمه مكتبتك)`;
    }
    if (r.error === 'unchanged') return '⚠️ جرّبت تغيير الميزة لكن حالتها لم تتغير، غيّرها يدويًا من إعدادات المجموعة';
    return `⚠️ تعذّر تغيير الميزة: ${r.error}`;
}

/* ═══════════ الواجهة ═══════════ */
const sessions = new Map(); // معرّف رسالة القائمة ← { tid, at, ids: [...] }
function remember(info, tid, ids) {
    if (!info || !info.messageID || info.messageID === 'sent') return;
    const now = Date.now();
    for (const [k, v] of sessions) if (now - v.at > SESSION_TTL) sessions.delete(k);
    sessions.set(String(info.messageID), { tid: String(tid), at: now, ids });
}

async function buildMenu(api, tid, helpers, deco, note) {
    const info = await getInfo(api, tid);
    if (!info) return { text: deco.errorBox('تعذّر قراءة معلومات المجموعة، حاول لاحقًا'), ids: [] };

    const on = Boolean(info.approvalMode);
    const botID = String(api.getCurrentUserID());
    const botAdmin = isGroupAdmin(info, botID);
    const queue = queueOf(info);
    const ids = [];
    const lines = [];

    if (note) lines.push(note, '');
    lines.push(`🔐 ميزة الطلبات: ${on ? '✅ مفعّلة' : '⛔ متوقفة'}`);
    lines.push(`🛡️ البوت أدمن: ${botAdmin ? 'نعم ✅' : 'لا ❌ (لا يستطيع القبول)'}`);
    lines.push('', `${numE(0)} ${on ? '⛔ إيقاف الميزة' : '✅ تشغيل الميزة'}`);

    if (queue === null) {
        lines.push('', '❔ لا أستطيع قراءة قائمة الطلبات (تأكد أن البوت أدمن وأن المكتبة تدعمها)');
    } else if (!queue.length) {
        lines.push('', on ? '📭 لا توجد طلبات معلّقة الآن' : '📭 لا توجد طلبات (الميزة متوقفة)');
    } else {
        const shown = queue.slice(0, MAX_SHOWN);
        const names = await helpers.getNames(api, shown.map(x => x.id));
        lines.push('', `📥 الطلبات المعلّقة (${queue.length}):`);
        shown.forEach((x, i) => {
            ids.push(x.id);
            const when = ago(x.ts);
            lines.push(`${numE(i + 1)} 👤 ${names[i]}`, `   🆔 ${x.id}${when ? `  •  🕒 ${when}` : ''}`);
        });
        if (queue.length > shown.length) lines.push(`… و${queue.length - shown.length} آخرون (اقبلهم بـ «الكل»)`);
        // كل المنتظرين (حتى غير المعروضين) تُقبل بـ «الكل»
        ids.all = queue.map(x => x.id);
    }

    lines.push('', '↩️ ردّ على هذه الرسالة:', '• برقم الشخص ← لقبول طلبه', '• بـ 0 ← لتشغيل/إيقاف الميزة', '• بـ «الكل» ← لقبول الجميع');
    return { text: deco.infoBox('📥 طلبات الانضمام', lines.join('\n')), ids, on, botAdmin };
}

async function acceptMany(api, tid, uids, helpers) {
    const names = await helpers.getNames(api, uids);
    const out = [];
    for (let i = 0; i < uids.length; i++) {
        const r = await acceptOne(api, tid, uids[i]);
        out.push(r.ok ? `✅ ${names[i]}${r.unsure ? ' (أُرسل القبول)' : ''}` : `❌ ${names[i]}: ${r.why}`);
        if (i < uids.length - 1) await sleep(ACCEPT_GAP_MS);
    }
    return out.join('\n');
}

async function probe(api, deco) {
    const keys = Object.keys(api || {}).filter(k => typeof api[k] === 'function');
    const hits = keys.filter(k => /approv|request|invite|member|join|admin/i.test(k)).sort();
    const found = TOGGLE_CANDIDATES.filter(n => typeof api[n] === 'function');
    return deco.infoBox('🔎 فحص مكتبة الدخول',
        `📦 عدد الدوال: ${keys.length}\n` +
        `🔁 دالة تغيير الموافقة: ${found.length ? found.join(', ') : 'غير موجودة'}\n` +
        `➕ addUserToGroup: ${typeof api.addUserToGroup === 'function' ? 'موجودة ✅' : 'غير موجودة ❌'}\n` +
        `📋 دوال ذات صلة:\n${hits.length ? hits.join(', ') : '—'}`);
}

module.exports.run = async ({ api, event, args, helpers, deco, cfg }) => {
    const reply = t => helpers.reply(api, event, t);
    if (event.isGroup === false) return reply(deco.warning('هذا الأمر يعمل داخل المجموعات فقط'));
    const perm = await canManage(api, event, cfg);
    if (!perm.ok) return reply(deco.reject('هذا الأمر لأدمن المجموعة والمطور فقط'));

    const tid = String(event.threadID);
    const a0 = toLatin(args[0] || '').toLowerCase();
    let note = null;

    if (PROBE_WORDS.includes(a0)) {
        if (!cfg.isAdmin(String(event.senderID))) return reply(deco.reject('الفحص للمطور فقط'));
        return reply(await probe(api, deco));
    }
    if (ON_WORDS.includes(a0) || OFF_WORDS.includes(a0)) {
        note = await applyToggle(api, tid, ON_WORDS.includes(a0));
    } else if (ACCEPT_WORDS.includes(a0)) {
        const target = toLatin(args[1] || '').toLowerCase();
        const m = await buildMenu(api, tid, helpers, deco);
        const all = m.ids.all || m.ids;
        if (ALL_WORDS.includes(target)) {
            if (!all.length) return reply(deco.warning('لا توجد طلبات لقبولها'));
            note = await acceptMany(api, tid, all, helpers);
        } else {
            const n = parseInt(target, 10);
            if (!n || n < 1 || n > m.ids.length) return reply(deco.warning(`اكتب رقمًا من القائمة أو «الكل»\nمثال: ${cfg.getPrefix()}طلبات قبول 1`));
            note = await acceptMany(api, tid, [m.ids[n - 1]], helpers);
        }
    }
    const menu = await buildMenu(api, tid, helpers, deco, note);
    remember(await reply(menu.text), tid, menu.ids);
};

/** الرد على رسالة القائمة */
module.exports.onMessage = async ({ api, event, helpers, deco, cfg }) => {
    if (event.type !== 'message_reply' || !event.messageReply) return false;
    const key = String(event.messageReply.messageID);
    const s = sessions.get(key);
    if (!s) return false;
    if (Date.now() - s.at > SESSION_TTL) { sessions.delete(key); return false; }
    if (String(event.threadID) !== s.tid) return false;

    const text = toLatin(event.body).trim().toLowerCase();
    const isNum = /^\d+$/.test(text);
    const isAll = ALL_WORDS.includes(text);
    if (!isNum && !isAll) return false;
    const n = isNum ? parseInt(text, 10) : -1;
    if (isNum && n > s.ids.length) return false;     // رقم خارج القائمة: ليس موجّهًا للأمر

    const perm = await canManage(api, event, cfg);
    if (!perm.ok) { await helpers.reply(api, event, deco.reject('هذا الأمر لأدمن المجموعة والمطور فقط')); return true; }

    let note;
    if (isNum && n === 0) {
        const info = await getInfo(api, s.tid);
        if (!info) note = '⚠️ تعذّر قراءة المجموعة، حاول لاحقًا';
        else note = await applyToggle(api, s.tid, !info.approvalMode);
    } else if (isAll) {
        const all = s.ids.all || s.ids;
        note = all.length ? await acceptMany(api, s.tid, all, helpers) : '📭 لا توجد طلبات لقبولها';
    } else {
        note = await acceptMany(api, s.tid, [s.ids[n - 1]], helpers);
    }
    const menu = await buildMenu(api, s.tid, helpers, deco, note);
    remember(await helpers.reply(api, event, menu.text), s.tid, menu.ids);
    return true;
};
