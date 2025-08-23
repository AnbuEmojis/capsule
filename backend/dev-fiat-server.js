require('dotenv').config({ path: 'cryptochain/.env' });
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.FIAT_DEV_PORT || 3001;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// ----- DB -----
const uri = process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/cryptochain';
mongoose.connect(uri).then(() => console.log('✅ [dev-fiat] Mongo connected')).catch(err => { console.error(err); process.exit(1); });

// ----- Fake auth (dev only) -----
app.use(async (req, res, next) => {
  try {
    const User = require('./models/User');
    const email = process.env.DEMO_EMAIL || 'demo@local';
    let u = await User.findOne({ email });
    if (!u) u = await User.create({ email, name: 'Demo User' });
    req.user = { id: u._id };
    next();
  } catch (e) {
    console.error('dev auth error', e);
    res.status(500).json({ error: 'dev_auth_failed' });
  }
});

// ----- Routes -----
app.use('/api/fiat',    require('./routes/fiat'));     // uses req.user set above
app.use('/api/user',    require('./routes/user'));
app.use('/api/rewards', require('./routes/rewards'));

app.listen(PORT, () => console.log(`🚀 [dev-fiat] listening on http://localhost:${PORT}`));
