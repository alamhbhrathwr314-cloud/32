module.exports.config = {
    name: "تاج",
    aliases: ["promote", "توجني"],
    version: "1.0.2",
    credits: "تويكس",
    description: "رفع المطور مسؤولاً (أدمن) في المجموعة",
    category: "admin",
    usage: "احم",
    cooldown: 2,
    adminOnly: false // التحقق يتم يدوياً داخل الكود
};

module.exports.run = async ({ api, event }) => {
    const { threadID, senderID, messageID } = event;

    // جلب معرف المطور الأساسي بأمان
    const adminList = global.config.ADMINBOT || [];
    const adminID = String(adminList[0] || "");
    const userID = String(senderID);

    // التحقق: هل الشخص الذي أرسل الأمر هو المطور؟
    if (userID !== adminID) {
        return api.sendMessage(
            "⌬ ━━━━━━━━━━━━ ⌬\n⚠️ هـذا الأمـر لـلـمـطـور فـقـط\n⌬ ━━━━━━━━━━━━ ⌬",
            threadID,
            messageID // ليكون الرد على رسالة الشخص نفسه
        );
    }

    // تنفيذ رفع المطور إلى أدمن
    return api.changeAdminStatus(threadID, adminID, true, (err) => {
        if (err) {
            // فشل الرفع (غالباً لأن البوت نفسه ليس أدمن)
            return api.sendMessage(
                "⌬ ━━━━━━━━━━━━ ⌬\n❌ يـرجـى رفـع الـبـوت أولاً (تأكد أن البوت أدمن)\n⌬ ━━━━━━━━━━━━ ⌬",
                threadID,
                messageID
            );
        }

        // نجاح العملية
        return api.sendMessage(
            "⌬ ━━━━━━━━━━━━ ⌬\n✅ تـم الـتـنـفـيذ سـيـدي\n⌬ ━━━━━━━━━━━━ ⌬",
            threadID,
            (err, info) => {
                // حذف رسالة النجاح بعد 3 ثواني حتى لا تزعج المجموعة
                if (!err && info && info.messageID) {
                    setTimeout(() => api.unsendMessage(info.messageID), 3000);
                }
            },
            messageID
        );
    });
};
