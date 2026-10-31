# بوت كيرا

## التشغيل
1. ضع الكوكيز في ملف `appstate.json` بجانب `main.js` (لا تشاركه مع أحد).
   الصيغ المقبولة: JSON جاهز، أو تصدير إضافة متصفح (EditThisCookie وأمثالها)،
   أو نص عادي مثل:  c_user=100...; xs=...; datr=...
   (لازم يوجد c_user و xs). يتحوّل تلقائيًا ويُحدَّث الملف عند كل تشغيل.
2. عدّل `config.json` (البادئة PREFIX، الأدمن ADMINBOT، اسم المطور ADMIN_NAME).
3. نفّذ:
   npm install
   npm start

## الهيكل
- main.js — تسجيل الدخول واستقبال الرسائل وتشغيل الأوامر
- config.json — الإعدادات
- utils/ — ملفاتك (index, log, config, decorations, mentionHelper, db/states) + helpers.js
- modules/commands/ — الأوامر (ملف لكل أمر)
- Heba_DB/ — تُنشأ تلقائيًا وفيها بيانات اللاعبين

## إضافة أمر جديد
أنشئ ملفًا في modules/commands بهذا الشكل:

    module.exports.config = {
        name: 'مرحبا', aliases: ['hi'], description: 'يرد بالسلام',
        usage: 'مرحبا', category: 'tools', cooldown: 3, adminOnly: false
    };
    module.exports.run = async ({ api, event, args, helpers, states, deco, cfg, utils }) => {
        return helpers.reply(api, event, deco.success('أهلًا وسهلًا'));
    };

التصنيفات: economy, games, media, tools, admin

## ملاحظة
مكتبة تسجيل الدخول غير رسمية وقد تتغير. إن لم تعمل، جرّب مكتبة أخرى
وضع اسمها في config.json تحت FCA_MODULE (مثل "fca-unofficial").

## الوضع الرسمي (Messenger Platform) — بدون كوكيز
يُفعَّل تلقائيًا عند وجود المتغير PAGE_ACCESS_TOKEN، وإلا يعمل وضع الكوكيز.
المتغيرات: PAGE_ACCESS_TOKEN, APP_SECRET, VERIFY_TOKEN (أي نص تختاره)،
اختياري: ADMIN_PSIDS (أيدي المطور في الصفحة، يفصل بينها فاصلة), PAGE_ID, GRAPH_VERSION.
رابط الـ Webhook:  https://<نطاق-الاستضافة>/webhook
