const fs = require("fs-extra");
const path = require("path");

const dirPath = path.join(__dirname, "../../Heba_DB");
const filePath = path.join(dirPath, "global_stats.json");

/** كتابة ذرّية: ملف مؤقت ثم إعادة تسمية، حتى لا يقرأ أحد ملفًا نصف مكتوب */
function writeAtomic(obj) {
    const tmp = filePath + "." + process.pid + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 4));
    fs.renameSync(tmp, filePath);
}

function ensureExists() {
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, JSON.stringify({}, null, 4));
}

module.exports = {
    getData: (uid) => {
        ensureExists();
        const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        if (!data[uid]) {
            data[uid] = {
                level: 1,
                xp: 0,
                points: 100, // رصيد هدية عند أول ظهور
                rank: "مبتدئ ✨",
                inventory: [],
                lastDaily: 0
            };
            writeAtomic(data);
        }
        return data[uid];
    },
    saveData: (uid, userStats) => {
        ensureExists();
        const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        data[uid] = userStats;
        writeAtomic(data);
    },
    getAll: () => {
        ensureExists();
        return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
};
