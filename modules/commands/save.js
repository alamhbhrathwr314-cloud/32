/**
 * .حفظ — رفع بيانات البوت (Heba_DB/*.json) إلى GitHub عند الطلب (للمطور فقط)
 *   .حفظ        يرفع الملفات التي تغيّرت منذ آخر رفع
 *   .حفظ حالة   يعرض ملفات البيانات المحلية وهل الحفظ السحابي مفعّل
 *   .حفظ كوكيز  يحفظ أحدث كوكيز من حساب البوت نفسه (من الجلسة الشغّالة، بلا لصق) ويرفعها إلى GitHub
 *       ويحدّث FB_COOKIE في Render إن ضُبط RENDER_API_KEY (تحديثه يعيد تشغيل الخدمة)
 *   .حفظ كوكيز <نص>  (احتياطي، في الخاص فقط) كوكيز ملصوقة يدويًا، تفيد إن انتهت الكوكيز والبوت غير متصل
 *       لتبديل حساب البوت بحساب آخر أضف كلمة «تبديل»:  .حفظ كوكيز تبديل <نص>
 * يعتمد على نفس إعدادات الحفظ السحابي: SYNC_GITHUB_TOKEN و SYNC_GITHUB_REPO
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cloudSync = require('../../utils/cloudSync');
const { parseCookies } = require('../../utils/cookies');
const session = require('../../utils/session');

const DIR = path.join(__dirname, '..', '..', 'Heba_DB');

module.exports.config = {
    name: 'حفظ', aliases: ['save', 'backup'],
    description: 'رفع بيانات البوت إلى GitHub الآن (للمطور)',
    usage: 'حفظ | حفظ حالة | حفظ كوكيز', category: 'admin', cooldown: 5, adminOnly: true
};


/* ─────────── حفظ كوكيز فيسبوك جديدة ─────────── */
const COOKIE_CMD = ['كوكيز', 'كوكي', 'cookies', 'cookie', 'appstate'];

function findTextFile(event) {
    for (const l of [event.messageReply && event.messageReply.attachments, event.attachments]) {
        const a = (l || []).find(x => x && String(x.type) === 'file' && x.url);
        if (a) return a.url;
    }
    return null;
}

async function liveSave({ api, event, helpers, deco }) {
    const say = t => helpers.reply(api, event, t);
    if (typeof (global.client && global.client.saveLiveCookies) !== 'function') {
        return say(deco.warning('حفظ الكوكيز غير متاح في الوضع الرسمي (Messenger Platform)'));
    }
    let r;
    try { r = await global.client.saveLiveCookies(); }
    catch (e) { return say(deco.errorBox('تعذّر حفظ الكوكيز: ' + (e && e.message || e))); }
    const lines = [`✅ تم حفظ أحدث كوكيز الحساب (${r.count} كوكي)`];
    lines.push(r.pushed > 0 ? '☁️ رُفعت إلى GitHub' : '☁️ GitHub: لا جديد للرفع، أو الحفظ السحابي غير مفعّل');
    if (r.render === 'ok') lines.push('🔁 حُدّث FB_COOKIE في Render (ستُعاد الخدمة)');
    else if (r.render === 'failed') lines.push('⚠️ تعذّر تحديث FB_COOKIE في Render (راجع السجل)');
    return say(deco.successLine(lines.join('\n')));
}

async function cookiesFlow({ api, event, helpers, deco, cfg }) {
    const say = t => helpers.reply(api, event, t);
    const prefix = cfg.getPrefix();

    // النص بعد «.حفظ كوكيز» (وكلمة «تبديل» إن وُجدت)
    let rest = String(event.body || '').trim().replace(/^\S+\s+\S+\s*/, '');
    let allowSwitch = false;
    const m = rest.match(/^(تبديل|switch)(\s+|$)/i);
    if (m) { allowSwitch = true; rest = rest.slice(m[0].length); }

    let text = rest.length > 20 ? rest : '';
    if (!text && event.messageReply && String(event.messageReply.body || '').length > 20) text = event.messageReply.body;
    if (!text) {
        const url = findTextFile(event);
        if (url) {
            try {
                const r = await axios.get(url, { responseType: 'text', timeout: 20000, maxContentLength: 300 * 1024, transformResponse: x => x });
                text = String(r.data || '');
            } catch (e) { return say(deco.errorBox('تعذّر قراءة الملف، الصق الكوكيز كنص بدل الملف')); }
        }
    }

    if (!text) return liveSave({ api, event, helpers, deco });   // بدون لصق: نحفظ كوكيز حساب البوت الحالية

    // الكوكيز الملصوقة: خاص فقط لأنها حسّاسة
    if (typeof (global.client && global.client.applyCookies) !== 'function') {
        return say(deco.warning('حفظ الكوكيز غير متاح في الوضع الرسمي (Messenger Platform)'));
    }
    if (event.isGroup) {
        return say(deco.warning('الكوكيز تعطي دخولًا كاملًا للحساب. أرسلها في المحادثة الخاصة مع البوت فقط، لا في مجموعة'));
    }
    let state;
    try { state = parseCookies(text); }
    catch (e) { return say(deco.errorBox('الكوكيز غير صالحة: ' + (e && e.message || e))); }

    const newId = String((state.find(c => c.key === 'c_user') || {}).value || '');
    const me = String((typeof api.getCurrentUserID === 'function' && api.getCurrentUserID()) || '');
    if (me && newId && newId !== me && !allowSwitch) {
        return say(deco.warning(`هذه الكوكيز لحساب مختلف (${newId}) عن حساب البوت (${me}).\nإن كنت تقصد تبديل الحساب اكتب: ${prefix}حفظ كوكيز تبديل`));
    }

    try { global.client.applyCookies(state, 'upload'); }
    catch (e) { return say(deco.errorBox('تعذّر حفظ الكوكيز: ' + (e && e.message || e))); }

    return say(deco.successLine([
        '✅ تم حفظ الكوكيز الجديدة',
        '🔄 سيعيد البوت الدخول بها خلال ثوانٍ',
        '☁️ تُرفع تلقائيًا إلى GitHub فتبقى بعد إعادة النشر على Render',
        '🧹 احذف رسالة الكوكيز من المحادثة الآن'
    ].join('\n')));
}

module.exports.run = async ({ api, event, args, helpers, deco, cfg }) => {
    const reply = t => helpers.reply(api, event, t);

    // .حفظ كوكيز  ← يعمل حتى لو الحفظ السحابي غير مفعّل
    if (args[0] && COOKIE_CMD.includes(String(args[0]).toLowerCase())) return cookiesFlow({ api, event, helpers, deco, cfg });

    if (!cloudSync.enabled()) {
        return reply(deco.errorBox('الحفظ السحابي غير مفعّل.\nأضف SYNC_GITHUB_TOKEN و SYNC_GITHUB_REPO في إعدادات الاستضافة'));
    }

    if (args[0] === 'حالة' || args[0] === 'status') {
        let files = [];
        try { files = fs.readdirSync(DIR).filter(f => /\.json$/i.test(f)); } catch (e) { /* لا مجلد بعد */ }
        const rows = files.map(f => {
            let kb = '؟';
            try { kb = (fs.statSync(path.join(DIR, f)).size / 1024).toFixed(1); } catch (e) { /* تجاهل */ }
            return `• ${f} (${kb} ك.ب)`;
        });
        return reply(deco.infoBox('☁️ حالة الحفظ', [
            '✅ الحفظ السحابي مفعّل',
            `📦 الملفات المحلية: ${files.length}`,
            ...rows,
            '',
            'اكتب .حفظ لرفعها الآن'
        ].join('\n')));
    }

    await reply('⏳ جارٍ رفع البيانات إلى GitHub...');
    let n;
    try { n = await cloudSync.pushChanges(); }
    catch (e) { return reply(deco.errorBox(`فشل الرفع: ${e && e.message || e}`)); }

    if (n > 0) return reply(deco.success(`☁️ تم رفع ${n} ملف إلى GitHub`));
    return reply(deco.infoBox('☁️ الحفظ', 'لا توجد تغييرات جديدة للرفع، أو أن GitHub غير متاح الآن.\nراجع سجل التشغيل (Logs) وابحث عن [sync] إن شككت.'));
};
