/**
 * .اضف <أيدي | رابط بروفايل | @منشن>  — إضافة عضو (أو أكثر) إلى المجموعة الحالية
 * متاح للجميع داخل المجموعات. حدود الحماية لغير الأدمن: 3 أعضاء في الأمر،
 * وانتظار 30 ثانية بين كل استخدام، وسقف 20 عضوًا في الساعة لكل البوت.
 */
module.exports.config = {
    name: 'اضف', aliases: ['add'],
    description: 'إضافة عضو إلى المجموعة (أيدي أو منشن أو رابط)',
    usage: 'اضف <أيدي | رابط | @منشن>', category: 'tools', cooldown: 30, adminOnly: false
};

const MAX_ADMIN = 5;          // الأدمن: حتى 5 في الأمر
const MAX_USER = 3;           // غيره: حتى 3 في الأمر
const HOURLY_CAP = 20;        // سقف إضافات البوت كله في الساعة (لحماية الحساب)
const HOUR = 60 * 60 * 1000;
const addLog = [];            // أوقات الإضافات الناجحة
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** يجمع الأيديات: منشن وأيدي مباشر وروابط (profile.php?id=)، وإلا صاحب الرسالة المردود عليها */
function collectIds(event, args, botId) {
    const ids = new Set(Object.keys(event.mentions || {}).map(String));
    for (const a of args) {
        const m = a.match(/[?&]id=(\d{9,})/) || a.match(/^(\d{9,})$/);
        if (m) ids.add(m[1]);
    }
    if (!ids.size && event.type === 'message_reply' && event.messageReply && event.messageReply.senderID) {
        ids.add(String(event.messageReply.senderID));
    }
    ids.delete(String(botId));
    return [...ids];
}

const addOne = (api, userId, threadId) =>
    new Promise(resolve => {
        try { api.addUserToGroup(userId, threadId, err => resolve(err || null)); }
        catch (e) { resolve(e); }
    });

const reason = e => String((e && (e.error || e.message)) || e).replace(/\s+/g, ' ').slice(0, 110);

module.exports.run = async ({ api, event, args, helpers, deco, cfg }) => {
    const isAdmin = cfg.isAdmin(String(event.senderID));
    if (typeof api.addUserToGroup !== 'function') {
        return helpers.reply(api, event, deco.errorBox('هذه المكتبة لا تدعم إضافة الأعضاء'));
    }
    if (event.isGroup === false) {
        return helpers.reply(api, event, deco.warning('هذا الأمر يعمل داخل المجموعات فقط'));
    }

    const ids = collectIds(event, args, api.getCurrentUserID());
    if (!ids.length) {
        return helpers.reply(api, event, deco.warning(`الاستخدام: ${cfg.getPrefix()}اضف <أيدي | رابط | @منشن>`));
    }
    const max = isAdmin ? MAX_ADMIN : MAX_USER;
    if (ids.length > max) {
        return helpers.reply(api, event, deco.warning(`الحد الأقصى ${max} أعضاء في المرة الواحدة`));
    }
    if (!isAdmin) {
        while (addLog.length && Date.now() - addLog[0] > HOUR) addLog.shift();
        if (addLog.length + ids.length > HOURLY_CAP) {
            return helpers.reply(api, event, deco.warning('وصل البوت للحد المسموح من الإضافات هذه الساعة، حاول لاحقًا'));
        }
    }
    const stamp = Date.now();
    ids.forEach(() => addLog.push(stamp)); // نحجز الأماكن فورًا حتى لا يتجاوز السقفَ من يرسل معًا

    const ok = [], failed = [];
    for (const [i, id] of ids.entries()) {
        if (i) await sleep(1500); // مهلة بين كل إضافة لتجنب القيود
        const err = await addOne(api, id, event.threadID);
        if (err) {
            failed.push(`❌ ${id}: ${reason(err)}`);
            const k = addLog.indexOf(stamp);
            if (k !== -1) addLog.splice(k, 1); // نعيد المكان المحجوز لأن الإضافة فشلت
        } else ok.push(id);
    }

    const lines = [];
    if (ok.length) {
        const names = await helpers.getNames(api, ok);
        lines.push(...names.map(n => `✅ تمت إضافة ${n}`));
    }
    lines.push(...failed);
    if (failed.length) lines.push('💡 قد تكون خصوصية العضو تمنع الإضافة، أو المجموعة تتطلب موافقة مشرف.');
    return helpers.reply(api, event, deco.infoBox('➕ إضافة الأعضاء', lines.join('\n')));
};
