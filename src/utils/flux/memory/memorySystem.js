// ─── memory/memorySystem.js ────────────────────────────────────────────────────
// نظام الذاكرة متعدد المستويات: قصيرة، متوسطة، طويلة المدى
// ══════════════════════════════════════════════════════════════════════════════

const fs   = require('fs');
const path = require('path');

const DATA_DIR       = path.join(__dirname, '../../flux_data');
const PROFILES_FILE  = path.join(DATA_DIR, 'user_profiles.json');
const COMMUNITY_FILE = path.join(DATA_DIR, 'community_state.json');

// ── تهيئة مجلد البيانات ──────────────────────────────────────────────────────
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ══════════════════════════════════════════════════════════════════════════════
// ١. الذاكرة القصيرة المدى (آخر 50 رسالة لكل قناة)
// ══════════════════════════════════════════════════════════════════════════════
class ShortTermMemory {
  constructor() {
    this.channels = new Map(); // channelId → [ MessageRecord ]
    this.MAX_SIZE = 50;
  }

  /**
   * @typedef {Object} MessageRecord
   * @property {string}  role       - 'user' | 'assistant'
   * @property {string}  content
   * @property {string}  username
   * @property {string}  userId
   * @property {number}  timestamp
   * @property {string}  emotion
   * @property {string}  dialect
   * @property {string}  intent
   */

  add(channelId, record) {
    if (!this.channels.has(channelId)) this.channels.set(channelId, []);
    const buf = this.channels.get(channelId);
    buf.push({ ...record, timestamp: Date.now() });
    if (buf.length > this.MAX_SIZE) buf.shift();
  }

  getHistory(channelId) {
    return this.channels.get(channelId) || [];
  }

  getRecentMessages(channelId, n = 10) {
    return (this.channels.get(channelId) || []).slice(-n);
  }

  /** آخر رسائل مستخدم معين */
  getUserMessages(channelId, userId, n = 5) {
    return (this.channels.get(channelId) || [])
      .filter(m => m.userId === userId)
      .slice(-n);
  }

  /** للـ API: تسلسل المحادثة بصيغة messages[] */
  buildAPIHistory(channelId, limit = 20) {
    const msgs = this.getRecentMessages(channelId, limit);
    const result = [];
    let lastRole = null;
    for (const m of msgs) {
      if (m.role === lastRole) {
        result[result.length - 1].content += '\n' + m.content;
      } else {
        result.push({ role: m.role, content: m.content });
        lastRole = m.role;
      }
    }
    return result;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ٢. الذاكرة متوسطة المدى (أنماط القناة والجلسة)
// ══════════════════════════════════════════════════════════════════════════════
class MediumTermMemory {
  constructor() {
    this.channels = new Map();
  }

  _init(channelId) {
    if (!this.channels.has(channelId)) {
      this.channels.set(channelId, {
        messageCount:     0,
        activeUsers:      new Map(),  // userId → { count, lastSeen, emotions[] }
        topicFrequency:   new Map(),  // topic → count
        emotionHistory:   [],         // آخر 20 حالة عاطفية
        humorScore:       0.5,        // 0-1: مدى كوميدية القناة
        seriousnessScore: 0.5,        // 0-1: مدى جدية القناة
        avgResponseTime:  0,          // متوسط وقت الاستجابة
        fluxEngagement:   [],         // سجل تفاعل FLUX [ { responded, engaged } ]
        lastActivity:     Date.now()
      });
    }
    return this.channels.get(channelId);
  }

  recordMessage(channelId, { userId, username, emotion, topic, isHumorous }) {
    const state = this._init(channelId);
    state.messageCount++;
    state.lastActivity = Date.now();

    // تتبع المستخدمين النشطين
    if (!state.activeUsers.has(userId)) {
      state.activeUsers.set(userId, { count: 0, lastSeen: 0, emotions: [], username });
    }
    const u = state.activeUsers.get(userId);
    u.count++;
    u.lastSeen    = Date.now();
    u.username    = username;
    u.emotions.push(emotion);
    if (u.emotions.length > 10) u.emotions.shift();

    // تتبع المواضيع
    if (topic) {
      state.topicFrequency.set(topic, (state.topicFrequency.get(topic) || 0) + 1);
    }

    // تتبع المشاعر
    state.emotionHistory.push({ emotion, timestamp: Date.now() });
    if (state.emotionHistory.length > 20) state.emotionHistory.shift();

    // تحديث درجة الفكاهة
    if (isHumorous) {
      state.humorScore = Math.min(1, state.humorScore * 0.95 + 0.05);
    } else {
      state.humorScore = Math.max(0, state.humorScore * 0.99);
    }
  }

  recordFluxResponse(channelId, wasEngaged) {
    const state = this._init(channelId);
    state.fluxEngagement.push({ wasEngaged, timestamp: Date.now() });
    if (state.fluxEngagement.length > 50) state.fluxEngagement.shift();
  }

  getChannelState(channelId) {
    return this._init(channelId);
  }

  /** نسبة نجاح استجابات FLUX (آخر 20) */
  getFluxSuccessRate(channelId) {
    const { fluxEngagement } = this._init(channelId);
    if (!fluxEngagement.length) return 0.5;
    const recent = fluxEngagement.slice(-20);
    return recent.filter(r => r.wasEngaged).length / recent.length;
  }

  /** أكثر المستخدمين نشاطاً */
  getTopUsers(channelId, n = 5) {
    const state = this._init(channelId);
    return [...state.activeUsers.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, n)
      .map(([uid, data]) => ({ userId: uid, ...data }));
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ٣. الذاكرة الطويلة المدى (ملفات تعريف المستخدمين)
// ══════════════════════════════════════════════════════════════════════════════
class LongTermMemory {
  constructor() {
    this.profiles  = this._loadJSON(PROFILES_FILE, {});
    this.community = this._loadJSON(COMMUNITY_FILE, {
      totalInteractions: 0,
      dominantDialect:   'unknown',
      humorLevel:        0.5,
      techLevel:         0.3,
      communityMood:     'neutral',
      topTopics:         [],
      evolutionStage:    1,  // 1-5: مراحل تطور FLUX
      lastUpdated:       Date.now()
    });
    this._saveTimer = null;
    this._scheduleSave();
  }

  _loadJSON(filePath, defaults) {
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
      }
    } catch (e) { /* ignore parse errors */ }
    return { ...defaults };
  }

  _scheduleSave() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._persist(), 30000); // حفظ كل 30 ثانية
  }

  _persist() {
    try {
      fs.writeFileSync(PROFILES_FILE,  JSON.stringify(this.profiles,  null, 2));
      fs.writeFileSync(COMMUNITY_FILE, JSON.stringify(this.community, null, 2));
    } catch (e) {
      console.error('[FLUX-MEMORY] فشل الحفظ:', e.message);
    }
    this._scheduleSave();
  }

  /** ─── ملف المستخدم ─── */
  getProfile(userId, username) {
    if (!this.profiles[userId]) {
      this.profiles[userId] = {
        username,
        firstSeen:         Date.now(),
        lastSeen:          Date.now(),
        interactionCount:  0,
        dominantEmotions:  {},    // emotion → count
        dominantTopics:    {},    // topic → count
        dialect:           'unknown',
        dialectConfidence: 0,
        humorAffinity:     0.5,   // مدى تجاوبه مع الفكاهة
        relationshipScore: 0.3,   // 0-1: قوة العلاقة مع FLUX
        preferredStyle:    'neutral',
        notes:             []     // ملاحظات مهمة عن المستخدم
      };
    }
    const p = this.profiles[userId];
    p.lastSeen = Date.now();
    p.username = username; // تحديث الاسم
    return p;
  }

  updateProfile(userId, username, { emotion, topic, dialect, dialectConf, isHumorous }) {
    const p = this.getProfile(userId, username);
    p.interactionCount++;
    p.lastSeen = Date.now();

    // تحديث المشاعر السائدة
    if (emotion && emotion !== 'neutral') {
      p.dominantEmotions[emotion] = (p.dominantEmotions[emotion] || 0) + 1;
    }
    // تحديث المواضيع
    if (topic) {
      p.dominantTopics[topic] = (p.dominantTopics[topic] || 0) + 1;
    }
    // تحديث اللهجة إذا كانت الثقة أعلى
    if (dialectConf > p.dialectConfidence) {
      p.dialect           = dialect;
      p.dialectConfidence = dialectConf;
    }
    // تحديث درجة الألفة مع الفكاهة
    if (isHumorous !== undefined) {
      p.humorAffinity = isHumorous
        ? Math.min(1, p.humorAffinity + 0.03)
        : Math.max(0, p.humorAffinity - 0.01);
    }
    // تحديث درجة العلاقة (تزيد مع التفاعل)
    p.relationshipScore = Math.min(1,
      0.3 + Math.log10(p.interactionCount + 1) * 0.25
    );

    this._scheduleSave();
    return p;
  }

  addUserNote(userId, note) {
    const p = this.profiles[userId];
    if (p) {
      p.notes.push({ text: note, timestamp: Date.now() });
      if (p.notes.length > 5) p.notes.shift();
      this._scheduleSave();
    }
  }

  /** ─── حالة المجتمع ─── */
  updateCommunity({ dialect, humorScore, techScore, topic, mood }) {
    const c = this.community;
    c.totalInteractions++;
    if (dialect)    c.dominantDialect  = dialect;
    if (humorScore) c.humorLevel       = c.humorLevel * 0.97 + humorScore * 0.03;
    if (techScore)  c.techLevel        = c.techLevel  * 0.97 + techScore  * 0.03;
    if (mood)       c.communityMood    = mood;
    if (topic && !c.topTopics.includes(topic)) {
      c.topTopics.unshift(topic);
      if (c.topTopics.length > 10) c.topTopics.pop();
    }
    // رفع مرحلة تطور FLUX تدريجياً
    if (c.totalInteractions > 500  && c.evolutionStage < 2) c.evolutionStage = 2;
    if (c.totalInteractions > 2000 && c.evolutionStage < 3) c.evolutionStage = 3;
    if (c.totalInteractions > 5000 && c.evolutionStage < 4) c.evolutionStage = 4;
    if (c.totalInteractions > 10000 && c.evolutionStage < 5) c.evolutionStage = 5;
    c.lastUpdated = Date.now();
    this._scheduleSave();
  }

  getCommunityState() { return this.community; }
  getAllProfiles()     { return this.profiles;  }

  isKnownUser(userId) {
    return !!this.profiles[userId] && this.profiles[userId].interactionCount > 3;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Singleton Export
// ══════════════════════════════════════════════════════════════════════════════
const shortTerm  = new ShortTermMemory();
const mediumTerm = new MediumTermMemory();
const longTerm   = new LongTermMemory();

module.exports = { shortTerm, mediumTerm, longTerm };