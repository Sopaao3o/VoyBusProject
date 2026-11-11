const { Router } = require('express');

const router = Router();

router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    servicio: 'voybus-backend',
    hora: new Date().toISOString(),
  });
});

module.exports = router;
