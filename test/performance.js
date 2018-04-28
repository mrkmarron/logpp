"use strict";

const logpp = require("../src/logger")("basic", "INFO", { transporter: "String", defaultPrefix: false });

logpp.addFormat("Basic_Hello", "Hello World!!!");
logpp.addFormat("Compound_Hello", "Hello at #wallclock from #module with %{0:a} %{1:n} -- %{2:s}");

function write(msg) {
    process.stderr.write(msg);
}

///////
//Basic

const bstart1 = new Date();
for (let i = 0; i < 50000; ++i) {
    logpp.info("Basic_Hello");
}
const bend1 = new Date();
console.log(`Total log time = ${bend1 - bstart1}`);

const bstart2 = new Date();
logpp.emitFullLogSync();

const bdata = logpp.__diagnosticOutput();
write(bdata);
write("\n\n");
const bend2 = new Date();
console.log(`Total emit time = ${bend2 - bstart2}`);

const bstartc = new Date();
for (let i = 0; i < 50000; ++i) {
    write("Hello World!!!");
}
const bendc = new Date();
console.log(`Total console time = ${bendc - bstartc}`);

///////
//Compound

const cstart1 = new Date();
for (let i = 0; i < 50000; ++i) {
    logpp.info("Compound_Hello", ["iter", i], i - 5, i % 2 === 0 ? "ok" : "skip");
}
const cend1 = new Date();
console.log(`Total log time = ${cend1 - cstart1}`);

const cstart2 = new Date();
logpp.emitFullLogSync();

const cdata = logpp.__diagnosticOutput();
write(cdata);
write("\n\n");
const cend2 = new Date();
console.log(`Total emit time = ${cend2 - cstart2}`);

const app = "basic";
const cstartc = new Date();
for (let i = 0; i < 50000; ++i) {
    write("Hello at " + (new Date()).toISOString() + " from " + app + " with " + JSON.stringify(["iter", i]) + " " + (i - 5) + " -- " + (i % 2 === 0 ? "ok" : "skip") + "\n");
}
const cendc = new Date();
console.log(`Total console time = ${cendc - cstartc}`);