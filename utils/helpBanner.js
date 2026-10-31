/**
 * 🖼️ لافتة قائمة الأوامر (REMO COMMAND) — تُرسم بالكود بلا أي مكتبة خطوط.
 * خلفية متدرجة بنفسجي ← وردي، خطوط مائلة، قلوب، وحروف بكسلية متوهجة.
 * لاستعمال صورتك أنت بدلًا منها: ضع assets/help.jpg (أو .png) وسيستعملها الأمر تلقائيًا.
 */
const { encodePng } = require('./marryImage');

const W = 1000, H = 420;
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

// حروف 5×7
const G = {
    R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
    E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
    M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
    O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
    A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
    D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.']
};

function blend(d, x, y, r, g, b, a) {
    if (a <= 0 || x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    d[i] += (r - d[i]) * a; d[i + 1] += (g - d[i + 1]) * a; d[i + 2] += (b - d[i + 2]) * a;
}

function background() {
    const d = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const t = clamp01(x / W * 0.65 + y / H * 0.35);
            let r = 40 + (255 - 40) * t * t, g = 10 + (70 - 10) * t, b = 90 + (150 - 90) * (1 - Math.abs(t - 0.45) * 1.6);
            if (((x + y) % 46) < 6) { r += 18; g += 6; b += 24; }          // خطوط مائلة خفيفة
            const v = 1 - 0.35 * Math.pow(Math.hypot(x / W - 0.5, y / H - 0.5) * 1.6, 2); // تعتيم الأطراف
            const i = (y * W + x) * 4;
            d[i] = r * v; d[i + 1] = g * v; d[i + 2] = b * v; d[i + 3] = 255;
        }
    }
    return d;
}

const inHeart = (x, y) => { const a = x * x + y * y - 1; return a * a * a - x * x * y * y * y <= 0; };
function heart(d, cx, cy, s, a) {
    for (let py = Math.floor(cy - 1.3 * s); py <= cy + 1.3 * s; py++) {
        for (let px = Math.floor(cx - 1.3 * s); px <= cx + 1.3 * s; px++) {
            if (inHeart((px - cx) / s, -(py - cy) / s + 0.15)) blend(d, px, py, 255, 255, 255, a);
        }
    }
}

function cell(d, x, y, size, rgb, alpha) { // مربع بزوايا مدوّرة قليلًا
    const rad = size * 0.28;
    for (let j = 0; j < size; j++) {
        for (let i = 0; i < size; i++) {
            const dx = Math.max(rad - i, 0, i - (size - 1 - rad)), dy = Math.max(rad - j, 0, j - (size - 1 - rad));
            if (dx * dx + dy * dy <= rad * rad) blend(d, x + i, y + j, rgb[0], rgb[1], rgb[2], alpha);
        }
    }
}

function textWidth(str, size, gap) {
    return [...str].reduce((w, ch) => w + (ch === ' ' ? size * 3 : 5 * (size + gap) + size), 0) - size;
}
function drawText(d, str, x0, y0, size, gap, rgb, alpha, grow = 0) {
    let x = x0;
    for (const ch of str) {
        if (ch === ' ') { x += size * 3; continue; }
        const g = G[ch];
        for (let r = 0; r < 7; r++) {
            for (let c = 0; c < 5; c++) {
                if (g[r][c] === '#') cell(d, x + c * (size + gap) - grow, y0 + r * (size + gap) - grow, size + grow * 2, rgb, alpha);
            }
        }
        x += 5 * (size + gap) + size;
    }
}

function makeHelpBanner() {
    const d = background();
    for (const [x, y, s, a] of [[70, 60, 22, 0.22], [930, 70, 28, 0.2], [500, 38, 14, 0.25], [90, 360, 26, 0.18],
        [905, 355, 22, 0.22], [310, 385, 12, 0.22], [700, 390, 16, 0.2], [180, 150, 10, 0.2], [830, 190, 12, 0.2]]) heart(d, x, y, s, a);

    // REMO كبيرة مع توهّج وظل
    const big = 17, bgap = 3, bw = textWidth('REMO', big, bgap), bx = Math.round((W - bw) / 2), by = 70;
    drawText(d, 'REMO', bx + 7, by + 7, big, bgap, [20, 0, 40], 0.55);
    drawText(d, 'REMO', bx, by, big, bgap, [255, 90, 170], 0.30, 5);
    drawText(d, 'REMO', bx, by, big, bgap, [255, 255, 255], 1);

    // COMMAND أصغر
    const sm = 7, sgap = 2, sw = textWidth('COMMAND', sm, sgap), sx = Math.round((W - sw) / 2), sy = by + 7 * (big + bgap) + 34;
    drawText(d, 'COMMAND', sx + 3, sy + 3, sm, sgap, [20, 0, 40], 0.5);
    drawText(d, 'COMMAND', sx, sy, sm, sgap, [255, 200, 230], 1);

    // خط تزييني
    for (let x = 120; x < W - 120; x++) for (let k = 0; k < 3; k++) blend(d, x, 392 + k, 255, 255, 255, 0.55 * (1 - Math.abs(x - W / 2) / (W / 2 - 120)));
    return encodePng(W, H, d);
}

module.exports = { makeHelpBanner };
