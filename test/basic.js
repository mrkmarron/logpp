"use strict";

const logpp = require("../src/logger")("basic", "INFO", { transporter: "String" });

//formats
logpp.addFormat("Fixed_Hello", "Hello World!!!");

logpp.info("Fixed_Hello");
//logpp.info(logpp.Fixed_Hello);

logpp.emitFullLogSync();
