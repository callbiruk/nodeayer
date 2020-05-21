let
    express = require('express'),
    router = express.Router(),
    controller = require('../controllers');


// The endpoint
router.get('/', controller.homeController);
router.get('/api/:month/:typeOfData/:stationNumber', controller.apiController);

module.exports = router;