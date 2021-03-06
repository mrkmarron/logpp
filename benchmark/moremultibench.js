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
logpp.addFormat("hello3", "#host #wallclock #timestamp hello at #wallclock from #logger with %j %n -- %s");

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
    function InterpolateMore_Bunyan(cb) {
        var app = "myapp";
        for (var i = 0; i < max; i++) {
            blog.info("hello at %j from %s with %j %n -- %s", new Date(), app, ["iter", { f: i, g: i.toString() }], i - 5, (i % 2 === 0 ? "ok" : "skip"));
        }
        setImmediate(cb);
    },
    function InterpolateMore_Debug(cb) {
        var app = "myapp";
        for (var i = 0; i < max; i++) {
            dlog("hello at " + (new Date()).toISOString() + " from " + app + " with " + JSON.stringify(["iter", { f: i, g: i.toString() }]) + " " + (i - 5) + " -- " + (i % 2 === 0 ? "ok" : "skip"));
        }
        setImmediate(cb);
    },
    function InterpolateMulti_Pino(cb) {
        var app = "myapp";
        for (var i = 0; i < max; i++) {
            plog.info("hello at %j from %s with %j %n -- %s", new Date(), app, ["iter", { f: i, g: i.toString() }], i - 5, (i % 2 === 0 ? "ok" : "skip"));
        }
        setImmediate(cb);
    },
    function InterpolateMore_Logpp(cb) {
        for (var i = 0; i < max; i++) {
            logpp.info(logpp.$hello3, ["iter", { f: i, g: i.toString() }], i - 5, (i % 2 === 0 ? "ok" : "skip"));
        }
        setImmediate(cb);
    }
], 10000);

console.log("----");
console.log("Running InterpolateMore -- info('hello at %j from %s with %j %n -- %s', new Date(), app, ['iter', { f: i, g: i.toString() }], i - 5, (i % 2 === 0 ? 'ok' : 'skip'))");

run(run);
