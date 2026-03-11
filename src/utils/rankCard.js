// ─── rankCard.js ──────────────────────────────────────────────────────────────
// يولّد صورة بطاقة الرتبة باستخدام @napi-rs/canvas
// تثبيت: npm install @napi-rs/canvas

const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const fs   = require('fs');

// ─── تسجيل الخطوط ─────────────────────────────────────────────────────────────
// ضع مجلد canvas-fonts داخل src/assets/fonts/
const FONTS_DIR = path.join(__dirname, '..', 'assets', 'fonts');

function registerFonts() {
  try {
    if (fs.existsSync(path.join(FONTS_DIR, 'BricolageGrotesque-Bold.ttf'))) {
      GlobalFonts.registerFromPath(path.join(FONTS_DIR, 'BricolageGrotesque-Bold.ttf'),    'BricolageBold');
      GlobalFonts.registerFromPath(path.join(FONTS_DIR, 'BricolageGrotesque-Regular.ttf'), 'BricolageReg');
      GlobalFonts.registerFromPath(path.join(FONTS_DIR, 'GeistMono-Bold.ttf'),             'GeistBold');
      GlobalFonts.registerFromPath(path.join(FONTS_DIR, 'GeistMono-Regular.ttf'),          'GeistReg');
    }
  } catch (err) {
    console.warn('[RANK-CARD] خطأ في تحميل الخطوط:', err.message);
  }
}
registerFonts();

// ─── ألوان البطاقة ────────────────────────────────────────────────────────────
const THEME = {
  bg:          '#0d1117',   // خلفية داكنة
  card:        '#161b22',   // بطاقة
  accent:      '#1e90ff',   // لون رئيسي FLUX
  accentGlow:  'rgba(30,144,255,0.15)',
  xpBar:       '#1e90ff',
  xpBarBg:     '#30363d',
  text:        '#e6edf3',
  subtext:     '#8b949e',
  gold:        '#f1c40f',
  white:       '#ffffff',
};

// ─── Helper: رسم مستطيل بحواف دائرية ─────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y,     x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h,     x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y,         x + r, y);
  ctx.closePath();
}

// ─── Helper: نص مع القطع إذا طال ──────────────────────────────────────────────
function truncateText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (ctx.measureText(truncated + '…').width > maxWidth && truncated.length > 0) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + '…';
}

// ─── Helper: رسم الأفاتار دائري ───────────────────────────────────────────────
async function drawAvatar(ctx, url, x, y, size) {
  try {
    const img = await loadImage(url);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, x, y, size, size);
    ctx.restore();
  } catch {
    // fallback دائرة
    ctx.save();
    ctx.fillStyle = THEME.accent;
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ─── رسم نقاط الخلفية الزخرفية ───────────────────────────────────────────────
function drawBgPattern(ctx, w, h) {
  ctx.save();
  ctx.globalAlpha = 0.04;
  ctx.fillStyle = THEME.accent;
  for (let i = 0; i < 120; i++) {
    const px = Math.random() * w;
    const py = Math.random() * h;
    const r  = Math.random() * 2 + 0.5;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ─── الدالة الرئيسية ──────────────────────────────────────────────────────────
/**
 * @param {Object} opts
 * @param {string} opts.username
 * @param {string} opts.avatarURL
 * @param {number} opts.level
 * @param {number} opts.currentXp      - XP في المستوى الحالي
 * @param {number} opts.neededXp       - XP المطلوب للمستوى التالي
 * @param {number} opts.totalXp
 * @param {number} opts.rank           - الترتيب في الليدربورد
 * @param {number} opts.voiceMinutes
 * @param {string} opts.badges         - نص الشارات
 * @param {string} opts.accentColor    - hex لون العضو
 * @returns {Buffer} PNG buffer
 */
async function generateRankCard(opts) {
  const {
    username     = 'User',
    avatarURL    = '',
    level        = 0,
    currentXp    = 0,
    neededXp     = 100,
    totalXp      = 0,
    rank         = 0,
    voiceMinutes = 0,
    badges       = '',
    accentColor  = THEME.accent,
  } = opts;

  // ── أبعاد البطاقة ──────────────────────────────────────────────────────────
  const W = 900;
  const H = 280;

  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // ── خلفية ─────────────────────────────────────────────────────────────────
  ctx.fillStyle = THEME.bg;
  ctx.fillRect(0, 0, W, H);

  // نقاط زخرفية
  drawBgPattern(ctx, W, H);

  // ── بطاقة داخلية ──────────────────────────────────────────────────────────
  ctx.fillStyle = THEME.card;
  roundRect(ctx, 16, 16, W - 32, H - 32, 18);
  ctx.fill();

  // إضاءة جانبية يسار
  const glow = ctx.createLinearGradient(0, 0, 200, 0);
  glow.addColorStop(0, accentColor + '22');
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  roundRect(ctx, 16, 16, W - 32, H - 32, 18);
  ctx.fill();

  // خط علوي ملون
  ctx.fillStyle = accentColor;
  roundRect(ctx, 16, 16, W - 32, 4, 2);
  ctx.fill();

  // ── أفاتار ─────────────────────────────────────────────────────────────────
  const AVA_SIZE = 110;
  const AVA_X    = 44;
  const AVA_Y    = 50;

  // حلقة توهج حول الأفاتار
  ctx.save();
  ctx.shadowColor = accentColor;
  ctx.shadowBlur  = 20;
  ctx.strokeStyle = accentColor;
  ctx.lineWidth   = 3;
  ctx.beginPath();
  ctx.arc(AVA_X + AVA_SIZE / 2, AVA_Y + AVA_SIZE / 2, AVA_SIZE / 2 + 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  await drawAvatar(ctx, avatarURL, AVA_X, AVA_Y, AVA_SIZE);

  // ── اسم المستخدم ───────────────────────────────────────────────────────────
  const TEXT_X = AVA_X + AVA_SIZE + 28;

  ctx.font      = 'bold 32px BricolageBold, sans-serif';
  ctx.fillStyle = THEME.white;
  ctx.fillText(truncateText(ctx, username, 340), TEXT_X, 88);

  // ── FLUX • IO label ────────────────────────────────────────────────────────
  ctx.font      = '14px GeistReg, monospace';
  ctx.fillStyle = THEME.subtext;
  ctx.fillText('FLUX • IO', TEXT_X, 112);

  // ── شريط XP ────────────────────────────────────────────────────────────────
  const BAR_X = TEXT_X;
  const BAR_Y = 148;
  const BAR_W = 440;
  const BAR_H = 18;
  const BAR_R = 9;

  // خلفية الشريط
  ctx.fillStyle = THEME.xpBarBg;
  roundRect(ctx, BAR_X, BAR_Y, BAR_W, BAR_H, BAR_R);
  ctx.fill();

  // تقدم الشريط
  const progress = Math.min(currentXp / neededXp, 1);
  const fillW    = Math.max(BAR_R * 2, BAR_W * progress);

  const barGrad = ctx.createLinearGradient(BAR_X, 0, BAR_X + BAR_W, 0);
  barGrad.addColorStop(0,   accentColor);
  barGrad.addColorStop(0.7, accentColor + 'cc');
  barGrad.addColorStop(1,   accentColor + '88');

  ctx.fillStyle = barGrad;
  roundRect(ctx, BAR_X, BAR_Y, fillW, BAR_H, BAR_R);
  ctx.fill();

  // نص XP
  ctx.font      = 'bold 13px GeistBold, monospace';
  ctx.fillStyle = THEME.subtext;
  ctx.textAlign = 'right';
  ctx.fillText(`${currentXp.toLocaleString()} / ${neededXp.toLocaleString()} XP`, BAR_X + BAR_W, BAR_Y - 6);
  ctx.textAlign = 'left';

  // ── الإحصاءات الثلاث (المستوى، الترتيب، الصوت) ────────────────────────────
  const STATS = [
    { label: 'المستوى',  value: `${level}`,          icon: '🏅' },
    { label: 'الترتيب',  value: rank ? `#${rank}` : '—', icon: '🏆' },
    { label: 'الصوت',    value: `${voiceMinutes}د`,   icon: '🎙️' },
  ];

  const STAT_Y  = 195;
  const STAT_W  = 120;

  STATS.forEach((stat, i) => {
    const sx = TEXT_X + i * (STAT_W + 16);

    // خلفية stat
    ctx.fillStyle = THEME.xpBarBg;
    roundRect(ctx, sx, STAT_Y, STAT_W, 52, 10);
    ctx.fill();

    // القيمة
    ctx.font      = 'bold 22px BricolageBold, sans-serif';
    ctx.fillStyle = accentColor;
    ctx.textAlign = 'center';
    ctx.fillText(stat.value, sx + STAT_W / 2, STAT_Y + 28);

    // التسمية
    ctx.font      = '11px GeistReg, monospace';
    ctx.fillStyle = THEME.subtext;
    ctx.fillText(stat.label, sx + STAT_W / 2, STAT_Y + 44);

    ctx.textAlign = 'left';
  });

  // ── إجمالي XP (يمين) ───────────────────────────────────────────────────────
  const RIGHT_X = W - 60;

  // دائرة المستوى الكبيرة
  const LVL_CX = RIGHT_X - 50;
  const LVL_CY = H / 2 - 10;
  const LVL_R  = 55;

  // حلقة خارجية
  ctx.save();
  ctx.strokeStyle = THEME.xpBarBg;
  ctx.lineWidth   = 10;
  ctx.beginPath();
  ctx.arc(LVL_CX, LVL_CY, LVL_R, 0, Math.PI * 2);
  ctx.stroke();

  // قوس التقدم
  const startAngle = -Math.PI / 2;
  const endAngle   = startAngle + progress * Math.PI * 2;

  ctx.strokeStyle = accentColor;
  ctx.lineWidth   = 10;
  ctx.lineCap     = 'round';
  ctx.shadowColor = accentColor;
  ctx.shadowBlur  = 12;
  ctx.beginPath();
  ctx.arc(LVL_CX, LVL_CY, LVL_R, startAngle, endAngle);
  ctx.stroke();
  ctx.restore();

  // رقم المستوى بالمنتصف
  ctx.font      = 'bold 36px BricolageBold, sans-serif';
  ctx.fillStyle = THEME.white;
  ctx.textAlign = 'center';
  ctx.fillText(`${level}`, LVL_CX, LVL_CY + 12);

  ctx.font      = '12px GeistReg, monospace';
  ctx.fillStyle = THEME.subtext;
  ctx.fillText('LVL', LVL_CX, LVL_CY - 20);

  ctx.textAlign = 'left';

  // ── إجمالي XP أسفل الدائرة ────────────────────────────────────────────────
  ctx.font      = '12px GeistReg, monospace';
  ctx.fillStyle = THEME.subtext;
  ctx.textAlign = 'center';
  ctx.fillText(`${totalXp.toLocaleString()} XP`, LVL_CX, LVL_CY + LVL_R + 22);
  ctx.textAlign = 'left';

  // ── شارة أولى (لو موجودة) ─────────────────────────────────────────────────
  if (badges && badges.length > 0) {
    const firstBadge = badges.split('  ')[0] ?? '';
    if (firstBadge) {
      ctx.font      = '13px GeistReg, monospace';
      ctx.fillStyle = THEME.gold;
      ctx.fillText(firstBadge, TEXT_X, H - 36);
    }
  }

  // ── footer line ────────────────────────────────────────────────────────────
  ctx.fillStyle = THEME.xpBarBg;
  ctx.fillRect(16, H - 28, W - 32, 1);

  ctx.font      = '11px GeistReg, monospace';
  ctx.fillStyle = THEME.subtext + '88';
  ctx.textAlign = 'right';
  ctx.fillText('FLUX • IO  |  Ranking System', W - 30, H - 12);
  ctx.textAlign = 'left';

  return canvas.toBuffer('image/png');
}

module.exports = { generateRankCard };