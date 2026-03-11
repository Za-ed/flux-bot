require('dotenv').config();
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function test() {
  try {
    console.log('GROQ Key:', process.env.GROQ_API_KEY ? '✅ موجود' : '❌ مش موجود');
    console.log('Key value:', process.env.GROQ_API_KEY?.slice(0, 10) + '...');

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: 'say hello' }],
      max_tokens: 100,
    });

    console.log('✅ يعمل:', completion.choices[0]?.message?.content);
  } catch (err) {
    console.error('❌ الخطأ الكامل:', err);
  }
}

test();