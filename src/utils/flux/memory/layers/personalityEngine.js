// ─── layers/personalityEngine.js ──────────────────────────────────────────────
// محرك الشخصية المتطورة: يحافظ على هوية FLUX ويكيّفها مع ثقافة المجتمع
// ══════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// السمات الأساسية الثابتة لـ FLUX
// ══════════════════════════════════════════════════════════════════════════════
const BASE_PERSONALITY = {
  friendliness:  0.85,  // الدفء والود
  playfulness:   0.70,  // روح الدعابة
  curiosity:     0.75,  // الفضول
  supportiveness: 0.80, // الدعم العاطفي
  directness:    0.65,  // الصراحة
  techSavviness: 0.70,  // الاهتمام بالتقنية (مخفي في قناة chill)
  empathy:       0.85   // التعاطف
};

// ══════════════════════════════════════════════════════════════════════════════
// اختيار أسلوب الاستجابة
// ══════════════════════════════════════════════════════════════════════════════

/**
 * selectResponseStyle() - يختار أسلوب الاستجابة المناسب
 * @param {object} perception    - PerceptionResult
 * @param {object} communityState - حالة المجتمع
 * @param {object} personalityBias - تحيز الشخصية من LearningEngine
 * @param {object} userProfile   - ملف المستخدم
 * @returns {{ style: string, traits: object }}
 */
function selectResponseStyle(perception, communityState, personalityBias, userProfile) {
  const { emotion, intent, needsSupport, isSarcastic, isHumorous } = perception;

  // ── حالات ذات أولوية ────────────────────────────────────────────────────
  if (needsSupport || ['sadness','loneliness','anxiety'].includes(emotion)) {
    return {
      style: 'support',
      traits: { empathy: 0.95, directness: 0.4, playfulness: 0.1 }
    };
  }

  // ── الفكاهة ──────────────────────────────────────────────────────────────
  const humorBoost = (personalityBias?.humorBias || 0) + (communityState?.humorLevel || 0.5);
  if (isHumorous || (emotion === 'joy' && humorBoost > 0.7)) {
    return {
      style: 'humor',
      traits: { playfulness: 0.90, friendliness: 0.85, directness: 0.6 }
    };
  }

  // ── السخرية: تعامل معها بنفس الأسلوب ───────────────────────────────────
  if (isSarcastic) {
    return {
      style: 'humor',
      traits: { playfulness: 0.85, directness: 0.7, empathy: 0.6 }
    };
  }

  // ── الأسئلة والاستفسارات ──────────────────────────────────────────────
  if (intent === 'question' || intent === 'seek_help') {
    const curiosityBoost = (personalityBias?.curiosityBias || 0);
    if (communityState?.techLevel > 0.6 || curiosityBoost > 0.1) {
      return {
        style: 'curious',
        traits: { curiosity: 0.90, supportiveness: 0.7, directness: 0.7 }
      };
    }
    return {
      style: 'support',
      traits: { empathy: 0.8, curiosity: 0.8, directness: 0.6 }
    };
  }

  // ── الغضب: هدوء وتفاهم ───────────────────────────────────────────────────
  if (emotion === 'anger') {
    return {
      style: 'support',
      traits: { empathy: 0.90, directness: 0.3, playfulness: 0.0 }
    };
  }

  // ── الملل: فضول وتحفيز ───────────────────────────────────────────────────
  if (emotion === 'boredom') {
    return {
      style: 'curious',
      traits: { playfulness: 0.75, curiosity: 0.80, friendliness: 0.85 }
    };
  }

  // ── المستخدم المقرب: أكثر عفوية ─────────────────────────────────────────
  if (userProfile?.relationshipScore > 0.7) {
    return {
      style: 'playful',
      traits: { playfulness: 0.85, directness: 0.80, friendliness: 0.90 }
    };
  }

  // ── الافتراضي: طبيعي وودود ──────────────────────────────────────────────
  return {
    style: 'neutral',
    traits: { ...BASE_PERSONALITY }
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// وصف مرحلة تطور FLUX (تُستخدم في البرومبت)
// ══════════════════════════════════════════════════════════════════════════════
function getEvolutionDescription(stage) {
  const stages = {
    1: 'أنت جديد نسبياً على السيرفر، لكنك تحاول تعرف الناس وتكسب ثقتهم.',
    2: 'أنت الحين بدأت تعرف أهل السيرفر أكثر. عندك فكرة عن أسلوبهم ومزاجهم.',
    3: 'أنت عضو أصيل. الناس تعرفك وتتوقع منك طريقتك المميزة في الكلام.',
    4: 'أنت من أكثر الأعضاء تفاعلاً. الناس تفرح لما تشارك في السوالف.',
    5: 'أنت جزء لا يتجزأ من هذا المجتمع. شخصيتك واضحة ومميزة ومحبوبة.'
  };
  return stages[stage] || stages[1];
}

module.exports = { selectResponseStyle, getEvolutionDescription, BASE_PERSONALITY };