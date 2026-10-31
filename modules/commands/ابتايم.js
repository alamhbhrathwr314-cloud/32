const fs = require('fs-extra');
const path = require('path');

module.exports.config = {
    name: "المجموعات",
    aliases: ["groups", "قروبات"],
    version: "1.0.0",
    hasPermssion: 2,
    credits: "ايمن",
    description: "يعرض كل المجموعات التي يتواجد فيها البوت (للمطور فقط)",
    commandCategory: "admin",
    usages: "المجموعات",
    cooldowns: 15
};

module.exports.run = async function({ api, event, args, cfg }) {
    const { threadID, messageID } = event;

    api.setMessageReaction("🔍", messageID, () => {}, true);

    try {
        // جلب قائمة المحادثات (INBOX = الرسائل الواردة)
        const threads = await new Promise((resolve, reject) => {
            api.getThreadList(50, null, ["INBOX"], (err, data) => {
                if (err) return reject(err);
                resolve(data);
            });
        });

        if (!threads || threads.length === 0) {
            api.setMessageReaction("❌", messageID, () => {}, true);
            return api.sendMessage(
                "⌬ ━━ 𝗥𝗘𝗠𝗢 ━━ ⌬\n\nلم أجد أي مجموعات.",
                threadID, messageID
            );
        }

        // فلترة المجموعات فقط (استبعاد المحادثات الفردية)
        const groups = threads.filter(t => t.isGroup);

        if (groups.length === 0) {
            api.setMessageReaction("❌", messageID, () => {}, true);
            return api.sendMessage(
                "⌬ ━━ 𝗥𝗘𝗠𝗢 ━━ ⌬\n\nالبوت ليس عضواً في أي مجموعة.",
                threadID, messageID
            );
        }

        // بناء قائمة المجموعات
        let text = `⌬ ━━ 𝗥𝗘𝗠𝗢 𝗚𝗥𝗢𝗨𝗣𝗦 ━━ ⌬\n\n`;
        text += `📊 إجمالي المجموعات: ${groups.length}\n\n`;

        groups.forEach((g, i) => {
            const name = g.name || "بدون اسم";
            const members = g.participantIDs ? g.participantIDs.length : 0;
            const id = g.threadID;
            text += `${i + 1}. ${name}\n`;
            text += `   👥 الأعضاء: ${members}\n`;
            text += `   🆔 ${id}\n\n`;
        });

        // إذا كان النص طويلاً، نقسمه
        if (text.length > 1900) {
            // إرسال على أجزاء
            const chunks = text.match(/.{1,1800}/g) || [text];
            for (const chunk of chunks) {
                await api.sendMessage(chunk, threadID);
            }
            api.setMessageReaction("✅", messageID, () => {}, true);
            return;
        }

        api.setMessageReaction("✅", messageID, () => {}, true);
        return api.sendMessage(text, threadID, messageID);

    } catch (error) {
        console.error("خطأ في أمر المجموعات:", error);
        api.setMessageReaction("❌", messageID, () => {}, true);
        return api.sendMessage(
            "⌬ ━━ 𝗥𝗘𝗠𝗢 ━━ ⌬\n\nتعذّر جلب قائمة المجموعات.",
            threadID, messageID
        );
    }
};
