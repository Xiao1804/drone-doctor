const express = require('express');
const router = express.Router();
const flightLogController = require('../controllers/flightLogController');
const flightLogUpload = require('../middleware/flightLogUpload');

router.get('/capabilities', flightLogController.getCapabilities);
router.post('/analyze', flightLogUpload.single('log'), flightLogController.analyzeFlightLog);

module.exports = router;
