// ─── utils/rankCard.js ────────────────────────────────────────────────────────
// نسخة v2 — إصلاح كامل لمشاكل النص والتخطيط
// ══════════════════════════════════════════════════════════════════════════════
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const GIFEncoder = require('gif-encoder-2');
const path = require('path');
const fs   = require('fs');

// ─── تسجيل الخطوط ────────────────────────────────────────────────────────────
const FONTS_DIR = path.join(__dirname, '..', 'assets', 'fonts');
try {
    const bold = path.join(FONTS_DIR, 'BricolageGrotesque-Bold.ttf');
    const mono = path.join(FONTS_DIR, 'GeistMono-Bold.ttf');
    if (fs.existsSync(bold)) GlobalFonts.registerFromPath(bold, 'Bricolage');
    if (fs.existsSync(mono)) GlobalFonts.registerFromPath(mono, 'GeistMono');
} catch (e) {
    console.error('[RANK-CARD] فشل تحميل الخطوط:', e.message);
}

// ─── الرتب ───────────────────────────────────────────────────────────────────
const RANK_TIERS = [
    { min: 100, name: 'PRESTIGE', label: 'PRESTIGE',  glow: '#a78bfa', barEnd: '#c4b5fd', bg1: '#0d0020', bg2: '#1a0040', bg3: '#2d0080' },
    { min: 60,  name: 'أسطورة',  label: 'LEGEND',    glow: '#fbbf24', barEnd: '#fde68a', bg1: '#1a0e00', bg2: '#3d2000', bg3: '#6b3500' },
    { min: 40,  name: 'خبير',    label: 'EXPERT',    glow: '#22d3ee', barEnd: '#a5f3fc', bg1: '#001e2b', bg2: '#003d5b', bg3: '#005f8a' },
    { min: 20,  name: 'محترف',   label: 'PRO',       glow: '#fb923c', barEnd: '#fed7aa', bg1: '#2d1b00', bg2: '#4a2500', bg3: '#7c3a00' },
    { min: 10,  name: 'مطور',    label: 'DEVELOPER', glow: '#a3e635', barEnd: '#d9f99d', bg1: '#1a1a2e', bg2: '#16213e', bg3: '#0f3460' },
    { min: 0,   name: 'مبتدئ',  label: 'BEGINNER',  glow: '#86efac', barEnd: '#bbf7d0', bg1: '#0f2027', bg2: '#1a3a2a', bg3: '#0d3320' },
];

function getTier(level) {
    return RANK_TIERS.find(t => level >= t.min) || RANK_TIERS[RANK_TIERS.length - 1];
}

// ─── تحويل hex لـ rgb ─────────────────────────────────────────────────────────
function hexToRgb(hex) {
    return {
        r: parseInt(hex.slice(1, 3), 16),
        g: parseInt(hex.slice(3, 5), 16),
        b: parseInt(hex.slice(5, 7), 16),
    };
}

// ─── تنسيق الأرقام الكبيرة (1,500,000 → 1.5M) ───────────────────────────────
function fmtNum(n) {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(n);
}

// ─── رسم مستطيل بزوايا دائرية ────────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

// ─── نص بحد أقصى للعرض (يقلص الخط تلقائياً) ────────────────────────────────
function fillTextFit(ctx, text, x, y, maxW, baseFont) {
    let size = parseInt(baseFont);
    const family = baseFont.replace(/^\d+px\s*/, '');
    while (size > 10) {
        ctx.font = `${size}px ${family}`;
        if (ctx.measureText(text).width <= maxW) break;
        size -= 2;
    }
    ctx.fillText(text, x, y);
}

// ─── النجوم المتحركة ──────────────────────────────────────────────────────────
const STARS = [
    [120, 35, 1.2, 0.5, 2], [340, 50, 0.8, 0.4, 3], [490, 18, 1.4, 0.6, 1],
    [610, 42, 0.9, 0.3, 4], [700, 20, 1.1, 0.5, 2], [520, 200, 0.8, 0.35, 2],
    [300, 75, 1.0, 0.3, 3], [440, 215, 0.7, 0.4, 3],
];

function drawStars(ctx, W, loop) {
    ctx.save();
    for (const [bx, y, r, ba, sp] of STARS) {
        let x = bx - (loop * 120) % W;
        if (x < 0) x += W;
        const a = Math.max(0.05, Math.min(1, ba + Math.sin(loop * Math.PI * 2 * sp) * 0.35));
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function drawDotGrid(ctx, W, H, loop) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    const ox = (loop * 80) % 24;
    for (let x = -24; x < W + 24; x += 24) {
        for (let y = 16; y < H; y += 24) {
            ctx.beginPath();
            ctx.arc(x - ox, y, 1, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.restore();
}

// ─── توليد بطاقة الرانك ───────────────────────────────────────────────────────
async function generateRankCard({ username, displayName, avatarURL, level, currentXP, xpForNext, rank, voiceMinutes = 0 }) {

    // ── الأبعاد ───────────────────────────────────────────────────────────────
    const W = 920, H = 260;

    // ── ثوابت التخطيط ─────────────────────────────────────────────────────────
    const AX = 136, AY = 130, AR = 65;     // أفاتار: مركز X، مركز Y، نصف قطر
    const TX = 230;                          // بداية منطقة النص (بعد الأفاتار)
    const TW = 490;                          // عرض منطقة النص
    const SX = 755;                          // بداية بطاقات الإحصاء
    const SW = 148, SH = 63;               // أبعاد كل بطاقة

    // ── ثوابت النص (Y محاور ثابتة ومحسوبة بعناية) ────────────────────────────
    const Y_NAME     = 68;   // اسم المستخدم
    const Y_BADGE    = 92;   // أعلى badge الرتبة
    const BADGE_H    = 26;
    const Y_PROG_LBL = 148;  // نص PROGRESS
    const Y_BAR      = 163;  // شريط XP (أعلى الشريط)
    const BAR_H      = 13;
    const Y_BAR_END  = Y_BAR + BAR_H;

    const tier = getTier(level);
    const { r: gr, g: gg, b: gb } = hexToRgb(tier.glow);
    const targetPct = xpForNext > 0 ? Math.min(currentXP / xpForNext, 1) : 0;

    // ── تحميل الأفاتار ────────────────────────────────────────────────────────
    let avatarImg = null;
    try {
        if (avatarURL) {
            const url = avatarURL + (avatarURL.includes('?') ? '&' : '?') + 'size=256';
            avatarImg = await loadImage(url);
        }
    } catch (e) { console.error('[RANK-CARD] Avatar error:', e.message); }

    // ── إعداد GIF ─────────────────────────────────────────────────────────────
    const canvas  = createCanvas(W, H);
    const ctx     = canvas.getContext('2d');
    const encoder = new GIFEncoder(W, H, 'neuquant', true);
    encoder.start();
    encoder.setRepeat(0);
    encoder.setDelay(55);    // ~18fps — سلاسة + حجم أصغر
    encoder.setQuality(12);  // جودة أعلى من 15

    const FRAMES = 20; // أقل من 24 — أخف وأسرع

    for (let f = 0; f < FRAMES; f++) {
        const loop  = f / FRAMES;
        const pulse = Math.sin(loop * Math.PI * 2) * 0.22 + 0.78;

        ctx.clearRect(0, 0, W, H);

        // ── خلفية متدرجة ─────────────────────────────────────────────────────
        const bg = ctx.createLinearGradient(0, 0, W, H);
        bg.addColorStop(0,   tier.bg1);
        bg.addColorStop(0.5, tier.bg2);
        bg.addColorStop(1,   tier.bg3);
        ctx.fillStyle = bg;
        roundRect(ctx, 0, 0, W, H, 20);
        ctx.fill();

        // ── توهج جانبي ───────────────────────────────────────────────────────
        const glow = ctx.createRadialGradient(W * 0.85, H * 0.5, 0, W * 0.85, H * 0.5, H * 0.75);
        glow.addColorStop(0, `rgba(${gr},${gg},${gb},${0.16 * pulse})`);
        glow.addColorStop(1, `rgba(${gr},${gg},${gb},0)`);
        ctx.fillStyle = glow;
        roundRect(ctx, 0, 0, W, H, 20);
        ctx.fill();

        drawStars(ctx, W, loop);
        drawDotGrid(ctx, W, H, loop);

        // ── حدود البطاقة ─────────────────────────────────────────────────────
        ctx.strokeStyle = `rgba(${gr},${gg},${gb},0.4)`;
        ctx.lineWidth   = 1.5;
        roundRect(ctx, 1, 1, W - 2, H - 2, 20);
        ctx.stroke();

        // ══════════════════════════════════════════════════════════════════════
        // الأفاتار
        // ══════════════════════════════════════════════════════════════════════
        // إطار متوهج
        ctx.save();
        ctx.shadowColor = tier.glow;
        ctx.shadowBlur  = 22 * pulse;
        ctx.strokeStyle = `rgba(${gr},${gg},${gb},${0.85 * pulse})`;
        ctx.lineWidth   = 3;
        roundRect(ctx, AX - AR - 5, AY - AR - 5, (AR + 5) * 2, (AR + 5) * 2, 24);
        ctx.stroke();
        ctx.restore();

        // صورة الأفاتار
        ctx.save();
        roundRect(ctx, AX - AR, AY - AR, AR * 2, AR * 2, 20);
        ctx.clip();
        if (avatarImg) {
            ctx.drawImage(avatarImg, AX - AR, AY - AR, AR * 2, AR * 2);
        } else {
            ctx.fillStyle = '#1a2a3a';
            ctx.fillRect(AX - AR, AY - AR, AR * 2, AR * 2);
        }
        ctx.restore();

        // ══════════════════════════════════════════════════════════════════════
        // الاسم — صف 1
        // ══════════════════════════════════════════════════════════════════════
        ctx.save();
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'middle';  // ← وسط العنصر
        ctx.fillStyle    = '#ffffff';
        ctx.shadowColor  = tier.glow;
        ctx.shadowBlur   = 10 * pulse;
        // fillTextFit يقلص الخط لو الاسم طويل
        fillTextFit(ctx, displayName || username || 'Unknown', TX, Y_NAME, TW - 10, 'bold 34px Bricolage, Arial, sans-serif');
        ctx.restore();

        // ══════════════════════════════════════════════════════════════════════
        // Badge الرتبة — صف 2
        // ══════════════════════════════════════════════════════════════════════
        ctx.save();
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'alphabetic';  // ← نص عادي
        ctx.font         = 'bold 12px GeistMono, monospace';

        const badgeText = `${tier.label}  ·  LVL.${level}`;
        const badgeW    = Math.min(ctx.measureText(badgeText).width + 24, TW - 10);

        // خلفية الـ badge
        ctx.fillStyle = `rgba(${gr},${gg},${gb},0.18)`;
        roundRect(ctx, TX, Y_BADGE, badgeW, BADGE_H, 13);
        ctx.fill();

        // حدود الـ badge
        ctx.strokeStyle = `rgba(${gr},${gg},${gb},0.5)`;
        ctx.lineWidth   = 1;
        roundRect(ctx, TX, Y_BADGE, badgeW, BADGE_H, 13);
        ctx.stroke();

        // نص الـ badge — منتصف عمودياً
        ctx.fillStyle   = tier.glow;
        ctx.shadowColor = tier.glow;
        ctx.shadowBlur  = 6 * pulse;
        ctx.fillText(badgeText, TX + 12, Y_BADGE + BADGE_H - 8);
        ctx.restore();

        // ══════════════════════════════════════════════════════════════════════
        // شريط التقدم — صف 3
        // ══════════════════════════════════════════════════════════════════════
        ctx.save();
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.font         = '10px GeistMono, monospace';
        ctx.fillStyle    = 'rgba(255,255,255,0.45)';
        ctx.fillText('PROGRESS', TX, Y_PROG_LBL);

        // أرقام XP — يمين — مختصرة لتجنب الفيضان
        const xpStr = `${fmtNum(currentXP)} / ${fmtNum(xpForNext)} XP`;
        ctx.textAlign = 'right';
        ctx.fillText(xpStr, TX + TW, Y_PROG_LBL);
        ctx.restore();

        // خلفية الشريط
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        roundRect(ctx, TX, Y_BAR, TW, BAR_H, 6);
        ctx.fill();

        // تعبئة الشريط
        if (targetPct > 0) {
            const fillW = Math.max(BAR_H, TW * targetPct);
            const barG  = ctx.createLinearGradient(TX, 0, TX + fillW, 0);
            barG.addColorStop(0, `rgba(${gr},${gg},${gb},0.75)`);
            barG.addColorStop(1, tier.barEnd);
            ctx.fillStyle   = barG;
            ctx.shadowColor = tier.glow;
            ctx.shadowBlur  = 8 * pulse;
            roundRect(ctx, TX, Y_BAR, fillW, BAR_H, 6);
            ctx.fill();

            // نقطة نهاية الشريط (توهج إضافي)
            if (targetPct < 0.99) {
                ctx.fillStyle   = '#ffffff';
                ctx.shadowColor = tier.glow;
                ctx.shadowBlur  = 14 * pulse;
                ctx.beginPath();
                ctx.arc(TX + fillW, Y_BAR + BAR_H / 2, 4, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();

        // نسبة % أسفل يمين الشريط
        ctx.save();
        ctx.textAlign    = 'right';
        ctx.textBaseline = 'alphabetic';
        ctx.font         = '9px GeistMono, monospace';
        ctx.fillStyle    = `rgba(${gr},${gg},${gb},0.7)`;
        ctx.fillText(`${Math.round(targetPct * 100)}%`, TX + TW, Y_BAR_END + 13);
        ctx.restore();

        // ══════════════════════════════════════════════════════════════════════
        // بطاقات الإحصاء (يمين)
        // ══════════════════════════════════════════════════════════════════════
        const stats = [
            { label: 'RANK',  value: rank ? `#${rank}` : '—' },
            { label: 'LEVEL', value: String(level)           },
            { label: 'VOICE', value: `${voiceMinutes}m`      },
        ];

        stats.forEach((s, i) => {
            const sy = 22 + i * (SH + 6);

            // خلفية البطاقة
            ctx.save();
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            roundRect(ctx, SX, sy, SW, SH, 10);
            ctx.fill();

            // شريط جانبي ملون
            ctx.fillStyle   = tier.glow;
            ctx.shadowColor = tier.glow;
            ctx.shadowBlur  = 7 * pulse;
            roundRect(ctx, SX, sy, 4, SH, 10);
            ctx.fill();
            ctx.restore();

            // Label
            ctx.save();
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.font         = '9px GeistMono, monospace';
            ctx.fillStyle    = 'rgba(255,255,255,0.45)';
            ctx.fillText(s.label, SX + SW / 2, sy + 18);

            // Value — يقلص تلقائياً لو الرقم كبير
            ctx.fillStyle   = tier.glow;
            ctx.shadowColor = tier.glow;
            ctx.shadowBlur  = 6 * pulse;
            fillTextFit(ctx, s.value, SX + SW / 2, sy + SH - 10, SW - 16, 'bold 26px Bricolage, Arial, sans-serif');
            ctx.restore();
        });

        encoder.addFrame(ctx.getImageData(0, 0, W, H).data);
    }

    encoder.finish();
    return encoder.out.getData();
}

module.exports = { generateRankCard, getTier, RANK_TIERS };