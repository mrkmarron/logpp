"use strict";

const logpp = require("../src/logger")("basic", { flushMode: "NOP" });

logpp.addFormat("Basic_Hello", "Hello World!!!");
logpp.addFormat("Compound_Hello", "Hello at #wallclock from #module with %{0:a} %{1:n} -- %{2:s}");

function write(msg) {
    process.stdout.write(msg);
}

///////
//Basic

const bstart1 = new Date();
for (let i = 0; i < 50000; ++i) {
    logpp.info(logpp.$Basic_Hello);
}
const bend1 = new Date();
console.error(`Total log time = ${bend1 - bstart1}`);

const bstart2 = new Date();
logpp.emitFullLogSync();
const bend2 = new Date();
console.error(`Total emit time = ${bend2 - bstart2}`);

const bstartc = new Date();
for (let i = 0; i < 50000; ++i) {
    write("Hello World!!!\n");
}
const bendc = new Date();
console.error(`Total console time = ${bendc - bstartc}`);

///////
//Compound

const cstart1 = new Date();
for (let i = 0; i < 50000; ++i) {
    logpp.info(logpp.$Compound_Hello, ["iter", i], i - 5, i % 2 === 0 ? "ok" : "skip");
}
const cend1 = new Date();
console.error(`Total log time = ${cend1 - cstart1}`);

const cstart2 = new Date();
logpp.emitFullLogSync();
const cend2 = new Date();
console.error(`Total emit time = ${cend2 - cstart2}`);

const app = "basic";
const cstartc = new Date();
for (let i = 0; i < 50000; ++i) {
    write("Hello at " + (new Date()).toISOString() + " from " + app + " with " + JSON.stringify(["iter", i]) + " " + (i - 5) + " -- " + (i % 2 === 0 ? "ok" : "skip") + "\n");
}
const cendc = new Date();
console.error(`Total console time = ${cendc - cstartc}`);
