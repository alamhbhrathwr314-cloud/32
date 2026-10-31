const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

module.exports.config = {
    name: "مجموعتي",
    aliases: ["groupinfo", "معلومات"],
    version: "1.3.1",
    hasPermssion: 0,
    credits: "ايمن",
    description: "يعرض معلومات المجموعة: الاسم، الصورة، الأعضاء، والأدمن",
    commandCategory: "tools",
    usages: "مجموعتي",
    cooldowns: 10
};

module.exports.run = async function({ api, event, args, Users }) {
    const { threadID, messageID } = event;

    api.setMessageReaction("🔍", messageID, () => {}, true);

    try {
        const threadInfo = await api.getThreadInfo(threadID);

        if (!threadInfo.isGroup) {
            api.setMessageReaction("❌", messageID, () => {}, true);
            return api.sendMessage("⌬ ━━ 𝗥𝗘𝗠𝗢 ━━ ⌬\n\nهذا الأمر للمجموعات فقط.", threadID, messageID);
        }

        const groupName = threadInfo.threadName || "بدون اسم";
        const memberIDs = threadInfo.participantIDs || [];
        const adminIDs = (threadInfo.adminIDs || []).map(a => String(a.id || a));
        const emoji = threadInfo.emoji || "💬";

        const totalMembers = memberIDs.length;
        const totalAdmins = adminIDs.length;

        // جلب أسماء الأعضاء (أول 20 فقط)
        let membersText = "";
        const shownMembers = memberIDs.slice(0, 20);
        for (const id of shownMembers) {
            try {
                const name = await Users.getNameUser(id);
                const isAdmin = adminIDs.includes(String(id));
                membersText += `\n  ${isAdmin ? "👑" : "•"} ${name || "عضو"}`;
            } catch (_) {
                membersText += `\n  • عضو`;
            }
        }
        if (totalMembers > 20) membersText += `\n  ... و${totalMembers - 20} آخرون`;

        // جلب صورة المجموعة
        let imageUrl = null;
        try {
            if (threadInfo.imageSrc && threadInfo.imageSrc !== "none") {
                imageUrl = threadInfo.imageSrc;
            } else {
                const pics = await new Promise((resolve, reject) => {
                    api.getThreadPictures(threadID, 0, 1, (err, data) => {
                        if (err) return reject(err);
                        resolve(data);
                    });
                });
                if (pics && pics.length > 0) imageUrl = pics[0];
            }
        } catch (_) { /* تجاهل */ }

        const infoText =
            `⌬ ━━ 𝗥𝗘𝗠𝗢 𝗚𝗥𝗢𝗨𝗣 ━━ ⌬\n\n` +
            `${emoji} الاسم: ${groupName}\n` +
            `👥 عدد الأعضاء: ${totalMembers}\n` +
            `👑 عدد الأدمن: ${totalAdmins}\n\n`;

        api.setMessageReaction("✅", messageID, () => {}, true);

        if (imageUrl) {
            try {
                const cacheDir = path.join(__dirname, "cache", "groupinfo");
                fs.ensureDirSync(cacheDir);
                const imgPath = path.join(cacheDir, `group_${threadID}.jpg`);

                const imgRes = await axios.get(imageUrl, { responseType: "arraybuffer", timeout: 15000 });
                fs.writeFileSync(imgPath, Buffer.from(imgRes.data));

                return api.sendMessage({
                    body: infoText,
                    attachment: fs.createReadStream(imgPath)
                }, threadID, () => {
                    try { if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath); } catch (_) {}
                }, messageID);

            } catch (_) {
                return api.sendMessage(infoText, threadID, messageID);
            }
        }

        return api.sendMessage(infoText, threadID, messageID);

    } catch (error) {
        console.error("خطأ في أمر مجموعتي:", error);
        api.setMessageReaction("❌", messageID, () => {}, true);
        return api.sendMessage(
            "⌬ ━━ 𝗥𝗘𝗠𝗢 ━━ ⌬\n\nتعذّر جلب معلومات المجموعة.",
            threadID, messageID
        );
    }
};
