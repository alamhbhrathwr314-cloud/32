/**
 * .حفظ — رفع بيانات البوت (Heba_DB/*.json) إلى GitHub عند الطلب (للمطور فقط)
 *   .حفظ        يرفع الملفات التي تغيّرت منذ آخر رفع
 *   .حفظ حالة   يعرض ملفات البيانات المحلية وهل الحفظ السحابي مفعّل
 * يعتمد على نفس إعدادات الحفظ السحابي: SYNC_GITHUB_TOKEN و SYNC_GITHUB_REPO
 */
const fs = require('fs');
const path = require('path');
const cloudSync = require('../../utils/cloudSync');

const DIR = path.join(__dirname, '..', '..', 'Heba_DB');

module.exports.config = {
    name: 'حفظ', aliases: ['save', 'backup'],
    description: 'رفع بيانات البوت إلى GitHub الآن (للمطور)',
    usage: 'حفظ | حفظ حالة', category: 'admin', cooldown: 5, adminOnly: true
};

module.exports.run = async ({ api, event, args, helpers, deco }) => {
    const reply = t => helpers.reply(api, event, t);

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
