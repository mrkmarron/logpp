"use strict";

//
//Borrowing benchmark design and harness code from pino (https://github.com/pinojs/pino)
//

var bench = require("fastbench");
var bunyan = require("bunyan");
var fs = require("fs");
var path = require("path");

var dest = fs.createWriteStream(path.join(__dirname, "performanceout.txt"));

var plogExtreme = require("pino")({ extreme: true }, dest);

var logpp = require("../src/logger")("basic", { flushTarget: "stream", stream: dest });
logpp.addFormat("deep", "%{0:o}");
logpp.addFormat("deepall", "%{0:o<*,>}");
logpp.addFormat("long", "%{0:s}");

process.env.DEBUG = "dlog";
var debug = require("debug");
var dlog = debug("dlog");
dlog.log = function (s) { dest.write(s); };

var max = 10;

var blog = bunyan.createLogger({
    name: "myapp",
    streams: [{
        level: "trace",
        stream: dest
    }]
});

var deep = require("../package.json");
deep.deep = JSON.parse(JSON.stringify(deep));
deep.deep.deep = JSON.parse(JSON.stringify(deep));
deep.deep.deep.deep = JSON.parse(JSON.stringify(deep));

var long = JSON.stringify(deep);

var run = bench([
    function benchBunyanDeep(cb) {
        for (var i = 0; i < max; i++) {
            blog.info(deep);
        }
        setImmediate(cb);
    },
    function benchDebugDeep(cb) {
        for (var i = 0; i < max; i++) {
            dlog(deep);
        }
        setImmediate(cb);
    },
    function benchPinoExtremeDeep(cb) {
        for (var i = 0; i < max; i++) {
            plogExtreme.info(deep);
        }
        setImmediate(cb);
    },
    function benchLogppDeep(cb) {
        for (var i = 0; i < max; i++) {
            logpp.info(logpp.$deep, deep);
        }
        setImmediate(cb);
    },
    function benchLogppDeepAll(cb) {
        for (var i = 0; i < max; i++) {
            logpp.info(logpp.$deepall, deep);
        }
        setImmediate(cb);
    },
    function benchBunyanLong(cb) {
        for (var i = 0; i < max; i++) {
            blog.info(long);
        }
        setImmediate(cb);
    },
    function benchDebugLong(cb) {
        for (var i = 0; i < max; i++) {
            dlog(long);
        }
        setImmediate(cb);
    },
    function benchPinoExtremeLong(cb) {
        for (var i = 0; i < max; i++) {
            plogExtreme.info(long);
        }
        setImmediate(cb);
    },
    function benchLogppLong(cb) {
        for (var i = 0; i < max; i++) {
            logpp.info(logpp.$long, long);
        }
        setImmediate(cb);
    }
], 10000);

run(run);
