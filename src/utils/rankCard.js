// ─── utils/rankCard.js ────────────────────────────────────────────────────────
// بطاقة رانك متطورة — خلفية تتغير حسب المستوى + رتب عربية

const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const fs   = require('fs');

// ─── تسجيل الخطوط ────────────────────────────────────────────────────────────
const FONTS_DIR = path.join(__dirname, '..', 'assets', 'fonts');
try {
  if (fs.existsSync(path.join(FONTS_DIR, 'BricolageGrotesque-Bold.ttf')))
    GlobalFonts.registerFromPath(path.join(FONTS_DIR, 'BricolageGrotesque-Bold.ttf'), 'Bricolage');
  if (fs.existsSync(path.join(FONTS_DIR, 'GeistMono-Bold.ttf')))
    GlobalFonts.registerFromPath(path.join(FONTS_DIR, 'GeistMono-Bold.ttf'), 'GeistMono');
} catch {}

// ─── نظام الرتب العربي ────────────────────────────────────────────────────────
const RANK_TIERS = [
  { min: 100, name: 'PRESTIGE',  emoji: '🌌', color: '#ffffff', glow: '#a78bfa', bg: 'prestige'  },
  { min: 60,  name: 'أسطورة',   emoji: '👑', color: '#ffd700', glow: '#f59e0b', bg: 'legend'    },
  { min: 40,  name: 'خبير',     emoji: '💎', color: '#67e8f9', glow: '#06b6d4', bg: 'expert'    },
  { min: 20,  name: 'محترف',    emoji: '🔥', color: '#fb923c', glow: '#ea580c', bg: 'pro'       },
  { min: 10,  name: 'مطور',     emoji: '⚡', color: '#a3e635', glow: '#65a30d', bg: 'developer' },
  { min: 0,   name: 'مبتدئ',   emoji: '🌱', color: '#86efac', glow: '#16a34a', bg: 'beginner'  },
];

// ─── ألوان الخلفية حسب الرتبة ────────────────────────────────────────────────
const BG_THEMES = {
  beginner:  { from: '#0f2027', mid: '#203a43',  to: '#2c5364', accent: '#86efac', bar: '#16a34a'  },
  developer: { from: '#1a1a2e', mid: '#16213e',  to: '#0f3460', accent: '#a3e635', bar: '#65a30d'  },
  pro:       { from: '#2d1b00', mid: '#4a2500',  to: '#7c3a00', accent: '#fb923c', bar: '#ea580c'  },
  expert:    { from: '#001e2b', mid: '#003d5b',  to: '#005f8a', accent: '#67e8f9', bar: '#0891b2'  },
  legend:    { from: '#1a0e00', mid: '#3d2000',  to: '#6b3500', accent: '#ffd700', bar: '#d97706'  },
  prestige:  { from: '#0d0020', mid: '#1a0040',  to: '#2d0080', accent: '#a78bfa', bar: '#7c3aed'  },
};

// ─── الحصول على الرتبة ────────────────────────────────────────────────────────
function getTier(level) {
  return RANK_TIERS.find((t) => level >= t.min) || RANK_TIERS[RANK_TIERS.length - 1];
}

// ─── رسم زاوية مستديرة ────────────────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
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

// ─── رسم النجوم في الخلفية ────────────────────────────────────────────────────
function drawStars(ctx, W, H, count = 60) {
  ctx.save();
  for (let i = 0; i < count; i++) {
    const x    = Math.random() * W;
    const y    = Math.random() * H;
    const size = Math.random() * 1.5 + 0.3;
    const op   = Math.random() * 0.6 + 0.2;
    ctx.fillStyle = `rgba(255,255,255,${op})`;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ─── البناء الرئيسي ───────────────────────────────────────────────────────────
async function generateRankCard({
  username, displayName, avatarURL,
  level, currentXP, xpForNext,
  rank, voiceMinutes = 0, badges = [],
}) {
  const W = 900, H = 280;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  const tier  = getTier(level);
  const theme = BG_THEMES[tier.bg];
  const pct   = Math.min(currentXP / xpForNext, 1);

  // ── الخلفية المتدرجة ─────────────────────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0,    theme.from);
  bg.addColorStop(0.5,  theme.mid);
  bg.addColorStop(1,    theme.to);
  ctx.fillStyle = bg;
  roundRect(ctx, 0, 0, W, H, 24);
  ctx.fill();

  // ── نجوم ─────────────────────────────────────────────────────────────────
  drawStars(ctx, W, H, 80);

  // ── توهج جانبي ───────────────────────────────────────────────────────────
  const glowGrad = ctx.createRadialGradient(W * 0.85, H * 0.5, 0, W * 0.85, H * 0.5, H * 0.9);
  glowGrad.addColorStop(0, tier.glow + '40');
  glowGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = glowGrad;
  roundRect(ctx, 0, 0, W, H, 24);
  ctx.fill();

  // ── حد خارجي ─────────────────────────────────────────────────────────────
  ctx.strokeStyle = tier.glow + '80';
  ctx.lineWidth   = 2;
  roundRect(ctx, 1, 1, W - 2, H - 2, 24);
  ctx.stroke();

  // ── الأفاتار ──────────────────────────────────────────────────────────────
  const AX = 50, AY = H / 2, AR = 90;
  try {
    const avatar = await loadImage(avatarURL + '?size=256');

    // إطار الأفاتار بالتوهج
    ctx.save();
    ctx.shadowColor = tier.glow;
    ctx.shadowBlur  = 20;
    ctx.strokeStyle = tier.color;
    ctx.lineWidth   = 3;
    ctx.beginPath();
    ctx.arc(AX, AY, AR / 2 + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // clip الصورة
    ctx.save();
    ctx.beginPath();
    ctx.arc(AX, AY, AR / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatar, AX - AR / 2, AY - AR / 2, AR, AR);
    ctx.restore();
  } catch {
    ctx.fillStyle = tier.color + '40';
    ctx.beginPath();
    ctx.arc(AX, AY, AR / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── اسم اللاعب ────────────────────────────────────────────────────────────
  const TX = AX + AR / 2 + 24;
  ctx.font      = 'bold 26px Bricolage, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = tier.glow;
  ctx.shadowBlur  = 12;
  ctx.fillText(displayName || username, TX, AY - 44);
  ctx.shadowBlur = 0;

  // ── اسم الرتبة ────────────────────────────────────────────────────────────
  const tierLabel = `${tier.emoji} ${tier.name}`;
  ctx.font      = 'bold 16px Bricolage, sans-serif';
  ctx.fillStyle = tier.color;
  ctx.fillText(tierLabel, TX, AY - 18);

  // ── المستوى ───────────────────────────────────────────────────────────────
  ctx.font      = '13px GeistMono, monospace';
  ctx.fillStyle = '#ffffff99';
  ctx.fillText(`LVL ${level}`, TX, AY + 4);

  // ── شريط XP ───────────────────────────────────────────────────────────────
  const BX = TX, BY = AY + 20, BW = W - TX - 30, BH = 14;

  // خلفية الشريط
  ctx.fillStyle = '#ffffff15';
  roundRect(ctx, BX, BY, BW, BH, 7);
  ctx.fill();

  // شريط التقدم
  if (pct > 0) {
    const barGrad = ctx.createLinearGradient(BX, 0, BX + BW * pct, 0);
    barGrad.addColorStop(0, theme.bar + 'aa');
    barGrad.addColorStop(1, tier.color);
    ctx.fillStyle = barGrad;
    ctx.shadowColor = tier.glow;
    ctx.shadowBlur  = 8;
    roundRect(ctx, BX, BY, BW * pct, BH, 7);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // نسبة التقدم
  const pctText = `${Math.round(pct * 100)}%`;
  ctx.font      = 'bold 11px GeistMono, monospace';
  ctx.fillStyle = '#ffffffcc';
  ctx.fillText(pctText, BX + BW * pct - 20, BY - 4);

  // XP النص
  ctx.font      = '11px GeistMono, monospace';
  ctx.fillStyle = '#ffffff66';
  ctx.fillText(`${currentXP.toLocaleString()} / ${xpForNext.toLocaleString()} XP`, BX, BY + BH + 14);

  // ── الإحصاءات (يمين) ────────────────────────────────────────────────────
  const SX = W - 140, SY = 40;
  const stats = [
    { label: 'RANK',  value: `#${rank}` },
    { label: 'LEVEL', value: `${level}` },
    { label: 'VOICE', value: `${voiceMinutes}m` },
  ];

  stats.forEach((s, i) => {
    const y = SY + i * 62;

    // كارد صغير
    ctx.fillStyle = '#ffffff0d';
    roundRect(ctx, SX, y, 110, 50, 10);
    ctx.fill();

    ctx.strokeStyle = tier.glow + '40';
    ctx.lineWidth   = 1;
    roundRect(ctx, SX, y, 110, 50, 10);
    ctx.stroke();

    ctx.font      = '10px GeistMono, monospace';
    ctx.fillStyle = '#ffffff55';
    ctx.fillText(s.label, SX + 10, y + 18);

    ctx.font      = 'bold 20px Bricolage, sans-serif';
    ctx.fillStyle = tier.color;
    ctx.shadowColor = tier.glow;
    ctx.shadowBlur  = 6;
    ctx.fillText(s.value, SX + 10, y + 40);
    ctx.shadowBlur = 0;
  });

  // ── الشارات ───────────────────────────────────────────────────────────────
  if (badges.length > 0) {
    const badgeY = H - 30;
    ctx.font      = '18px sans-serif';
    ctx.fillStyle = '#ffffffcc';
    badges.slice(0, 8).forEach((b, i) => {
      ctx.fillText(b, TX + i * 28, badgeY);
    });
  }

  return canvas.toBuffer('image/png');
}

module.exports = { generateRankCard, getTier, RANK_TIERS };