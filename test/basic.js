"use strict";

const logpp = require("../src/logger")("basic", "INFO", { transporter: "String" });

//formats
logpp.addFormat("Fixed_Hello", "Hello World!!!");

const start1 = new Date();
for (let i = 0; i < 50000; ++i) {
    logpp.info("Fixed_Hello");
    //logpp.info(logpp.Fixed_Hello);
}
const end1 = new Date();
console.log(`Total log time = ${end1 - start1}`);

/*
const start2 = new Date();
logpp.emitFullLogSync();

const data = logpp.__diagnosticOutput();
console.log(data);
const end2 = new Date();
console.log(`Total emit time = ${end2 - start2}`);

const startc = new Date();
for (let i = 0; i < 50000; ++i) {
    console.log("Fixed_Hello");
}
const endc = new Date();
console.log(`Total console time = ${endc - startc}`);
*/
