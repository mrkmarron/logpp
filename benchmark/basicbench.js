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
    function Basic_Bunyan(cb) {
        for (var i = 0; i < max; i++) {
            blog.info("hello world -- bunyan");
        }
        setImmediate(cb);
    },
    function Basic_Debug(cb) {
        for (var i = 0; i < max; i++) {
            dlog("hello world -- debug");
        }
        setImmediate(cb);
    },
    function InterpolateMulti_Pino(cb) {
        for (var i = 0; i < max; i++) {
            plog.info("hello world -- pino");
        }
        setImmediate(cb);
    },
    function Basic_Logpp(cb) {
        for (var i = 0; i < max; i++) {
            logpp.info(logpp.$hello);
        }
        setImmediate(cb);
    }
], 10000);

console.log("----");
console.log("Running InterpolateBasic info('hello world -- logger')");

run(run);
