const express = require('express');
const router = express.Router();
const flightLogController = require('../controllers/flightLogController');
const flightLogUpload = require('../middleware/flightLogUpload');
const { freeUsageLimit } = require('../middleware/freeUsageLimit');

router.get('/capabilities', flightLogController.getCapabilities);
router.post('/analyze', freeUsageLimit, flightLogUpload.single('log'), flightLogController.analyzeFlightLog);

module.exports = router;
