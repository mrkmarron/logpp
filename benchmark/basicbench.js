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
logpp.addFormat("hello", "#host #wallclock #timestamp hello world -- logpp");

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

var run = bench([
    function benchBunyan(cb) {
        for (var i = 0; i < max; i++) {
            blog.info("hello world -- bunyan");
        }
        setImmediate(cb);
    },
    function benchDebug(cb) {
        for (var i = 0; i < max; i++) {
            dlog("hello world -- debug");
        }
        setImmediate(cb);
    },
    function benchPinoExtreme(cb) {
        for (var i = 0; i < max; i++) {
            plogExtreme.info("hello world -- pino");
        }
        setImmediate(cb);
    },
    function benchLogpp(cb) {
        for (var i = 0; i < max; i++) {
            logpp.info(logpp.$hello);
        }
        setImmediate(cb);
    }
], 10000);

run(run);