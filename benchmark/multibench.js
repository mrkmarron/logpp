"use strict";

//
//Borrowing benchmark design and harness code from pino (https://github.com/pinojs/pino)
//

var bench = require("fastbench");
var bunyan = require("bunyan");
var fs = require("fs");
var path = require("path");

var dest = fs.createWriteStream(path.join(__dirname, "performanceout.txt"));

var plog = require("pino")(dest);

var logpp = require("../src/logger")("basic", { flushTarget: "stream", stream: dest, prefix: false });
logpp.addFormat("hello2", "#host #wallclock #timestamp hello %s %j %n");

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
    function InterpolateMulti_Bunyan(cb) {
        for (var i = 0; i < max; i++) {
            blog.info("hello %s %j %d", "world", { obj: true }, 4);
        }
        setImmediate(cb);
    },
    function InterpolateMulti_Debug(cb) {
        for (var i = 0; i < max; i++) {
            dlog("hello " + "world " + JSON.stringify({ obj: true }) + "4");
        }
        setImmediate(cb);
    },
    function InterpolateMulti_Pino(cb) {
        for (var i = 0; i < max; i++) {
            plog.info("hello %s %j %d", "world", { obj: true }, 4);
        }
        setImmediate(cb);
    },
    function InterpolateMulti_Logpp(cb) {
        for (var i = 0; i < max; i++) {
            logpp.info(logpp.$hello2, "world", { obj: true }, 4);
        }
        setImmediate(cb);
    }
], 10000);

console.log("----");
console.log("Running InterpolateMulti info('hello %s %j %d', 'world', { obj: true }, 4)");


run(run);
