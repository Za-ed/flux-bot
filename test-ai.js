require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function test() {
  try {
    // جرب الموديلات الجديدة
    const models = ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.0-pro'];
    
    for (const modelName of models) {
      try {
        console.log(`\nجاري تجربة: ${modelName}`);
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent('say hello');
        console.log(`✅ يعمل: ${modelName} — ${result.response.text().slice(0, 50)}`);
        break;
      } catch (err) {
        console.log(`❌ مش يعمل: ${modelName} — ${err.message.slice(0, 80)}`);
      }
    }
  } catch (err) {
    console.error('خطأ عام:', err.message);
  }
}

test();