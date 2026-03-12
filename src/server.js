// ─── server.js ────────────────────────────────────────────────────────────────
const express = require('express');

function keepAlive() {
  const app  = express();
  const port = process.env.PORT || 3000;

  app.get('/', (_, res) => res.send('FLUX Bot is Alive and Running! 🚀'));

  app.listen(port, () => {
    console.log(`[WEB] Server running on port ${port}`);
  });
}

module.exports = keepAlive;