require('dotenv').config();
const express = require('express');
const cors = require('cors');
const apiRouter = require('./routes/api.js');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/api', apiRouter);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Battleship server listening on port ${PORT}`);
});
