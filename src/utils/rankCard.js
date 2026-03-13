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
} catch (error) {
  console.error('⚠️ تحذير: فشل تحميل خطوط بطاقة الرتبة:', error.message);
}

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
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return { r, g, b };
}

const STARS_DATA = [
  [150,40,1.2,0.5, 2], [380,55,0.8,0.4, 3], [500,20,1.4,0.6, 1], [620,45,0.9,0.3, 4],
  [720,22,1.1,0.5, 2], [850,160,1.3,0.45, 2], [310,80,1.0,0.3, 3], [450,210,0.8,0.35, 2],
];

function drawAnimatedStars(ctx, W, H, progressLoop) {
  ctx.save();
  for (let i = 0; i < STARS_DATA.length; i++) {
    const [baseX, y, r, baseA, speed] = STARS_DATA[i];
    let x = baseX - (progressLoop * 150) % W; // حركة أسرع للنجوم
    if (x < 0) x += W;
    const a = baseA + Math.sin(progressLoop * Math.PI * 2 * speed) * 0.4;
    ctx.fillStyle = `rgba(255,255,255,${Math.max(0.1, Math.min(1, a))})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawAnimatedDotGrid(ctx, W, H, progressLoop) {
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
  const offsetX = (progressLoop * 100) % 25; 
  for (let x = -25; x < W + 25; x += 25) {
    for (let y = 20; y < H; y += 25) {
      ctx.beginPath();
      ctx.arc(x - offsetX, y, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// ─── البناء الرئيسي للـ GIF ────────────────────────────────────────────────
async function generateRankCard({
  username, displayName, avatarURL,
  level, currentXP, xpForNext,
  rank, voiceMinutes = 0,
}) {
  const W = 900, H = 260;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // إعداد المولد - الحل الجذري: ضبط الـ Optimizer والـ Delay
  const encoder = new GIFEncoder(W, H, 'neuquant', true); // استخدام NeuQuant لجودة أفضل
  encoder.start();
  encoder.setRepeat(0);   
  encoder.setDelay(50);   // سرعة 20 إطار في الثانية
  encoder.setQuality(15); // موازنة بين الحجم والجودة لضمان الـ Autoplay

  const tier = getTier(level);
  const targetPct = xpForNext > 0 ? Math.min(currentXP / xpForNext, 1) : 0;
  const { r: gr, g: gg, b: gb } = hexToRgb(tier.glow);

  let avatarImg = null;
  try {
    if (avatarURL) {
      avatarImg = await loadImage(avatarURL + (avatarURL.includes('?') ? '&' : '?') + 'size=256');
    }
  } catch (err) { console.error("Avatar failed", err); }

  const totalFrames = 24; // فريمات كافية لحركة سلسة وملف خفيف

  for (let f = 0; f < totalFrames; f++) {
    const progressLoop = f / totalFrames; 
    const xpAnimationProgress = Math.min(1, f / 12);
    const currentAnimatedPct = xpAnimationProgress * targetPct;
    const pulse = Math.sin(progressLoop * Math.PI * 2) * 0.25 + 0.75; 

    ctx.clearRect(0, 0, W, H);

    // ── الخلفية ──
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0,   tier.bg1);
    bgGrad.addColorStop(0.5, tier.bg2);
    bgGrad.addColorStop(1,   tier.bg3);
    ctx.fillStyle = bgGrad;
    roundRect(ctx, 0, 0, W, H, 20);
    ctx.fill();

    // ── توهج ينبض ──
    const glowR = ctx.createRadialGradient(W*0.88, H*0.5, 0, W*0.88, H*0.5, H*0.8);
    glowR.addColorStop(0, `rgba(${gr},${gg},${gb},${0.18 * pulse})`);
    glowR.addColorStop(1, `rgba(${gr},${gg},${gb},0)`);
    ctx.fillStyle = glowR;
    roundRect(ctx, 0, 0, W, H, 20);
    ctx.fill();

    drawAnimatedStars(ctx, W, H, progressLoop);
    drawAnimatedDotGrid(ctx, W, H, progressLoop);

    // ── الحدود ──
    ctx.strokeStyle = `rgba(${gr},${gg},${gb},0.45)`;
    ctx.lineWidth   = 2;
    roundRect(ctx, 1, 1, W-2, H-2, 20);
    ctx.stroke();

    // ── الأفاتار ──
    const AX = 138, AY = 130, AR = 66, avatarRadius = 22;

    ctx.save();
    ctx.shadowColor = tier.glow;
    ctx.shadowBlur  = 25 * pulse;
    ctx.strokeStyle = `rgba(${gr},${gg},${gb},${0.9 * pulse})`;
    ctx.lineWidth   = 3;
    roundRect(ctx, AX - AR - 6, AY - AR - 6, (AR + 6) * 2, (AR + 6) * 2, avatarRadius + 4);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    roundRect(ctx, AX - AR, AY - AR, AR * 2, AR * 2, avatarRadius);
    ctx.clip();
    if (avatarImg) {
      ctx.drawImage(avatarImg, AX - AR, AY - AR, AR * 2, AR * 2);
    } else {
      ctx.fillStyle = '#1e3a4a';
      ctx.fillRect(AX - AR, AY - AR, AR * 2, AR * 2);
    }
    ctx.restore();

    // ── اسم المستخدم ──
    const TX = 285;
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 36px Bricolage, Arial, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = tier.glow;
    ctx.shadowBlur = 12 * pulse;
    ctx.fillText(displayName || username || 'Unknown', TX, 70);
    ctx.restore();

    // ── الرتبة ──
    const tierLabel = `${tier.label}  LVL.${level}`;
    ctx.font = 'bold 13px GeistMono, Arial';
    const labelW = ctx.measureText(tierLabel).width + 28;
    ctx.fillStyle = `rgba(${gr},${gg},${gb},0.25)`;
    roundRect(ctx, TX, 95, labelW, 26, 13);
    ctx.fill();
    ctx.fillStyle = tier.glow;
    ctx.fillText(tierLabel, TX + 14, 109);

    // ── شريط التقدم ──
    ctx.font = '11px GeistMono, monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('PROGRESS', TX, 145);

    const xpText = `${Math.floor(currentAnimatedPct * xpForNext).toLocaleString()} / ${xpForNext.toLocaleString()} XP`;
    ctx.textAlign = 'right';
    ctx.fillText(xpText, TX + 450, 145);

    const BX = TX, BY = 160, BW = 450, BH = 12;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    roundRect(ctx, BX, BY, BW, BH, 6);
    ctx.fill();

    if (currentAnimatedPct > 0) {
      const fillW = Math.max(BH, BW * currentAnimatedPct);
      const barGrad = ctx.createLinearGradient(BX, 0, BX + fillW, 0);
      barGrad.addColorStop(0, `rgba(${gr},${gg},${gb},0.8)`);
      barGrad.addColorStop(1, tier.barEnd);
      ctx.save();
      ctx.fillStyle = barGrad;
      ctx.shadowColor = tier.glow;
      ctx.shadowBlur = 10 * pulse;
      roundRect(ctx, BX, BY, fillW, BH, 6);
      ctx.fill();
      ctx.restore();
    }

    // ── الإحصاءات ──
    const stats = [
      { label: 'RANK',  value: rank ? `#${rank}` : '#?' },
      { label: 'LEVEL', value: `${level}` },
      { label: 'VOICE', value: `${voiceMinutes}m` },
    ];
    const SX = 768, cardW = 112, cardH = 62;
    stats.forEach((s, i) => {
      const sy = 28 + i * 71;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      roundRect(ctx, SX, sy, cardW, cardH, 8);
      ctx.fill();
      ctx.save();
      ctx.fillStyle = tier.glow;
      ctx.shadowBlur = 8 * pulse;
      roundRect(ctx, SX, sy, 4, cardH, 8);
      ctx.fill();
      ctx.restore();
      ctx.textAlign = 'center';
      ctx.font = '10px GeistMono';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText(s.label, SX + cardW/2, sy + 22);
      ctx.font = 'bold 24px Bricolage';
      ctx.fillStyle = tier.glow;
      ctx.fillText(s.value, SX + cardW/2, sy + 46);
    });

    // الحل الجذري للأداء: استخدام getImageData مباشرة
    encoder.addFrame(ctx.getImageData(0, 0, W, H).data);
  }

  encoder.finish();
  return encoder.out.getData();
}

module.exports = { generateRankCard, getTier, RANK_TIERS };