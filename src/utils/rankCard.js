// ─── utils/rankCard.js ──────────────────────────────────────────────────────
const { createCanvas, loadImage, registerFont } = require('canvas');
const GIFEncoder = require('gifencoder');
const path = require('path');

// تسجيل الخطوط (تأكد من وجود هذه الملفات في المجلد الصحيح)
try {
  registerFont(path.join(__dirname, '../fonts/Bricolage.ttf'), { family: 'Bricolage' });
  registerFont(path.join(__dirname, '../fonts/GeistMono.ttf'), { family: 'GeistMono' });
} catch (e) {
  console.error('[RANK CARD] ❌ فشل في تحميل الخطوط. تأكد من وجود مجلد fonts والملفات بداخله.', e.message);
}

// ── إعدادات الـ Tiers والألوان ───────────────────────────────────────────────
const TIERS = {
  PRESTIGE: { minLvl: 300, label: 'PRESTIGE', bg1: '#1a102e', bg2: '#2d1b4a', bg3: '#1a102e', glow: '#bf94ff', barEnd: '#d8b4fe' },
  LEGENDARY: { minLvl: 100, label: 'LEGENDARY', bg1: '#2e1c10', bg2: '#4e311b', bg3: '#2e1c10', glow: '#ffb347', barEnd: '#ffcc80' },
  EPIC:    { minLvl: 50,  label: 'EPIC',    bg1: '#10202e', bg2: '#1b364e', bg3: '#10202e', glow: '#47b3ff', barEnd: '#80ccff' },
  COMMON:  { minLvl: 0,   label: 'COMMON',  bg1: '#102e1a', bg2: '#1b4e2d', bg3: '#102e1a', glow: '#47ff78', barEnd: '#80ff9f' }
};

const getTier = (level) => Object.values(TIERS).find(t => level >= t.minLvl) || TIERS.COMMON;
const hexToRgb = (hex) => {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
};

// ── دوال مساعدة للرسم ──────────────────────────────────────────────────────
const roundRect = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
};

const drawAnimatedStars = (ctx, w, h, p) => {
  ctx.fillStyle = `rgba(255, 255, 255, ${0.1 + Math.sin(p * Math.PI * 2) * 0.05})`;
  for (let i = 0; i < 25; i++) {
    const x = (p * 50 + i * 41) % w, y = (p * 30 + i * 23) % h, r = 0.5 + Math.random() * 1.2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
};

const drawAnimatedDotGrid = (ctx, w, h, p) => {
  ctx.fillStyle = `rgba(255, 255, 255, ${0.03 + Math.sin(p * Math.PI * 2) * 0.02})`;
  const gap = 20, offset = (p * gap) % gap;
  for (let x = offset; x < w; x += gap) {
    for (let y = offset; y < h; y += gap) {
      if (Math.random() < 0.3) { ctx.beginPath(); ctx.arc(x, y, 0.7, 0, Math.PI * 2); ctx.fill(); }
    }
  }
};

// ─── البناء الرئيسي للـ GIF ──────────────────────────────────────────────────
async function generateRankCard({
  username, displayName, avatarURL,
  level, currentXP, xpForNext,
  rank, voiceMinutes = 0,
}) {
  const W = 900, H = 260;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  const encoder = new GIFEncoder(W, H, 'neuquant', true);
  encoder.start();
  encoder.setRepeat(0);   
  encoder.setDelay(50);   
  encoder.setQuality(15); 

  const tier = getTier(level);
  // ✅ تثبيت النسبة النهائية مباشرة لمنع اللوب في الشريط
  const targetPct = xpForNext > 0 ? Math.min(currentXP / xpForNext, 1) : 0;
  const { r: gr, g: gg, b: gb } = hexToRgb(tier.glow);

  let avatarImg = null;
  try {
    if (avatarURL) {
      avatarImg = await loadImage(avatarURL + (avatarURL.includes('?') ? '&' : '?') + 'size=256');
    }
  } catch (err) { console.error("Avatar failed", err); }

  const totalFrames = 24; 

  for (let f = 0; f < totalFrames; f++) {
    const progressLoop = f / totalFrames; 
    // تم إلغاء الـ xpAnimationProgress لجعل الشريط ثابتاً عند قيمة العضو
    const currentAnimatedPct = targetPct; 
    const pulse = Math.sin(progressLoop * Math.PI * 2) * 0.25 + 0.75; 

    ctx.clearRect(0, 0, W, H);

    // ── الخلفية والنجوم ──
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0,   tier.bg1);
    bgGrad.addColorStop(0.5, tier.bg2);
    bgGrad.addColorStop(1,   tier.bg3);
    ctx.fillStyle = bgGrad;
    roundRect(ctx, 0, 0, W, H, 20);
    ctx.fill();

    drawAnimatedStars(ctx, W, H, progressLoop);
    drawAnimatedDotGrid(ctx, W, H, progressLoop);

    // ── الحدود ──
    ctx.strokeStyle = `rgba(${gr},${gg},${gb},0.45)`;
    ctx.lineWidth   = 2;
    roundRect(ctx, 1, 1, W-2, H-2, 20);
    ctx.stroke();

    // ── الأفاتار (إطار وتوهج) ──
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
    if (avatarImg) ctx.drawImage(avatarImg, AX - AR, AY - AR, AR * 2, AR * 2);
    ctx.restore();

    // ── النصوص الأساسية (ضبط دقيق للأماكن) ──
    const TX = 285;
    
    // 1. اسم المستخدم
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 46px Bricolage, Arial, sans-serif'; // تكبير الخط قليلاً
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = tier.glow;
    ctx.shadowBlur = 12 * pulse;
    ctx.fillText(displayName || username || 'Unknown', TX, 70); // رفع الاسم قليلاً للأعلى
    ctx.restore();

    // 2. الرتبة والمستوى (دمج وتعديل التنسيق)
    const tierLabel = `${tier.label} • مستوى ${level}`; // جعلها كسطر واحد احترافي
    ctx.font = 'bold 15px GeistMono, Arial'; // تصغير الخط قليلاً ليكون متناسقاً
    const labelW = ctx.measureText(tierLabel).width + 30;
    ctx.fillStyle = `rgba(${gr},${gg},${gb},0.25)`;
    roundRect(ctx, TX, 100, labelW, 28, 14); // رفع الصندوق قليلاً للأعلى
    ctx.fill();
    ctx.fillStyle = tier.glow;
    ctx.fillText(tierLabel, TX + 15, 115); // ضبط مكان النص داخل الصندوق

    // 3. نصوص شريط التقدم (رفعها للأعلى)
    ctx.font = 'bold 12px GeistMono, monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('PROGRESS', TX, 150); // رفع الكلمة للأعلى

    const xpText = `${currentXP.toLocaleString()} / ${xpForNext.toLocaleString()} XP`;
    ctx.textAlign = 'right';
    ctx.fillText(xpText, TX + 450, 150); // رفع الأرقام للأعلى ومحاذاتها مع الشريط

    // 4. رسم شريط التقدم (تعديل الأبعاد والمكان)
    const BX = TX, BY = 170, BW = 450, BH = BH = 14; // رفع الشريط وتكبيره قليلاً
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    roundRect(ctx, BX, BY, BW, BH, 7);
    ctx.fill();

    if (currentAnimatedPct > 0) {
      const fillW = Math.max(BH, BW * currentAnimatedPct);
      const barGrad = ctx.createLinearGradient(BX, 0, BX + fillW, 0);
      barGrad.addColorStop(0, `rgba(${gr},${gg},${gb},0.9)`);
      barGrad.addColorStop(1, tier.barEnd);
      ctx.save();
      ctx.fillStyle = barGrad;
      ctx.shadowColor = tier.glow;
      ctx.shadowBlur = 15 * pulse;
      roundRect(ctx, BX, BY, fillW, BH, 7);
      ctx.fill();
      ctx.restore();
    }

    // ── صناديق الإحصاءات (RANK, LEVEL, VOICE) ──
    const stats = [
      { label: 'RANK',  value: rank ? `#${rank}` : '#?' },
      { label: 'LEVEL', value: `${level}` },
      { label: 'VOICE', value: `${voiceMinutes}m` },
    ];
    const SX = 768, cardW = 112, cardH = 62;
    stats.forEach((s, i) => {
      const sy = 28 + i * 71; // إبقاء المسافة بين الصناديق كما هي
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      roundRect(ctx, SX, sy, cardW, cardH, 10);
      ctx.fill();
      ctx.save();
      ctx.fillStyle = tier.glow;
      ctx.shadowBlur = 10 * pulse;
      roundRect(ctx, SX, sy, 4, cardH, 10);
      ctx.fill();
      ctx.restore();
      ctx.textAlign = 'center';
      ctx.font = 'bold 10px GeistMono';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText(s.label, SX + cardW/2, sy + 22);
      ctx.font = 'bold 24px Bricolage';
      ctx.fillStyle = tier.glow;
      ctx.fillText(s.value, SX + cardW/2, sy + 48);
    });

    encoder.addFrame(ctx.getImageData(0, 0, W, H).data);
  }

  encoder.finish();
  return encoder.out.getData();
}

// ── التصدير ───────────────────────────────────────────────────────────────
module.exports = { generateRankCard, xpForLevel };