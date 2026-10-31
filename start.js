// نقطة التشغيل (Railway / Render): يسترجع البيانات من GitHub أولًا ثم يشغّل البوت.
// أمر البدء: node start.js
//
// الحفظ: تلقائي كل SYNC_INTERVAL_MIN دقائق (الافتراضي 5) وعند الإيقاف.
// لجعله يدويًا فقط (بالأمر .حفظ): أضف المتغير SYNC_AUTO = 0
const cloudSync = require('./utils/cloudSync');

(async () => {
    try { await cloudSync.restore(); } catch (e) { console.error('[sync] restore:', e.message); }
    if (process.env.SYNC_AUTO === '0') {
        console.log('[sync] الحفظ التلقائي متوقف (SYNC_AUTO=0). استعمل الأمر .حفظ لرفع البيانات');
    } else {
        cloudSync.startAutoPush();
    }
    require('./utils/keepalive');
    require('./main');              // يُحمَّل بعد الاسترجاع حتى يقرأ users.json الصحيح
})();
