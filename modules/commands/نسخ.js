/**
 * .نسخ — (للمطور فقط) ينسخ ملفات البوت كلها إلى مستودع GitHub آخر، ما عدا سجلات بيانات المستخدمين والأسرار.
 *
 * الإعداد (متغيرات بيئة في الاستضافة):
 *   BACKUP_GITHUB_REPO   اسم المستودع الذي تُنسخ إليه الملفات بصيغة  user/repo   (مطلوب)
 *   BACKUP_GITHUB_TOKEN  توكن GitHub له صلاحية Contents: Read and write على ذلك المستودع (مطلوب)
 *                        وإن لم يوجد يُستخدم SYNC_GITHUB_TOKEN إن كان مضبوطًا ويملك صلاحية عليه
 *   BACKUP_GITHUB_BRANCH الفرع (اختياري، الافتراضي فرع المستودع الرئيسي)
 *   BACKUP_BLOCK_PUBLIC=1 (اختياري) لرفض النسخ إذا كان المستودع عامًا؛ بدونه يُنسخ حتى إلى المستودع العام
 *
 * طريقة العمل: يقارن الملفات المحلية بما في المستودع ويرفع الجديد والمتغيّر فقط في commit واحد.
 * لا يحذف شيئًا من المستودع الآخر أبدًا (الملفات المحذوفة محليًا تبقى هناك).
 *
 * لا يُنسخ أبدًا: الكوكيز والجلسات (appstate / cookies / fb_session / fca-config / .env)، node_modules، .git،
 * مجلدات التشغيل (Heba_DB / data / Fca_Database)، وسجلات المستخدمين المذكورة في USER_DATA_FILES أدناه.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');

const ROOT = path.join(__dirname, '..', '..');
const API = process.env.BACKUP_API_URL || 'https://api.github.com';
const MAX_FILE = 25 * 1024 * 1024;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// سجلات بيانات المستخدمين (حسابات، مستويات، رسائل...) — لا تُنسخ. عدّل القائمة كما تشاء.
const USER_DATA_FILES = new Set([
    'kira-data/users.json',
    'kira-data/global_stats.json',
    'kira-data/demas.json',
    'kira-data/jobs.json',
    'kira-data/remo_msgs.json',
    'kira-data/relay.json'
]);
// أسرار ومجلدات تشغيل — لا تُنسخ أبدًا
const SECRET_NAMES = new Set(['appstate.json', 'cookies.json', 'fb_session.json', 'fca-config.json']);
const ANY_DEPTH_DIRS = new Set(['node_modules', '.git']);
const ROOT_DIRS = new Set(['Heba_DB', 'data', 'Fca_Database']);

let running = false;

const conf = () => ({
    repo: (process.env.BACKUP_GITHUB_REPO || '').trim(),
    token: (process.env.BACKUP_GITHUB_TOKEN || process.env.SYNC_GITHUB_TOKEN || '').trim(),
    branch: (process.env.BACKUP_GITHUB_BRANCH || '').trim(),
    blockPublic: process.env.BACKUP_BLOCK_PUBLIC === '1'
});

const isSecret = name => SECRET_NAMES.has(name) || name === '.env' || name.startsWith('.env.') || name.endsWith('.tmp');

/** يجمع الملفات المراد نسخها ويصنّف المستثنى */
function collect() {
    const files = [], userData = [], secrets = [], big = [];
    const walk = (dir, rel) => {
        let ents;
        try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
        for (const ent of ents) {
            const r = rel ? `${rel}/${ent.name}` : ent.name;
            const abs = path.join(dir, ent.name);
            if (ent.isSymbolicLink()) continue;
            if (ent.isDirectory()) {
                if (ANY_DEPTH_DIRS.has(ent.name) || (!rel && ROOT_DIRS.has(ent.name))) continue;
                walk(abs, r);
                continue;
            }
            if (!ent.isFile()) continue;
            if (isSecret(ent.name)) { secrets.push(r); continue; }
            if (USER_DATA_FILES.has(r)) { userData.push(r); continue; }
            const size = fs.statSync(abs).size;
            if (size > MAX_FILE) { big.push(r); continue; }
            files.push({ rel: r, abs, size });
        }
    };
    walk(ROOT, '');
    return { files, userData, secrets, big };
}

const blobSha = buf => crypto.createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
const ghErr = res => (res && res.data && res.data.message) || `HTTP ${res && res.status}`;

module.exports.config = {
    name: 'نسخ', aliases: ['backup', 'نسخة', 'نسخ_احتياطي'],
    description: 'نسخ ملفات البوت إلى مستودع GitHub آخر بدون سجلات المستخدمين (للمطور فقط)',
    usage: 'نسخ', category: 'admin', cooldown: 30, adminOnly: true
};

module.exports.run = async ({ api, event, helpers, deco }) => {
    const reply = t => helpers.reply(api, event, t);
    const c = conf();
    if (!c.repo || !c.token || !/^[\w.-]+\/[\w.-]+$/.test(c.repo)) {
        return reply(deco.warning(
            'النسخ غير مُعدّ بعد. أضف في الاستضافة المتغيرات:\n' +
            'BACKUP_GITHUB_REPO = user/repo  (المستودع الذي تُنسخ إليه الملفات)\n' +
            'BACKUP_GITHUB_TOKEN = توكن GitHub بصلاحية كتابة Contents على ذلك المستودع\n' +
            'ثم أعد تشغيل البوت واكتب الأمر مرة أخرى.'));
    }
    if (running) return reply(deco.warning('هناك عملية نسخ جارية الآن، انتظر حتى تنتهي'));
    running = true;

    const gh = (method, url, data, params) => axios({
        method, url: `${API}/repos/${c.repo}${url}`, data, params, timeout: 60000, validateStatus: () => true,
        headers: { Authorization: `Bearer ${c.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'kira-bot-backup' }
    });
    const ghRetry = async (...a) => {
        let res;
        for (let i = 0; i < 3; i++) {
            res = await gh(...a);
            if (res.status < 500 && res.status !== 403 && res.status !== 429) return res;
            await sleep(1500 * (i + 1));
        }
        return res;
    };

    try {
        // 1) المستودع: موجود؟ لي صلاحية كتابة؟ خاص؟
        const info = await gh('get', '');
        if (info.status === 401) return reply(deco.errorBox('التوكن غير صالح أو منتهي'));
        if (info.status === 404) return reply(deco.errorBox('المستودع غير موجود أو التوكن لا يملك صلاحية عليه، تأكد من BACKUP_GITHUB_REPO والتوكن'));
        if (info.status !== 200) return reply(deco.errorBox(`تعذّر الوصول للمستودع: ${ghErr(info)}`));
        if (info.data.permissions && info.data.permissions.push === false) return reply(deco.errorBox('التوكن لا يملك صلاحية الكتابة على هذا المستودع'));
        const isPublic = info.data.private === false;
        if (isPublic && c.blockPublic) {
            return reply(deco.errorBox('المستودع عام والنسخ إلى المستودعات العامة موقوف (BACKUP_BLOCK_PUBLIC=1)، اجعله Private أو احذف هذا المتغير'));
        }
        const publicNote = isPublic ? '\n⚠️ المستودع عام: كل ملفات الكود ظاهرة للجميع، تأكد أنها لا تحوي مفاتيح' : '';
        const defBranch = info.data.default_branch || 'main';
        const branch = c.branch || defBranch;

        await reply(deco.infoBox('💾 بدء النسخ', 'جاري مقارنة الملفات ورفع الجديد والمتغيّر...'));

        // 2) آخر commit في الفرع (وإن كان المستودع فارغًا نبدأه بملف README)
        let ref = await gh('get', `/git/ref/heads/${branch}`);
        if ((ref.status === 404 || ref.status === 409) && branch === defBranch) {
            const init = await gh('put', '/contents/README.md', {
                message: 'init backup', content: Buffer.from('نسخة احتياطية من ملفات بوت كيرا\n').toString('base64')
            });
            if (init.status !== 200 && init.status !== 201) return reply(deco.errorBox(`تعذّر تهيئة المستودع الفارغ: ${ghErr(init)}`));
            ref = await gh('get', `/git/ref/heads/${branch}`);
        }
        if (ref.status === 404) return reply(deco.errorBox(`الفرع «${branch}» غير موجود في المستودع`));
        if (ref.status !== 200) return reply(deco.errorBox(`تعذّر قراءة الفرع: ${ghErr(ref)}`));
        const headSha = ref.data.object.sha;

        const commit = await gh('get', `/git/commits/${headSha}`);
        if (commit.status !== 200) return reply(deco.errorBox(`تعذّر قراءة آخر نسخة: ${ghErr(commit)}`));
        const baseTree = commit.data.tree.sha;
        const tree = await gh('get', `/git/trees/${baseTree}`, undefined, { recursive: 1 });
        if (tree.status !== 200) return reply(deco.errorBox(`تعذّر قراءة ملفات المستودع: ${ghErr(tree)}`));
        const remote = new Map();
        if (!tree.data.truncated) for (const t of tree.data.tree || []) if (t.type === 'blob') remote.set(t.path, t.sha);

        // 3) الملفات المحلية → ما تغيّر فقط
        const { files, userData, secrets, big } = collect();
        const changed = [];
        for (const f of files) {
            f.buf = fs.readFileSync(f.abs);
            f.sha = blobSha(f.buf);
            if (remote.get(f.rel) !== f.sha) changed.push(f);
        }
        const skippedLine = `🚫 لم تُنسخ: سجلات المستخدمين ${userData.length}${secrets.length ? `، ملفات الجلسات والأسرار ${secrets.length}` : ''}${big.length ? `، كبيرة جدًا ${big.length}` : ''}`;
        if (!changed.length) {
            return reply(deco.infoBox('✅ النسخة محدّثة', `📁 ${files.length} ملف، لا توجد تغييرات منذ آخر نسخ\n${skippedLine}${publicNote}`));
        }

        // 4) رفع الملفات (blobs) بالتوازي المحدود
        let next = 0, failed = null;
        const worker = async () => {
            while (!failed) {
                const f = changed[next++];
                if (!f) return;
                const res = await ghRetry('post', '/git/blobs', { content: f.buf.toString('base64'), encoding: 'base64' });
                if (res.status !== 201) { failed = `${f.rel}: ${ghErr(res)}`; return; }
                f.sha = res.data.sha;
            }
        };
        await Promise.all(Array.from({ length: 5 }, worker));
        if (failed) return reply(deco.errorBox(`فشل رفع ملف، لم يُحفظ شيء.\n${failed}`));

        // 5) شجرة جديدة فوق القديمة + commit + تحريك الفرع
        const newTree = await ghRetry('post', '/git/trees', {
            base_tree: baseTree,
            tree: changed.map(f => ({ path: f.rel, mode: '100644', type: 'blob', sha: f.sha }))
        });
        if (newTree.status !== 201) return reply(deco.errorBox(`تعذّر إنشاء شجرة الملفات: ${ghErr(newTree)}`));
        const msg = `نسخة احتياطية ${new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC (${changed.length} ملف)`;
        const newCommit = await ghRetry('post', '/git/commits', { message: msg, tree: newTree.data.sha, parents: [headSha] });
        if (newCommit.status !== 201) return reply(deco.errorBox(`تعذّر إنشاء النسخة: ${ghErr(newCommit)}`));
        const upd = await ghRetry('patch', `/git/refs/heads/${branch}`, { sha: newCommit.data.sha, force: false });
        if (upd.status !== 200) return reply(deco.errorBox(`تعذّر تحديث الفرع: ${ghErr(upd)}`));

        return reply(deco.infoBox('✅ تم النسخ',
            `📁 الملفات: ${files.length}\n⬆️ المرفوع الجديد/المتغيّر: ${changed.length}\n${skippedLine}\n🔗 https://github.com/${c.repo}/tree/${branch}${publicNote}`));
    } catch (e) {
        return reply(deco.errorBox(`فشل النسخ: ${(e && e.message) || e}`));
    } finally {
        running = false;
    }
};
