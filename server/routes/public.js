const router = require('express').Router();
const { db } = require('../db');
const S = require('../lib/settings');

router.get('/config', (req, res) => res.json({ ...S.publicConfig(), demo: process.env.DEMO_MODE !== 'false' }));

router.get('/catalog', (req, res) => {
  res.json({
    cities: db.prepare(`SELECT ci.id, ci.name, p.name AS province FROM cities ci JOIN provinces p ON p.id=ci.province_id WHERE EXISTS (SELECT 1 FROM terminals t WHERE t.city_id=ci.id) ORDER BY ci.name`).all(),
    coops: db.prepare('SELECT id,name,short_name,color FROM cooperatives WHERE active=1 ORDER BY name').all(),
    chassis: db.prepare("SELECT DISTINCT chassis_brand v FROM buses WHERE chassis_brand IS NOT NULL ORDER BY 1").all().map(r => r.v),
    bodies: db.prepare("SELECT DISTINCT body_brand v FROM buses WHERE body_brand IS NOT NULL ORDER BY 1").all().map(r => r.v),
    seat_types: db.prepare('SELECT DISTINCT name FROM seat_types ORDER BY name').all().map(r => r.name),
  });
});

module.exports = router;
