"use strict";

const logpp = require("../src/logger")("basic", "INFO", { transporter: "String", defaultPrefix: false });

setTimeout(() => {
    logpp.addFormat("Basic_Hello", "Hello World!!!");
    logpp.addFormat("Compound_Hello_APP", "%{0:s} from #module!");

    logpp.info(logpp.$Basic_Hello);

    console.log(JSON.stringify(logpp));
}, 10000);
