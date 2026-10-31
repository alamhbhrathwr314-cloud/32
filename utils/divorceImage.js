/**
 * 💔 صورة الطلاق: صورتا الشخصين متباعدتان (بالأبيض والأسود قليلًا) وبينهما قلب مكسور
 * بنصفين متباعدين مائلين وشق متعرّج، على خلفية زرقاء رمادية ماطرة.
 * تعتمد على أدوات الرسم نفسها في marryImage.js (بدون مكتبات إضافية).
 */
const { decodeImage, encodePng, W, H, drawAvatar, blend, clamp01, CY, R } = require('./marryImage');

const CX_A = 175, CX_B = 725, CX_MID = 450;

function background() {
    const d = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const t = clamp01((y / H) * 0.8 + (x / W) * 0.2);
            const i = (y * W + x) * 4;
            d[i] = 70 + (28 - 70) * t; d[i + 1] = 84 + (36 - 84) * t; d[i + 2] = 128 + (70 - 128) * t; d[i + 3] = 255;
        }
    }
    // مطر: خطوط مائلة رفيعة بتوزيع ثابت
    let seed = 7;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let k = 0; k < 90; k++) {
        const x0 = rnd() * (W + 200), y0 = rnd() * H, len = 18 + rnd() * 26, a = 0.10 + rnd() * 0.12;
        for (let s = 0; s < len; s++) blend(d, Math.round(x0 - s * 0.35), Math.round(y0 + s), 210, 225, 255, a);
    }
    return d;
}

const inHeart = (x, y) => { const a = x * x + y * y - 1; return a * a * a - x * x * y * y * y <= 0; };
/** خط الشق المتعرّج (إزاحة أفقية بوحدات القلب حسب الارتفاع) */
const zig = ty => 0.11 * (4 * Math.abs((((ty * 2.4) % 1) + 1) % 1 - 0.5) - 1);

/** نصف قلب (side = -1 يسار، +1 يمين) مُزاح ومائل حول مركز القلب */
function halfHeart(d, cx, cy, s, side, dx, dy, ang, colorAt, grow = 1) {
    const cos = Math.cos(-ang), sin = Math.sin(-ang);
    const r = 1.5 * s + Math.abs(dx) + Math.abs(dy);
    for (let py = Math.floor(cy - r); py <= cy + r; py++) {
        for (let px = Math.floor(cx - r); px <= cx + r; px++) {
            let hit = 0;
            for (let sy = 0; sy < 3; sy++) {
                for (let sx = 0; sx < 3; sx++) {
                    const X = px + (sx + 0.5) / 3 - cx - dx, Y = py + (sy + 0.5) / 3 - cy - dy;   // نلغي الإزاحة
                    const lx = (X * cos - Y * sin) / (s * grow), ly = (X * sin + Y * cos) / (s * grow); // ثم الدوران
                    if (!inHeart(lx, -ly + 0.15)) continue;
                    const edge = zig(ly);
                    if (side < 0 ? lx <= edge : lx > edge) hit++;
                }
            }
            if (hit) { const c = colorAt(py); blend(d, px, py, c[0], c[1], c[2], hit / 9); }
        }
    }
}

function grayCircle(d, cx, cy, amount) { // تقليل ألوان الصورة الشخصية (حزن)
    for (let py = cy - R; py <= cy + R; py++) {
        for (let px = cx - R; px <= cx + R; px++) {
            if (Math.hypot(px + 0.5 - cx, py + 0.5 - cy) > R - 1) continue;
            const i = (py * W + px) * 4, g = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
            d[i] += (g - d[i]) * amount; d[i + 1] += (g - d[i + 1]) * amount; d[i + 2] += (g - d[i + 2]) * amount;
        }
    }
}

function makeDivorceImage(bufA, bufB, seedA = 'a', seedB = 'b') {
    const d = background();
    drawAvatar(d, CX_A, CY, decodeImage(bufA), seedA);
    drawAvatar(d, CX_B, CY, decodeImage(bufB), seedB);
    grayCircle(d, CX_A, CY, 0.55);
    grayCircle(d, CX_B, CY, 0.55);

    const S = 66, ang = 0.32;
    const grad = (top, bottom) => y => { const t = clamp01((y - (CY - 90)) / 180); return [top[0] + (bottom[0] - top[0]) * t, top[1] + (bottom[1] - top[1]) * t, top[2] + (bottom[2] - top[2]) * t]; };
    // حدّ داكن ثم لون القلب لكل نصف
    halfHeart(d, CX_MID, CY, S, -1, -32, 12, -ang, () => [25, 10, 30], 1.09);
    halfHeart(d, CX_MID, CY, S, +1, 32, 18, ang, () => [25, 10, 30], 1.09);
    halfHeart(d, CX_MID, CY, S, -1, -32, 12, -ang, grad([235, 70, 100], [150, 25, 70]));
    halfHeart(d, CX_MID, CY, S, +1, 32, 18, ang, grad([225, 60, 95], [135, 20, 65]));
    // شظايا صغيرة بين النصفين
    for (const [x, y, s] of [[CX_MID - 4, CY + 4, 9], [CX_MID + 14, CY + 30, 7], [CX_MID - 18, CY + 52, 6]]) {
        halfHeart(d, x, y, s, -1, 0, 0, 0.4, () => [200, 55, 90]);
        halfHeart(d, x, y, s, +1, 3, 0, 0.4, () => [170, 40, 80]);
    }
    return encodePng(W, H, d);
}

module.exports = { makeDivorceImage };
