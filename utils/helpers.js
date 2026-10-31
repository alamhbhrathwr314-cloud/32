/**
 * دوال مساعدة مشتركة بين الأوامر: الأسماء، المستويات، الرد، الاستهداف
 */
const mention = require('./mentionHelper');
const states = require('./db/states');

const nameCache = new Map();

const RANKS = [
    [1, 'مبتدئ ✨'], [5, 'متدرب 🌱'], [10, 'محترف ⚔️'],
    [20, 'خبير 🔥'], [35, 'أسطورة 👑'], [50, 'إمبراطور 🌌']
];

const rankFor = level => RANKS.reduce((r, [min, name]) => (level >= min ? name : r), RANKS[0][1]);
const xpNeeded = level => level * 100;

/** إضافة خبرة مع الترقية التلقائية (+50 نقطة لكل مستوى) */
function addXP(uid, amount) {
    const d = states.getData(uid);
    d.xp += amount;
    let leveledUp = false;
    while (d.xp >= xpNeeded(d.level)) {
        d.xp -= xpNeeded(d.level);
        d.level++;
        d.points += 50;
        leveledUp = true;
    }
    d.rank = rankFor(d.level);
    states.saveData(uid, d);
    return { data: d, leveledUp };
}

/** جلب أسماء المستخدمين (مع تخزين مؤقت) */
async function getNames(api, uids) {
    const missing = uids.filter(u => !nameCache.has(u));
    if (missing.length) {
        await new Promise(resolve => {
            try {
                api.getUserInfo(missing, (err, info) => {
                    if (!err && info) {
                        for (const id of missing) if (info[id] && info[id].name) nameCache.set(id, info[id].name);
                    }
                    resolve();
                });
            } catch (e) { resolve(); }
        });
    }
    return uids.map(u => nameCache.get(u) || `مستخدم ${String(u).slice(-4)}`);
}

async function getName(api, uid) {
    return (await getNames(api, [uid]))[0];
}

/** الشخص المستهدف: منشن، أو رد على رسالة، أو أيدي مباشر (9 أرقام فأكثر) */
function getTarget(event, args) {
    const id = mention.extractMention(event, args);
    if (!id) return null;
    const hasMention = Object.keys(event.mentions || {}).length > 0;
    const isReply = event.type === 'message_reply' && event.messageReply;
    if (!hasMention && !isReply && String(id).length < 9) return null;
    return String(id);
}

/** رد على رسالة المستخدم */
function reply(api, event, text) {
    return new Promise(resolve => {
        api.sendMessage(text, event.threadID, (err, info) => resolve(info), event.messageID);
    });
}

const fmt = n => Number(n).toLocaleString('en-US');

function bar(cur, max, len = 10) {
    const filled = Math.max(0, Math.min(len, Math.round((cur / max) * len)));
    return '▰'.repeat(filled) + '▱'.repeat(len - filled);
}

function msToTime(ms) {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const parts = [];
    if (h) parts.push(`${h} ساعة`);
    if (m) parts.push(`${m} دقيقة`);
    if (s && !h) parts.push(`${s} ثانية`);
    return parts.join(' و ') || 'لحظات';
}

module.exports = { addXP, getName, getNames, getTarget, reply, fmt, bar, msToTime, rankFor, xpNeeded };
