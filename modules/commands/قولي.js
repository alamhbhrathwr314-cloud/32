const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

module.exports.config = {
    name: "قولي",
    version: "3.0.0",
    hasPermssion: 0,
    credits: "ايمن",
    description: "البوت يقول ما تكتبه كرسالة صوتية",
    commandCategory: "fun",
    usages: "قولي [النص]",
    cooldowns: 3,
    dependencies: { "axios": "", "fs-extra": "", "path": "" }
};

module.exports.run = async function({ api, event, args }) {
    const { threadID, messageID } = event;

    const text = args.join(" ").trim();
    if (!text) {
        return api.sendMessage(
            "⌬ ━━ 𝗞𝗜𝗥𝗔 FUN ━━ ⌬\n\nاكتب شيئاً لأقوله",
            threadID, messageID
        );
    }

    const cacheDir = path.join(__dirname, "cache", "voice");
    fs.ensureDirSync(cacheDir);

    const filePath = path.join(cacheDir, `tts_${Date.now()}.mp3`);

    try {
        // تقسيم النص لأن Google TTS يحد بـ 200 حرف لكل طلب
        const chunks = text.match(/.{1,200}/g) || [text];
        const buffers = [];

        for (const chunk of chunks) {
            const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=ar&client=tw-ob`;
            const res = await axios.get(url, {
                responseType: "arraybuffer",
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
                },
                timeout: 20000
            });
            buffers.push(Buffer.from(res.data));
        }

        fs.writeFileSync(filePath, Buffer.concat(buffers));

        api.unsendMessage(messageID).catch(() => {});

        return api.sendMessage(
            {
                body: "🎙️",
                attachment: fs.createReadStream(filePath)
            },
            threadID,
            () => {
                try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (_) {}
            },
            messageID
        );

    } catch (error) {
        console.error("خطأ في أمر قولي:", error);
        try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (_) {}
        return api.sendMessage(
            "⌬ ━━ 𝗞𝗜𝗥𝗔 FUN ━━ ⌬\n\nعذراً، تعذّر إنشاء الرسالة الصوتية.",
            threadID, messageID
        );
    }
};
