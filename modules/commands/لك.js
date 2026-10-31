/**
 * ❌⭕ اكس — لعبة اكس أو بين لاعبين، بصورة للوحة تُرسم بالكود وتتحدّث مع كل نقلة.
 *   .اكس @شخص          تحدّي بالمنشن
 *   .اكس (ردًا على رسالة شخص)   تحدّي بالرد
 *   .اكس انسحاب        الانسحاب من لعبتك الجارية في هذه المجموعة
 * تكمل اللعب بالرد على صورة اللوحة برقم الخانة (1–9)، أو بكلمة «انسحاب».
 * اللاعب الأول ❌ ويبدأ، والثاني ⭕. الألعاب تُحفظ في الذاكرة وتنتهي بعد 20 دقيقة بلا حركة.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const TTL = 20 * 60 * 1000;
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const EMOJI_NUM = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
const MARK = { X: '❌', O: '⭕' };

/* ═══════════ الرسم (بدون مكتبات) ═══════════ */
const S = 600, M = 30, CELL = (S - 2 * M) / 3;
const BG = [22, 27, 41], GRID = [96, 108, 140], RED = [255, 82, 92], BLUE = [64, 170, 255], DIM = [92, 104, 142], GOLD = [255, 205, 60];
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const center = i => [M + CELL * ((i % 3) + 0.5), M + CELL * (Math.floor(i / 3) + 0.5)];

function blend(d, x, y, c, a) {
    if (x < 0 || y < 0 || x >= S || y >= S || a <= 0) return;
    const i = (y * S + x) * 4;
    d[i] += (c[0] - d[i]) * a; d[i + 1] += (c[1] - d[i + 1]) * a; d[i + 2] += (c[2] - d[i + 2]) * a;
}
/** خط سميك بأطراف دائرية وحواف ناعمة */
function line(d, x1, y1, x2, y2, th, c, alpha = 1) {
    const dx = x2 - x1, dy = y2 - y1, len2 = dx * dx + dy * dy || 1, h = th / 2 + 1;
    const x0 = Math.floor(Math.min(x1, x2) - h), xe = Math.ceil(Math.max(x1, x2) + h);
    const y0 = Math.floor(Math.min(y1, y2) - h), ye = Math.ceil(Math.max(y1, y2) + h);
    for (let y = y0; y <= ye; y++) for (let x = x0; x <= xe; x++) {
        const t = clamp01(((x - x1) * dx + (y - y1) * dy) / len2);
        const dist = Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
        blend(d, x, y, c, clamp01(th / 2 + 0.5 - dist) * alpha);
    }
}
function ring(d, cx, cy, r, th, c) {
    const h = r + th / 2 + 1;
    for (let y = Math.floor(cy - h); y <= Math.ceil(cy + h); y++) for (let x = Math.floor(cx - h); x <= Math.ceil(cx + h); x++) {
        const dist = Math.abs(Math.hypot(x - cx, y - cy) - r);
        blend(d, x, y, c, clamp01(th / 2 + 0.5 - dist));
    }
}
const GLYPHS = {
    1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
    2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
    3: ['.###.', '#...#', '....#', '..##.', '....#', '#...#', '.###.'],
    4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
    5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
    6: ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
    7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
    8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
    9: ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..']
};
function digit(d, n, cx, cy, sc, c) {
    const g = GLYPHS[n], ox = Math.round(cx - 2.5 * sc), oy = Math.round(cy - 3.5 * sc);
    for (let r = 0; r < 7; r++) for (let k = 0; k < 5; k++) if (g[r][k] === '#') {
        for (let y = 0; y < sc; y++) for (let x = 0; x < sc; x++) blend(d, ox + k * sc + x, oy + r * sc + y, c, 1);
    }
}

function drawBoard(board, winLine) {
    const d = new Uint8ClampedArray(S * S * 4);
    for (let i = 0; i < S * S; i++) { // خلفية متدرجة خفيفة
        const y = Math.floor(i / S), v = 1 + 0.12 * (1 - y / S);
        d[i * 4] = BG[0] * v; d[i * 4 + 1] = BG[1] * v; d[i * 4 + 2] = BG[2] * v; d[i * 4 + 3] = 255;
    }
    for (let k = 1; k <= 2; k++) {
        const p = M + CELL * k;
        line(d, p, M + 10, p, S - M - 10, 8, GRID);
        line(d, M + 10, p, S - M - 10, p, 8, GRID);
    }
    for (let i = 0; i < 9; i++) {
        const [cx, cy] = center(i);
        if (board[i] === 'X') {
            const o = CELL * 0.27;
            line(d, cx - o, cy - o, cx + o, cy + o, 24, RED);
            line(d, cx + o, cy - o, cx - o, cy + o, 24, RED);
        } else if (board[i] === 'O') {
            ring(d, cx, cy, CELL * 0.28, 22, BLUE);
        } else {
            digit(d, i + 1, cx, cy, 6, DIM);
        }
    }
    if (winLine) {
        const [a, , c] = winLine, [x1, y1] = center(a), [x2, y2] = center(c);
        line(d, x1, y1, x2, y2, 18, GOLD, 0.92);
    }
    return d;
}

/** ترميز PNG بدون مكتبات (zlib المدمجة في Node) */
const CRC_T = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = CRC_T[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
}
function encodePng(w, h, rgba) {
    const stride = w * 4, raw = Buffer.alloc((stride + 1) * h);
    for (let y = 0; y < h; y++) {
        raw[y * (stride + 1)] = 0;
        Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
    }
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}

/* ═══════════ منطق اللعبة ═══════════ */
const games = new Map();     // gameId ← اللعبة
const sessions = new Map();  // معرّف رسالة اللوحة ← gameId
const active = new Map();    // `${tid}:${uid}` ← gameId
let counter = 0;

const toLatin = s => String(s === undefined || s === null ? '' : s).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
const alive = g => Date.now() - g.at < TTL;

function endGame(g) {
    games.delete(g.id);
    for (const m of g.msgs) sessions.delete(m);
    for (const p of g.players) if (active.get(`${g.tid}:${p.id}`) === g.id) active.delete(`${g.tid}:${p.id}`);
}
function sweep() { for (const g of [...games.values()]) if (!alive(g)) endGame(g); }

function checkWin(board) {
    for (const l of LINES) if (board[l[0]] && board[l[0]] === board[l[1]] && board[l[0]] === board[l[2]]) return { mark: board[l[0]], line: l };
    return null;
}

const textBoard = board => [0, 3, 6].map(r => [0, 1, 2].map(c => board[r + c] ? MARK[board[r + c]] : EMOJI_NUM[r + c]).join(' ')).join('\n');

/** يرسل اللوحة كصورة (وإن فشلت، كنص) ويسجّل الرسالة ضمن جلسة اللعبة */
function sendBoard(api, event, g, body, mentions, winLine) {
    return new Promise(resolve => {
        const reg = info => { if (info && info.messageID && info.messageID !== 'sent' && games.has(g.id)) { g.msgs.add(String(info.messageID)); sessions.set(String(info.messageID), g.id); } };
        const sendText = () => api.sendMessage({ body: `${body}\n\n${textBoard(g.board)}`, mentions }, event.threadID, (err, info) => { reg(info); resolve(); }, event.messageID);
        let file;
        try {
            file = path.join(os.tmpdir(), `kira-xo-${Date.now()}-${Math.floor(Math.random() * 1e6)}.png`);
            fs.writeFileSync(file, encodePng(S, S, drawBoard(g.board, winLine)));
        } catch (e) { return sendText(); }
        const stream = fs.createReadStream(file);
        stream.on('error', () => {});   // لو فشل الإرسال قبل قراءة الملف لا نترك الخطأ يوقف البوت
        api.sendMessage({ body, mentions, attachment: stream }, event.threadID, (err, info) => {
            fs.unlink(file, () => {});
            if (err) return sendText();
            reg(info); resolve();
        }, event.messageID);
    });
}

const FOOT = '\n\n↩️ ردّ على صورة اللوحة برقم الخانة (1–9)\n🏳️ للانسحاب ردّ بكلمة: انسحاب';
const tagOf = p => `@${p.name}`;

async function announceTurn(api, event, g, prefixText) {
    const p = g.players[g.turn];
    const body = `${prefixText}🎮 الدور على ${MARK[p.mark]} ${tagOf(p)}${FOOT}`;
    return sendBoard(api, event, g, body, [{ id: p.id, tag: tagOf(p) }], null);
}

async function finish(api, event, g, text, winLine) {
    const mentions = g.players.map(p => ({ id: p.id, tag: tagOf(p) }));
    g.at = Date.now();
    await sendBoard(api, event, g, `${text}\n\n🔁 للعب مرة أخرى: .اكس @الخصم`, mentions, winLine);
    endGame(g);
}

async function resign(api, event, g, loserIdx) {
    const win = g.players[1 - loserIdx], lose = g.players[loserIdx];
    return finish(api, event, g, `🏳️ ${tagOf(lose)} انسحب\n🏆 الفائز: ${MARK[win.mark]} ${tagOf(win)}`, null);
}

/* ═══════════ الأمر ═══════════ */
module.exports.config = {
    name: 'اكس', aliases: ['xo', 'اكسو', 'اكس_او', 'tictactoe'],
    description: 'لعبة اكس أو بالمنشن أو الرد وتكمل بالرد على الصورة',
    usage: 'اكس @شخص | اكس (ردًا على رسالة) | اكس انسحاب', category: 'games', cooldown: 8, adminOnly: false
};

module.exports.run = async ({ api, event, args, helpers, deco }) => {
    const uid = String(event.senderID), tid = String(event.threadID);
    const reply = text => helpers.reply(api, event, text);
    sweep();

    if (args[0] === 'انسحاب' || args[0] === 'resign') {
        const g = games.get(active.get(`${tid}:${uid}`));
        if (!g) return reply(deco.errorBox('ما عندك لعبة اكس شغالة في هذه المجموعة'));
        return resign(api, event, g, g.players.findIndex(p => p.id === uid));
    }

    const target = helpers.getTarget(event, args);
    if (!target) return reply(deco.errorBox('منشن الشخص أو ردّ على رسالته:\n.اكس @فلان'));
    let botId = '';
    try { botId = String(api.getCurrentUserID()); } catch (e) { /* تجاهل */ }
    if (target === uid) return reply(deco.errorBox('ما تقدر تلعب ضد نفسك 😅'));
    if (target === botId) return reply(deco.errorBox('البوت ما يلعب، اختر شخصًا حقيقيًا'));
    for (const id of [uid, target]) {
        if (active.has(`${tid}:${id}`)) {
            return reply(deco.errorBox(id === uid ? 'عندك لعبة شغالة، أكملها أو اكتب .اكس انسحاب'
                : 'هذا الشخص في لعبة اكس شغالة الآن'));
        }
    }

    const [n1, n2] = await helpers.getNames(api, [uid, target]);
    const g = {
        id: `g${++counter}`, tid, board: Array(9).fill(null), turn: 0, at: Date.now(), msgs: new Set(),
        players: [{ id: uid, name: n1, mark: 'X' }, { id: target, name: n2, mark: 'O' }]
    };
    games.set(g.id, g);
    for (const p of g.players) active.set(`${tid}:${p.id}`, g.id);
    return announceTurn(api, event, g, `⚔️ تحدّي اكس أو!\n❌ ${tagOf(g.players[0])}  VS  ⭕ ${tagOf(g.players[1])}\n\n`);
};

/** اللعب بالرد على صورة اللوحة */
module.exports.onMessage = async ({ api, event, helpers }) => {
    if (event.type !== 'message_reply' || !event.messageReply || !event.messageReply.messageID) return false;
    const g = games.get(sessions.get(String(event.messageReply.messageID)));
    if (!g) return false;
    if (!alive(g)) { endGame(g); return false; }
    if (String(event.threadID) !== g.tid) return false;
    const uid = String(event.senderID), pi = g.players.findIndex(p => p.id === uid);
    if (pi < 0) return false;                                  // غير اللاعبين: نتجاهل
    const text = toLatin(event.body).trim();

    if (/^(انسحاب|استسلام|resign)$/i.test(text)) { await resign(api, event, g, pi); return true; }
    const m = text.match(/^([1-9])$/);
    if (!m) return false;                                      // كلام عادي: لا نبتلعه

    if (pi !== g.turn) { await helpers.reply(api, event, `⏳ الدور على ${MARK[g.players[g.turn].mark]} ${g.players[g.turn].name}`); return true; }
    const cell = Number(m[1]) - 1;
    if (g.board[cell]) { await helpers.reply(api, event, `❌ الخانة ${cell + 1} مشغولة، اختر خانة فارغة`); return true; }

    const me = g.players[pi];
    g.board[cell] = me.mark; g.at = Date.now();
    const win = checkWin(g.board);
    if (win) { await finish(api, event, g, `🏆 فاز ${MARK[win.mark]} ${tagOf(me)}!`, win.line); return true; }
    if (g.board.every(Boolean)) { await finish(api, event, g, '🤝 تعادل! اللوحة امتلأت', null); return true; }
    g.turn = 1 - g.turn;
    await announceTurn(api, event, g, `${MARK[me.mark]} ${tagOf(me)} لعب في الخانة ${cell + 1}\n`);
    return true;
};

module.exports.__test = { drawBoard, encodePng, checkWin, S };
