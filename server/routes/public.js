const router = require('express').Router();
const S = require('../lib/settings');

router.get('/config', (req, res) => res.json({ ...S.publicConfig(), demo: process.env.DEMO_MODE !== 'false' }));

module.exports = router;
