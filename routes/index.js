var express = require('express');
var os = require('os');
var router = express.Router();
var app = require('../app');

/* GET home page. */
router.get('/', function (req, res) {
    res.render('index', { address: os.hostname() });
});

module.exports = router;