"use strict";

const logpp = require("../src/logger")("basic", "INFO", { transporter: "String", defaultPrefix: false });

logpp.addFormat("Basic_Hello", "Hello World!!!");
