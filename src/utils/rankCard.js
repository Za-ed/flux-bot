// ─── utils/rankCard.js ────────────────────────────────────────────────────────
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const fs   = require('fs');

// ─── تسجيل الخطوط ────────────────────────────────────────────────────────────
const FONTS_DIR = path.join(__dirname, '..', 'assets', 'fonts');
try {
  const bold = path.join(FONTS_DIR, 'BricolageGrotesque-Bold.ttf');
  const mono = path.join(FONTS_DIR, 'GeistMono-Bold.ttf');
  if (fs.existsSync(bold)) GlobalFonts.registerFromPath(bold, 'Bricolage');
  if (fs.existsSync(mono)) GlobalFonts.registerFromPath(mono, 'GeistMono');
} catch {}

// ─── الرتب العربية ────────────────────────────────────────────────────────────
const RANK_TIERS = [
  { min: 100, name: 'PRESTIGE', label: 'PRESTIGE',  glow: '#a78bfa', barEnd: '#c4b5fd', bg1: '#0d0020', bg2: '#1a0040', bg3: '#2d0080' },
  { min: 60,  name: 'أسطورة',  label: 'Legend',    glow: '#fbbf24', barEnd: '#fde68a', bg1: '#1a0e00', bg2: '#3d2000', bg3: '#6b3500' },
  { min: 40,  name: 'خبير',    label: 'Expert',    glow: '#22d3ee', barEnd: '#a5f3fc', bg1: '#001e2b', bg2: '#003d5b', bg3: '#005f8a' },
  { min: 20,  name: 'محترف',   label: 'Pro',       glow: '#fb923c', barEnd: '#fed7aa', bg1: '#2d1b00', bg2: '#4a2500', bg3: '#7c3a00' },
  { min: 10,  name: 'مطور',    label: 'Developer', glow: '#a3e635', barEnd: '#d9f99d', bg1: '#1a1a2e', bg2: '#16213e', bg3: '#0f3460' },
  { min: 0,   name: 'مبتدئ',  label: 'Beginner',  glow: '#86efac', barEnd: '#bbf7d0', bg1: '#0f2027', bg2: '#1a3a2a', bg3: '#0d3320' },
];

function getTier(level) {
  return RANK_TIERS.find((t) => level >= t.min) || RANK_TIERS[RANK_TIERS.length - 1];
}

// ─── أدوات الرسم ─────────────────────────────────────────────────────────────
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

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return { r, g, b };
}

function drawStars(ctx, W, H) {
  const stars = [
    [220,28,1.2,0.5],[380,55,0.8,0.4],[500,20,1.4,0.6],[620,45,0.9,0.3],
    [720,22,1.1,0.5],[800,60,0.7,0.4],[310,80,1.0,0.3],[450,210,0.8,0.35],
    [560,230,1.2,0.4],[680,200,0.9,0.3],[160,200,1.0,0.25],[840,160,1.3,0.45],
    [260,230,0.7,0.3],[340,170,1.1,0.25],[590,85,0.8,0.35],[740,140,1.0,0.3],
  ];
  ctx.save();
  for (const [x, y, r, a] of stars) {
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ─── البناء الرئيسي ──────────────────────────────────────────────────────────
async function generateRankCard({
  username, displayName, avatarURL,
  level, currentXP, xpForNext,
  rank, voiceMinutes = 0,
}) {
  const W = 900, H = 260;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  const tier = getTier(level);
  const pct  = xpForNext > 0 ? Math.min(currentXP / xpForNext, 1) : 0;
  const { r: gr, g: gg, b: gb } = hexToRgb(tier.glow);

  // ── خلفية ─────────────────────────────────────────────────────────────
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0,   tier.bg1);
  bgGrad.addColorStop(0.5, tier.bg2);
  bgGrad.addColorStop(1,   tier.bg3);
  ctx.fillStyle = bgGrad;
  roundRect(ctx, 0, 0, W, H, 20);
  ctx.fill();

  // ── توهج يمين ─────────────────────────────────────────────────────────
  const glowR = ctx.createRadialGradient(W*0.88, H*0.5, 0, W*0.88, H*0.5, H*0.8);
  glowR.addColorStop(0, `rgba(${gr},${gg},${gb},0.12)`);
  glowR.addColorStop(1, `rgba(${gr},${gg},${gb},0)`);
  ctx.fillStyle = glowR;
  roundRect(ctx, 0, 0, W, H, 20);
  ctx.fill();

  // ── نجوم ──────────────────────────────────────────────────────────────
  drawStars(ctx, W, H);

  // ── حد خارجي ─────────────────────────────────────────────────────────
  ctx.strokeStyle = `rgba(${gr},${gg},${gb},0.35)`;
  ctx.lineWidth   = 1.5;
  roundRect(ctx, 1, 1, W-2, H-2, 20);
  ctx.stroke();

  // ── خط فاصل عمودي ────────────────────────────────────────────────────
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(755, 30);
  ctx.lineTo(755, 230);
  ctx.stroke();

  // ── الأفاتار ──────────────────────────────────────────────────────────
  const AX = 138, AY = 130, AR = 66;

  // إطار توهج
  ctx.shadowColor = tier.glow;
  ctx.shadowBlur  = 18;
  ctx.strokeStyle = `rgba(${gr},${gg},${gb},0.7)`;
  ctx.lineWidth   = 2.5;
  ctx.beginPath();
  ctx.arc(AX, AY, AR + 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = `rgba(${gr},${gg},${gb},0.25)`;
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.arc(AX, AY, AR + 4, 0, Math.PI * 2);
  ctx.stroke();

  // صورة الأفاتار
  ctx.save();
  ctx.beginPath();
  ctx.arc(AX, AY, AR, 0, Math.PI * 2);
  ctx.clip();
  try {
    const img = await loadImage(avatarURL + '?size=256');
    ctx.drawImage(img, AX - AR, AY - AR, AR * 2, AR * 2);
  } catch {
    ctx.fillStyle = '#1e3a4a';
    ctx.fillRect(AX - AR, AY - AR, AR * 2, AR * 2);
    ctx.fillStyle = tier.glow;
    ctx.font = 'bold 40px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((displayName || username || '?')[0].toUpperCase(), AX, AY);
  }
  ctx.restore();

  // ── اسم المستخدم ──────────────────────────────────────────────────────
  const TX = 240;
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font         = 'bold 30px Bricolage, Arial, sans-serif';
  ctx.fillStyle    = '#ffffff';
  ctx.shadowColor  = `rgba(${gr},${gg},${gb},0.5)`;
  ctx.shadowBlur   = 10;
  ctx.fillText(displayName || username, TX, 88);
  ctx.shadowBlur = 0;

  // ── badge الرتبة ──────────────────────────────────────────────────────
  const tierLabel = `${tier.label}  LVL.${level}`;
  ctx.font = 'bold 13px GeistMono, Arial';
  const labelW = ctx.measureText(tierLabel).width + 28;

  // خلفية الـ badge
  const badgeGrad = ctx.createLinearGradient(TX, 0, TX + labelW, 0);
  badgeGrad.addColorStop(0, `rgba(${gr},${gg},${gb},0.25)`);
  badgeGrad.addColorStop(1, `rgba(${gr},${gg},${gb},0.08)`);
  ctx.fillStyle = badgeGrad;
  roundRect(ctx, TX, 100, labelW, 26, 13);
  ctx.fill();

  ctx.strokeStyle = `rgba(${gr},${gg},${gb},0.4)`;
  ctx.lineWidth   = 1;
  roundRect(ctx, TX, 100, labelW, 26, 13);
  ctx.stroke();

  ctx.fillStyle = tier.glow;
  ctx.fillText(tierLabel, TX + 14, 118);

  // ── PROGRESS label ─────────────────────────────────────────────────────
  ctx.font      = '11px GeistMono, monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillText('PROGRESS', TX, 148);

  // XP Right aligned
  const xpText = `${currentXP.toLocaleString()} / ${xpForNext.toLocaleString()} XP  •  ${Math.round(pct * 100)}%`;
  ctx.textAlign = 'right';
  ctx.fillText(xpText, TX + 480, 148);
  ctx.textAlign = 'left';

  // ── شريط XP ───────────────────────────────────────────────────────────
  const BX = TX, BY = 156, BW = 480, BH = 12;

  // خلفية
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  roundRect(ctx, BX, BY, BW, BH, 6);
  ctx.fill();

  // شريط التقدم
  if (pct > 0.01) {
    const fillW   = Math.max(BH, BW * pct); // min width = radius
    const barGrad = ctx.createLinearGradient(BX, 0, BX + fillW, 0);
    barGrad.addColorStop(0, `rgba(${gr},${gg},${gb},0.7)`);
    barGrad.addColorStop(1, tier.barEnd);
    ctx.fillStyle   = barGrad;
    ctx.shadowColor = tier.glow;
    ctx.shadowBlur  = 6;
    roundRect(ctx, BX, BY, fillW, BH, 6);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // ── الإحصاءات الثلاث (يمين) ───────────────────────────────────────────
  const stats = [
    { label: 'RANK',  value: rank ? `#${rank}` : '#?' },
    { label: 'LEVEL', value: `${level}` },
    { label: 'VOICE', value: `${voiceMinutes}m` },
  ];

  const SX = 768, cardW = 112, cardH = 62, cardGap = 9;
  stats.forEach((s, i) => {
    const sy = 28 + i * (cardH + cardGap);

    // خلفية الكارد
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    roundRect(ctx, SX, sy, cardW, cardH, 10);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth   = 0.5;
    roundRect(ctx, SX, sy, cardW, cardH, 10);
    ctx.stroke();

    // label
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font         = '10px GeistMono, monospace';
    ctx.fillStyle    = 'rgba(255,255,255,0.4)';
    ctx.fillText(s.label, SX + cardW / 2, sy + 20);

    // value
    ctx.font        = 'bold 22px Bricolage, Arial';
    ctx.fillStyle   = tier.glow;
    ctx.shadowColor = tier.glow;
    ctx.shadowBlur  = 6;
    ctx.fillText(s.value, SX + cardW / 2, sy + 48);
    ctx.shadowBlur = 0;
  });

  // ── Branding ──────────────────────────────────────────────────────────
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font         = '10px GeistMono, monospace';
  ctx.fillStyle    = 'rgba(255,255,255,0.18)';
  ctx.fillText('FLUX  •  IO', W / 2, H - 10);

  ctx.textAlign    = 'left';
  ctx.textBaseline = 'alphabetic';

  return canvas.toBuffer('image/png');
}

module.exports = { generateRankCard, getTier, RANK_TIERS };