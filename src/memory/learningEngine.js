// ─── memory/learningEngine.js ──────────────────────────────────────────────────
// محرك التعلم التعزيزي: يتتبع نجاحات وإخفاقات FLUX ويكيّف السلوك
// ══════════════════════════════════════════════════════════════════════════════

// ⚠️  ملاحظة: learning_state.json يُحفظ في flux_data/
// آمن على Render/VPS — يُمسح على Replit عند كل restart
// البوت يبدأ بقيم افتراضية معقولة لو ضاع الملف
const fs   = require('fs');
const path = require('path');

const DATA_DIR     = path.join(__dirname, '..', '..', 'flux_data'); // → flux-bot/flux_data
const LEARNING_FILE = path.join(DATA_DIR, 'learning_state.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ══════════════════════════════════════════════════════════════════════════════
// نموذج بيانات الاستجابة المُتتبَّعة
// ══════════════════════════════════════════════════════════════════════════════
// responseId → {
//   channelId, userId, emotion, dialect, intent,
//   style,          // 'humor' | 'support' | 'curious' | 'neutral'
//   timestamp,
//   engagement: null | 'positive' | 'negative' | 'ignored'
// }

class LearningEngine {
  constructor() {
    this.state = this._load();
    this._pendingResponses = new Map(); // messageId → responseRecord (ننتظر تقييمه)
    this._saveScheduled = false;
  }

  _load() {
    try {
      if (fs.existsSync(LEARNING_FILE)) {
        return JSON.parse(fs.readFileSync(LEARNING_FILE, 'utf8'));
      }
    } catch (e) { /* ignore */ }
    return {
      // احتمالية الرد لكل مزيج مشاعر+لهجة
      replyProbabilities: {},   // `${emotion}_${dialect}` → probability

      // نجاح كل أسلوب استجابة
      styleSuccessRates: {
        humor:   { success: 5, total: 10 },
        support: { success: 7, total: 10 },
        curious: { success: 6, total: 10 },
        neutral: { success: 5, total: 10 }
      },

      // المواضيع التي حققت تفاعلاً
      topicSuccessRates: {},

      // معدل التفاعل الكلي
      overallEngagementRate: 0.5,
      totalTracked: 0,

      // تكيّف الشخصية
      personalityShift: {
        humorBias:     0.0,  // +/- تحيز الفكاهة
        curiosityBias: 0.0,
        supportBias:   0.0,
        directnessBias: 0.0
      }
    };
  }

  _scheduleSave() {
    if (this._saveScheduled) return;
    this._saveScheduled = true;
    setTimeout(() => {
      try {
        fs.writeFileSync(LEARNING_FILE, JSON.stringify(this.state, null, 2));
      } catch (e) { console.error('[FLUX-LEARN] فشل الحفظ:', e.message); }
      this._saveScheduled = false;
    }, 15000);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // تتبع الاستجابة (بعد الإرسال مباشرة)
  // ══════════════════════════════════════════════════════════════════════════
  trackResponse(messageId, { channelId, userId, emotion, dialect, intent, style, topic }) {
    this._pendingResponses.set(messageId, {
      channelId, userId, emotion, dialect: dialect || 'unknown',
      intent: intent || 'neutral', style: style || 'neutral',
      topic:  topic || null,
      timestamp: Date.now(),
      engagement: null
    });

    // تنظيف الردود القديمة (أكثر من 10 دقائق دون تقييم = ignored)
    setTimeout(() => {
      const record = this._pendingResponses.get(messageId);
      if (record && record.engagement === null) {
        record.engagement = 'ignored';
        this._applyLearning(record);
        this._pendingResponses.delete(messageId);
      }
    }, 10 * 60 * 1000);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // تسجيل التفاعل (reaction أو رد خلال دقيقتين)
  // ══════════════════════════════════════════════════════════════════════════
  registerEngagement(messageId, engagementType) {
    const record = this._pendingResponses.get(messageId);
    if (!record || record.engagement !== null) return;
    record.engagement = engagementType; // 'positive' | 'negative' | 'ignored'
    this._applyLearning(record);
    this._pendingResponses.delete(messageId);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // تطبيق التعلم على الحالة الداخلية
  // ══════════════════════════════════════════════════════════════════════════
  _applyLearning(record) {
    const { emotion, dialect, style, topic, engagement } = record;
    const isSuccess  = engagement === 'positive';
    const isIgnored  = engagement === 'ignored';
    const isNegative = engagement === 'negative';

    const learningRate = isIgnored ? 0.3 : 1.0; // التجاهل له تأثير أضعف

    // ── تحديث احتمالية الرد ────────────────────────────────────────────────
    const probKey = `${emotion}_${dialect}`;
    if (!this.state.replyProbabilities[probKey]) {
      this.state.replyProbabilities[probKey] = 0.55;
    }
    if (isSuccess) {
      this.state.replyProbabilities[probKey] = Math.min(0.90,
        this.state.replyProbabilities[probKey] + 0.02 * learningRate
      );
    } else if (isNegative || isIgnored) {
      this.state.replyProbabilities[probKey] = Math.max(0.15,
        this.state.replyProbabilities[probKey] - 0.015 * learningRate
      );
    }

    // ── تحديث نجاح الأسلوب ─────────────────────────────────────────────────
    if (style && this.state.styleSuccessRates[style]) {
      const sr = this.state.styleSuccessRates[style];
      sr.total++;
      if (isSuccess) sr.success++;
      // sliding window: احتفظ بأوزان معقولة
      if (sr.total > 100) {
        sr.total   = Math.round(sr.total * 0.9);
        sr.success = Math.round(sr.success * 0.9);
      }
    }

    // ── تحديث نجاح المواضيع ────────────────────────────────────────────────
    if (topic) {
      if (!this.state.topicSuccessRates[topic]) {
        this.state.topicSuccessRates[topic] = { success: 0, total: 0 };
      }
      const tr = this.state.topicSuccessRates[topic];
      tr.total++;
      if (isSuccess) tr.success++;
    }

    // ── تحديث تحيز الشخصية ────────────────────────────────────────────────
    const shift = this.state.personalityShift;
    if (style === 'humor') {
      shift.humorBias = isSuccess
        ? Math.min(0.3,  shift.humorBias + 0.01)
        : Math.max(-0.3, shift.humorBias - 0.005);
    }
    if (style === 'support') {
      shift.supportBias = isSuccess
        ? Math.min(0.3,  shift.supportBias + 0.01)
        : Math.max(-0.3, shift.supportBias - 0.005);
    }
    if (style === 'curious') {
      shift.curiosityBias = isSuccess
        ? Math.min(0.3,  shift.curiosityBias + 0.01)
        : Math.max(-0.3, shift.curiosityBias - 0.005);
    }

    // ── تحديث معدل التفاعل الكلي ──────────────────────────────────────────
    this.state.totalTracked++;
    const weight = 1 / Math.min(this.state.totalTracked, 100);
    this.state.overallEngagementRate =
      this.state.overallEngagementRate * (1 - weight) +
      (isSuccess ? 1 : 0) * weight;

    this._scheduleSave();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // استشارة محرك التعلم (يُستدعى قبل قرار الرد)
  // ══════════════════════════════════════════════════════════════════════════

  /** احتمالية الرد الموصى بها لهذا السياق */
  getRecommendedReplyProb(emotion, dialect) {
    const key = `${emotion}_${dialect}`;
    return this.state.replyProbabilities[key] ?? 0.55;
  }

  /** أفضل أسلوب استجابة بناءً على التعلم */
  getBestStyle() {
    const rates = this.state.styleSuccessRates;
    const scores = Object.entries(rates).map(([style, { success, total }]) => ({
      style,
      rate: total > 0 ? success / total : 0.5
    }));
    scores.sort((a, b) => b.rate - a.rate);
    return scores[0]?.style || 'neutral';
  }

  /** نسبة نجاح أسلوب محدد */
  getStyleSuccessRate(style) {
    const sr = this.state.styleSuccessRates[style];
    if (!sr || sr.total === 0) return 0.5;
    return sr.success / sr.total;
  }

  /** حالة تحيز الشخصية الحالية */
  getPersonalityBias() { return this.state.personalityShift; }

  /** الحالة الكاملة للتشخيص */
  getFullState() { return this.state; }
}

module.exports = new LearningEngine();