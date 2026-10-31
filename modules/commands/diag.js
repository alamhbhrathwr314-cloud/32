/**
 * .فحص — تشخيص للمطور: أين يعمل البوت وماذا في سجل بياناتك.
 * مفيد لكشف تعدد النسخ (Termux وRailway معًا) أو ضياع البيانات.
 */
const os = require('os');
const path = require('path');
const states = require('../../utils/db/states');
let itemCount = '؟'; // يُقرأ من ملف المتجر إن وُجد
try { itemCount = require('./shop').S.ITEMS.length; } catch (e) { /* ملف المتجر غير موجود */ }

module.exports.config = {
    name: 'فحص', aliases: ['diag', 'debug'],
    description: 'تشخيص: مكان تشغيل البوت وسجل بياناتك (للمطور)',
    usage: 'فحص', category: 'admin', cooldown: 3, adminOnly: true
};

module.exports.run = async ({ api, event, helpers, deco }) => {
    const uid = String(event.senderID);
    const dir = path.join(__dirname, '..', '..', 'Heba_DB');
    const all = states.getAll();
    const mine = all[uid];
    const shop = mine && mine.shop;
    const items = shop && shop.items && Object.keys(shop.items).length
        ? Object.entries(shop.items).map(([id, q]) => `${id}×${q}`).join('، ') : 'لا شيء';
    const mins = Math.floor(process.uptime() / 60);

    return helpers.reply(api, event, deco.infoBox('🩺 تشخيص', [
        `🖥️ الجهاز: ${os.hostname()}`,
        `🔢 العملية: ${process.pid} | تعمل منذ ${mins} دقيقة`,
        `📂 البيانات: ${dir}`,
        `👥 السجلات في ملف النقاط: ${Object.keys(all).length}`,
        `🆔 أيديك: ${uid}`,
        mine ? `💰 رصيدك: ${helpers.fmt(mine.points)}` : '⚠️ لا يوجد سجل لك في هذا الملف',
        `🎒 المخزون (inventory): ${mine && mine.inventory ? mine.inventory.length : 0}`,
        `🛍️ أغراض المتجر (shop): ${items}`,
        `💹 استثمارات: ${shop && shop.investments ? shop.investments.length : 0}`,
        `📦 عدد أغراض المتجر في الكود: ${itemCount}`
    ].join('\n')));
};
