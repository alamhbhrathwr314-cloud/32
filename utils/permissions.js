/**
 * 🎖️ المطورون المساعدون (صلاحية المطور الممنوحة): Heba_DB/permissions.json
 * المطور الرئيسي هو أول أيدي في ADMINBOT داخل config.json، وهو لا يُخزَّن هنا ولا يمكن سحبه أو تعديله بأي أمر.
 * isAdmin في utils/config.js يشمل الرئيسي + مطوري config.json + المساعدين المسجلين هنا.
 */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'Heba_DB');
const FILE = path.join(DIR, 'permissions.json');

let state = { sub: {} };
function load() {
    try {
        const d = JSON.parse(fs.readFileSync(FILE, 'utf8'));
        const sub = {};
        if (d && d.sub && typeof d.sub === 'object') {
            for (const [id, v] of Object.entries(d.sub)) sub[String(id)] = { name: (v && v.name) || '', by: (v && v.by) || '', at: (v && v.at) || 0 };
        }
        state = { sub };
    } catch (e) {
        if (e.code !== 'ENOENT') console.error('permissions: تعذر قراءة الملف:', e.message);
    }
}
function save() {
    try {
        fs.mkdirSync(DIR, { recursive: true });
        const tmp = `${FILE}.${process.pid}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(state));
        fs.renameSync(tmp, FILE);
        return true;
    } catch (e) { console.error('permissions: تعذر الحفظ:', e.message); return false; }
}
load();

const isSub = id => Object.prototype.hasOwnProperty.call(state.sub, String(id));
const list = () => Object.entries(state.sub).map(([id, v]) => ({ id, ...v }));

/** يمنح الصلاحية. يرفض المطور الرئيسي ومطوري config.json (لهم صلاحية أصلية) */
function grant(id, { name = '', by = '' } = {}) {
    id = String(id);
    const cfg = require('./config');
    if (cfg.getAdmins().some(a => String(a) === id)) return false;
    state.sub[id] = { name, by: String(by), at: Date.now() };
    return save();
}
/** يسحب الصلاحية الممنوحة فقط، ولا يلمس المطور الرئيسي أبدًا */
function revoke(id) {
    id = String(id);
    const cfg = require('./config');
    if (cfg.isOwner(id) || !isSub(id)) return false;
    delete state.sub[id];
    return save();
}

module.exports = { isSub, list, grant, revoke };
