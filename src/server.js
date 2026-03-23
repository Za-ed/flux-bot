// ─── server.js ────────────────────────────────────────────────────────────────
const express = require('express');

function keepAlive() {
  const app  = express();
  const port = process.env.PORT || 3000;

  app.get('/', (_, res) => res.send('FLUX Bot is Alive and Running! 🚀'));

  // التعديل هنا: إضافة '0.0.0.0' ليسمح Render بالاتصالات الخارجية
  app.listen(port, '0.0.0.0', () => {
    console.log(`[WEB] Server running on port ${port}`);
  });
}

module.exports = keepAlive;