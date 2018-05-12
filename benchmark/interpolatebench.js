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
logpp.addFormat("hello1", "#host #wallclock #timestamp hello %{0:s}");

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
    function benchBunyanInterpolate(cb) {
        for (var i = 0; i < max; i++) {
            blog.info("hello %s", "world");
        }
        setImmediate(cb);
    },
    function benchDebugInterpolate(cb) {
        for (var i = 0; i < max; i++) {
            dlog("hello " + "world");
        }
        setImmediate(cb);
    },
    function benchPinoExtremeInterpolate(cb) {
        for (var i = 0; i < max; i++) {
            plogExtreme.info("hello %s", "world");
        }
        setImmediate(cb);
    },
    function benchLogppInterpolate(cb) {
        for (var i = 0; i < max; i++) {
            logpp.info(logpp.$hello1, "world");
        }
        setImmediate(cb);
    }
], 10000);

console.log("----");
console.log("Running InterpolateMulti info('hello %s', 'world')");

run(run);
