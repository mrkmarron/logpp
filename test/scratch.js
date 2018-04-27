"use strict";

const logpp = require("../src/logger")("basic", "INFO", { transporter: "String", defaultPrefix: false });

const start = new Date();
for (let i = 0; i < 100000; ++i) {
    logpp.addFormat("Basic_Hello_" + i, "#app Hello #app World #app !!! #app ok #app there #app ");
}
console.log("Total time = " + (new Date() - start));

/*
setTimeout(() => {
    logpp.addFormat("Basic_Hello", "Hello World!!!");
    logpp.addFormat("Compound_Hello_APP", "%{0:s} from #module!");
}, 10000);
*/
