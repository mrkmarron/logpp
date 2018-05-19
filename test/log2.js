////
//This is a module to require in from a parent and then control

"use strict";

const logpp = require("../src/logger")("log2", { flushMode: "NOP" });

logpp.addFormat("Hello", "Hello Log2!!!");
logpp.addFormat("Ok", "Ok Log2!!!");

function doit() {
    logpp.setLoggingLevel(logpp.Levels.DETAIL);
    logpp.detail(logpp.$Hello);

    logpp.warn(logpp.$Ok);
}

module.exports.doit = doit;
