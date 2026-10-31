/**
 * .طرد <@منشن | أيدي | رابط | رد على رسالة> — طرد عضو (أو أكثر) من المجموعة الحالية
 * متاح للمطور وأدمن المجموعة فقط.
 * حمايات: لا يُطرد البوت ولا صاحب الأمر ولا المطور، وأدمن المجموعة لا يطرده إلا المطور.
 */
module.exports.config = {
    name: 'طرد', aliases: ['kick', 'اطرد', 'طير'],
    description: 'طرد عضو من المجموعة (للأدمن والمطور فقط)',
    usage: 'طرد <@منشن | أيدي | رابط | رد على رسالة>', category: 'admin', cooldown: 5, adminOnly: false
};

const MAX_PER_COMMAND = 5;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const reason = e => String((e && (e.error || e.message)) || e).replace(/\s+/g, ' ').slice(0, 110);

const getInfo = (api, tid) => new Promise(resolve => {
    try { api.getThreadInfo(tid, (err, info) => resolve(err ? null : info)); } catch (e) { resolve(null); }
});
const adminSet = info => new Set(((info && info.adminIDs) || []).map(a => String(a && a.id !== undefined ? a.id : a)));

/** منشن وأيدي مباشر وروابط (profile.php?id=) وإلا صاحب الرسالة المردود عليها */
function collectIds(event, args) {
    const ids = new Set(Object.keys(event.mentions || {}).map(String));
    for (const a of args) {
        const m = String(a).match(/[?&]id=(\d{9,})/) || String(a).match(/^(\d{9,})$/);
        if (m) ids.add(m[1]);
    }
    if (!ids.size && event.type === 'message_reply' && event.messageReply && event.messageReply.senderID) {
        ids.add(String(event.messageReply.senderID));
    }
    return [...ids];
}

const removeOne = (api, userId, threadId) => new Promise(resolve => {
    try { api.removeUserFromGroup(userId, threadId, err => resolve(err || null)); }
    catch (e) { resolve(e); }
});

module.exports.run = async ({ api, event, args, helpers, deco, cfg }) => {
    const reply = t => helpers.reply(api, event, t);
    if (typeof api.removeUserFromGroup !== 'function') return reply(deco.errorBox('هذه المكتبة لا تدعم طرد الأعضاء'));
    if (event.isGroup === false) return reply(deco.warning('هذا الأمر يعمل داخل المجموعات فقط'));

    const sender = String(event.senderID);
    const isDev = cfg.isAdmin(sender);
    const info = await getInfo(api, event.threadID);
    const admins = adminSet(info);
    if (!isDev && !admins.has(sender)) return reply(deco.reject('هذا الأمر لأدمن المجموعة والمطور فقط'));

    const ids = collectIds(event, args);
    if (!ids.length) return reply(deco.warning(`منشن الشخص أو ردّ على رسالته أو اكتب أيديه\nمثال: ${cfg.getPrefix()}طرد @فلان`));
    if (ids.length > MAX_PER_COMMAND) return reply(deco.warning(`الحد الأقصى ${MAX_PER_COMMAND} أعضاء في المرة الواحدة`));

    const botId = String(api.getCurrentUserID());
    const done = [], skipped = [], failed = [];
    for (const id of ids) {
        if (id === botId) { skipped.push(`${id} (هذا أنا 🤖)`); continue; }
        if (id === sender) { skipped.push(`${id} (لا يمكنك طرد نفسك)`); continue; }
        if (cfg.isAdmin(id)) { skipped.push(`${id} (مطور البوت)`); continue; }
        if (admins.has(id) && !isDev) { skipped.push(`${id} (أدمن المجموعة)`); continue; }
        if (info && info.participantIDs && !info.participantIDs.map(String).includes(id)) { skipped.push(`${id} (ليس في المجموعة)`); continue; }
        const err = await removeOne(api, id, event.threadID);
        if (err) failed.push(`${id}: ${reason(err)}`); else done.push(id);
        if (ids.length > 1) await sleep(1200);
    }

    // أسماء المطرودين للعرض
    let names = {};
    if (done.length && typeof api.getUserInfo === 'function') {
        names = await new Promise(r => { try { api.getUserInfo(done, (e, d) => r(e ? {} : d || {})); } catch (e) { r({}); } });
    }
    const nm = id => (names[id] && names[id].name) || id;

    const lines = [];
    if (done.length) lines.push(`🚪 تم طرد: ${done.map(nm).join('، ')}`);
    if (skipped.length) lines.push(`⏭️ تخطّيت: ${skipped.join('، ')}`);
    if (failed.length) lines.push(`⚠️ تعذّر الطرد: ${failed.join('، ')}\nتأكد أن البوت أدمن في المجموعة`);
    let box;
    if (done.length && !failed.length) box = deco.success.bind(deco);
    else if (done.length) box = t => deco.infoBox('🚪 الطرد', t);
    else box = failed.length ? deco.errorBox.bind(deco) : deco.warning.bind(deco);
    return reply(box(lines.join('\n')));
};
