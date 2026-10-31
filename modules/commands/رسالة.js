/**
 * .اشعار <الرسالة>  — (للمطور فقط) يرسل إشعارًا إلى كل المجموعات التي فيها البوت.
 *
 * التدفّق:
 *  1) المطور يكتب  .اشعار نص الإشعار
 *  2) البوت يرسل النص لكل مجموعة (بفاصل زمني بين كل مجموعة لحماية الحساب)
 *  3) إذا ردّ أحد على رسالة الإشعار → تصل رسالة فيها: الاسم + الأيدي + المجموعة + نص الرد
 *     إلى المجموعة (أو المحادثة) التي كتب منها المطور أمر الإشعار (وللمطور مباشرة إن لم تُعرف)
 *  4) المطور يردّ (Reply) على تلك الرسالة → البوت يوصّل ردّه للشخص في مجموعته مع منشن
 *  5) إذا ردّ الشخص على ردّ المطور → يصل المطور مجددًا، وهكذا (محادثة متبادلة)
 *
 * الربط بين الرسائل محفوظ في Heba_DB/relay.json (يبقى بعد إعادة التشغيل، وتُحذف الإدخالات بعد 30 يومًا).
 */
const fs = require('fs-extra');
const path = require('path');
const log = require('../../utils/log');

const dirPath = path.join(__dirname, '../../Heba_DB');
const filePath = path.join(dirPath, 'relay.json');

const MAX_ENTRIES = 3000;
const TTL = 30 * 24 * 60 * 60 * 1000;
const MIN_GAP = 3000;   // أقل فاصل بين مجموعتين (مللي ثانية)
const MAX_GAP = 6000;   // أكبر فاصل
const sleep = ms => new Promise(r => setTimeout(r, ms));

let sending = false; // يمنع تشغيل بثّين معًا

/* ─────────── تخزين الربط ─────────── */
function load() {
    try {
        fs.ensureDirSync(dirPath);
        if (!fs.existsSync(filePath)) return {};
        return JSON.parse(fs.readFileSync(filePath, 'utf8')) || {};
    } catch (e) { return {}; }
}

function save(db) {
    const now = Date.now();
    let keys = Object.keys(db).filter(k => now - (db[k].t || 0) < TTL);
    if (keys.length > MAX_ENTRIES) keys = keys.sort((a, b) => db[b].t - db[a].t).slice(0, MAX_ENTRIES);
    const out = {};
    for (const k of keys) out[k] = db[k];
    const tmp = filePath + '.' + process.pid + '.tmp';
    fs.ensureDirSync(dirPath);
    fs.writeFileSync(tmp, JSON.stringify(out));
    fs.renameSync(tmp, filePath);
}

function remember(entries) {
    const db = load();
    for (const [mid, val] of entries) db[String(mid)] = { ...val, t: Date.now() };
    save(db);
}

/* ─────────── أدوات الإرسال ─────────── */
const send = (api, msg, threadID, replyTo) => new Promise(resolve => {
    try {
        api.sendMessage(msg, String(threadID), (err, info) => resolve({ err: err || null, info }), replyTo);
    } catch (e) { resolve({ err: e, info: null }); }
});

const errText = e => (typeof e === 'string' ? e : (e && (e.error || e.message)) || 'خطأ غير معروف');

/** كل المجموعات التي فيها البوت (نقرأ صناديق الوارد والمؤرشف ونتخطى المحادثات الفردية) */
async function getGroupIDs(api) {
    const ids = new Set();
    for (const tag of [['INBOX'], ['ARCHIVED']]) {
        let ts = null;
        for (let page = 0; page < 20; page++) { // حد أقصى 1000 محادثة لكل صندوق
            const list = await new Promise(resolve => {
                try { api.getThreadList(50, ts, tag, (err, l) => resolve(err ? null : l)); }
                catch (e) { resolve(null); }
            });
            if (!Array.isArray(list) || !list.length) break;
            for (const t of list) if (t && t.isGroup) ids.add(String(t.threadID));
            const last = list[list.length - 1];
            const next = last && last.timestamp;
            if (list.length < 50 || !next || String(next) === String(ts)) break;
            ts = next;
        }
    }
    return [...ids];
}

async function threadName(api, tid) {
    return new Promise(resolve => {
        try {
            api.getThreadInfo(String(tid), (err, info) => resolve(!err && info && info.threadName ? info.threadName : null));
        } catch (e) { resolve(null); }
    });
}

/* ─────────── الأمر ─────────── */
module.exports.config = {
    name: 'اشعار', aliases: ['broadcast', 'اذاعة', 'بث'],
    description: 'إرسال إشعار لكل المجموعات واستقبال الردود (للمطور فقط)',
    usage: 'اشعار <الرسالة>', category: 'admin', cooldown: 0, adminOnly: true
};

module.exports.run = async ({ api, event, args, helpers, deco, cfg }) => {
    const text = args.join(' ').trim();
    if (!text) {
        return helpers.reply(api, event, deco.warning(`اكتب نص الإشعار بعد الأمر:\n${cfg.getPrefix()}اشعار مرحبًا بالجميع`));
    }
    if (typeof api.getThreadList !== 'function') {
        return helpers.reply(api, event, deco.errorBox('الإرسال الجماعي غير مدعوم في هذا الوضع (يحتاج دخولًا بالكوكيز)'));
    }
    if (sending) return helpers.reply(api, event, deco.warning('هناك إشعار قيد الإرسال الآن، انتظر حتى ينتهي'));

    sending = true;
    try {
        const botID = String(api.getCurrentUserID());
        const groups = (await getGroupIDs(api)).filter(Boolean);
        if (!groups.length) return helpers.reply(api, event, deco.warning('لم أجد أي مجموعة فيها البوت'));

        const eta = Math.ceil(groups.length * ((MIN_GAP + MAX_GAP) / 2) / 60000);
        await helpers.reply(api, event, deco.infoBox('📢 بدء الإرسال',
            `👥 المجموعات: ${groups.length}\n⏳ المدة التقريبية: ${eta} دقيقة\n(الفاصل بين المجموعات لحماية الحساب)`));

        const body = `${deco.title('📢 إشعار من المطور')}\n\n${text}\n\n${deco.separator()}\n💬 للرد على المطور: ردّ (Reply) على هذه الرسالة`;

        let ok = 0;
        const failed = [];
        const pending = [];
        for (let i = 0; i < groups.length; i++) {
            const tid = groups[i];
            const r = await send(api, body, tid);
            if (r.err || !r.info || !r.info.messageID) {
                failed.push(`${tid}: ${errText(r.err)}`.slice(0, 120));
            } else {
                ok++;
                pending.push([r.info.messageID, { kind: 'broadcast', threadID: tid, origin: String(event.threadID) }]);
                if (pending.length >= 10) remember(pending.splice(0));
            }
            if (i < groups.length - 1) await sleep(MIN_GAP + Math.random() * (MAX_GAP - MIN_GAP));
        }
        if (pending.length) remember(pending);

        const lines = [`✅ نجح: ${ok} من ${groups.length}`];
        if (failed.length) {
            lines.push(`❌ فشل: ${failed.length}`);
            lines.push(...failed.slice(0, 5).map(f => ' • ' + f));
            if (failed.length > 5) lines.push(` … و${failed.length - 5} أخرى`);
        }
        log(`اشعار: ${ok}/${groups.length} (البوت ${botID})`, 'CMD');
        return helpers.reply(api, event, deco.infoBox('📊 نتيجة الإشعار', lines.join('\n')));
    } finally {
        sending = false;
    }
};

/* ─────────── استقبال الردود (يُستدعى لكل رسالة عادية) ─────────── */
module.exports.onMessage = async ({ api, event, helpers, deco, cfg }) => {
    // نهتم فقط بالردود على رسائل البوت
    if (event.type !== 'message_reply' || !event.messageReply || !event.messageReply.messageID) return false;

    const db = load();
    const rec = db[String(event.messageReply.messageID)];
    if (!rec) return false;

    const senderID = String(event.senderID);
    const isAdmin = cfg.isAdmin(senderID);

    /* (أ) شخص ردّ على إشعار أو على ردّ المطور ← نرسله للمطور */
    if (rec.kind === 'broadcast' || rec.kind === 'dev-reply') {
        if (isAdmin) return false; // المطور يرد على نفسه؟ نتجاهل
        if (rec.origin && String(rec.origin) === String(event.threadID)) return false; // الرد في مجموعة المطور نفسها: المطور يراه مباشرة

        const name = await helpers.getName(api, senderID);
        const gName = (await threadName(api, event.threadID)) || 'بدون اسم';
        const quoted = rec.kind === 'dev-reply' ? '↩️ ردًّا على ردّك' : '↩️ ردًّا على الإشعار';
        const report = deco.infoBox('📩 رد جديد',
            `${quoted}\n👤 الاسم: ${name}\n🆔 الأيدي: ${senderID}\n👥 المجموعة: ${gName}\n🧵 أيدي المجموعة: ${event.threadID}\n\n💬 ${event.body}\n\n${deco.separator()}\n↪️ للرد عليه: ردّ (Reply) على هذه الرسالة`);

        const origin = rec.origin ? String(rec.origin) : null;
        const entries = [];
        const deliver = async targets => {
            let delivered = false;
            for (const target of targets) {
                const r = await send(api, report, target);
                if (r.err) { log(`تعذّر إرسال الرد إلى ${target}: ${errText(r.err)}`, 'warn'); continue; }
                delivered = true;
                if (r.info && r.info.messageID) {
                    entries.push([r.info.messageID, {
                        kind: 'forward', userID: senderID, userName: name,
                        threadID: String(event.threadID), userMessageID: event.messageID, origin
                    }]);
                }
            }
            return delivered;
        };

        // المجموعة التي أُرسل منها الإشعار أولًا، وإن فشلت (أو كان الإشعار قديمًا بلا مجموعة) نرسل للمطور مباشرة
        let ok = origin ? await deliver([origin]) : false;
        if (!ok) ok = await deliver([...cfg.getAdmins()]);
        if (entries.length) remember(entries);
        if (!ok) await helpers.reply(api, event, deco.warning('تعذّر إيصال ردّك للمطور الآن، حاول لاحقًا'));
        return true;
    }

    /* (ب) المطور ردّ على الرسالة المحوَّلة ← نوصّل الرد للشخص في مجموعته */
    if (rec.kind === 'forward') {
        if (!isAdmin) return false;

        const tag = `@${rec.userName}`;
        const msg = {
            body: `${tag}\n💬 ردّ المطور:\n${event.body}\n\n${deco.separator()}\n↪️ للرد: ردّ (Reply) على هذه الرسالة`,
            mentions: [{ tag, id: rec.userID }]
        };
        const r = await send(api, msg, rec.threadID, rec.userMessageID);
        if (r.err || !r.info || !r.info.messageID) {
            await helpers.reply(api, event, deco.errorBox(`تعذّر الإرسال: ${errText(r.err)}\n(ربما غادر البوت المجموعة أو حُذفت رسالة الشخص)`));
            return true;
        }
        remember([[r.info.messageID, { kind: 'dev-reply', threadID: rec.threadID, origin: rec.origin }]]);
        await helpers.reply(api, event, deco.successLine(`تم إيصال ردّك إلى ${rec.userName}`));
        return true;
    }

    return false;
};
