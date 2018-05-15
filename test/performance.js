"use strict";

const pino = require("pino")({ extreme: true, safe: false, base: {} });
const logpp = require("../src/logger")("basic", { flushMode: "NOP" });

logpp.addFormat("Basic_Hello", "Hello World!!!");
logpp.addFormat("Compound_Hello", "Hello at #wallclock from #logger with %{0:a} %{1:n} -- %{2:s}");

function run() {
    if (benchmarks.length === 0) {
        process.exit(0);
    }

    const b = benchmarks.shift();
    b();
}

///////
//Basic
function basic() {
    console.error("Starting Basic Performance test...");

    console.error("----");
    const bstartc = new Date();
    for (let i = 0; i < 50000; ++i) {
        process.stdout.write("Hello World!!!\n");
    }
    const bendc = new Date();
    console.error(`Total console time = ${bendc - bstartc}`);

    console.error("----");
    const bstart1 = new Date();
    for (let i = 0; i < 50000; ++i) {
        logpp.info(logpp.$Basic_Hello);
    }
    const bend1 = new Date();
    console.error(`Total Log++ log time (blocking) = ${bend1 - bstart1}`);

    const btimingInfo = {};
    const boutput = logpp.emitLogSync(true, true, btimingInfo);

    const bstart2 = new Date();
    process.stdout.write(boutput);
    const bend2 = new Date();

    console.error(`Total Log++ process time (blocking) = ${btimingInfo.pend - btimingInfo.pstart}`);
    console.error(`Total Log++ format time (background) = ${btimingInfo.fend - btimingInfo.fstart}`);
    console.error(`Total Log++ write time = ${bend2 - bstart2}`);

    console.error("----");
    const bstartp = new Date();
    for (let i = 0; i < 50000; ++i) {
        pino.info("Hello World!!!\n");
    }
    const bendp = new Date();
    console.error(`Total pino time = ${bendp - bstartp}`);

    console.error("");
}

///////
//Compound
function compound() {
    console.error("Starting Compund Performance test...");
    const app = "basic";

    console.error("----");
    const cstartc = new Date();
    for (let i = 0; i < 50000; ++i) {
        process.stdout.write("Hello at " + (new Date()).toISOString() + " from " + app + " with " + JSON.stringify(["iter", i]) + " " + (i - 5) + " -- " + (i % 2 === 0 ? "ok" : "skip") + "\n");
    }
    const cendc = new Date();
    console.error(`Total console time = ${cendc - cstartc}`);

    console.error("----");
    const cstart1 = new Date();
    for (let i = 0; i < 50000; ++i) {
        logpp.info(logpp.$Compound_Hello, ["iter", i], i - 5, i % 2 === 0 ? "ok" : "skip");
    }
    const cend1 = new Date();
    console.error(`Total Log++ log time = ${cend1 - cstart1}`);

    const ctimingInfo = {};
    const coutput = logpp.emitLogSync(true, true, ctimingInfo);

    const cstart2 = new Date();
    process.stdout.write(coutput);
    const cend2 = new Date();

    console.error(`Total Log++ process time (blocking) = ${ctimingInfo.pend - ctimingInfo.pstart}`);
    console.error(`Total Log++ format time (background) = ${ctimingInfo.fend - ctimingInfo.fstart}`);
    console.error(`Total Log++ write time = ${cend2 - cstart2}`);

    console.error("----");
    const cstartp = new Date();
    for (let i = 0; i < 50000; ++i) {
        pino.info("Hello at %s from %s with %j %d -- %s\n", (new Date()).toISOString(), app, JSON.stringify(["iter", i]), (i - 5), (i % 2 === 0 ? "ok" : "skip"));
    }
    const cendp = new Date();
    console.error(`Total pino time = ${cendp - cstartp}`);
}

const benchmarks = [basic, compound];
setInterval(run, 100);
