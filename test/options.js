"use strict";

const runner = require("./runner");

const logpp = require("../src/logger")("options1", {
    flushMode: "NOP",

    memoryLevel: "DEBUG",
    emitLevel: "INFO",
    defaultSubloggerLevel: "OFF",
    formats: { Hello: "hi", Goodbye: "bye" },
    categories: { yeah: true },
    prefix: false
});

function runSingleTest(test) {
    test.action();
    return logpp.emitLogSync(true, test.full || false).trim();
}

function printTestInfo(test) {
    return test.name;
}

const log2 = require("./log2");

const optionstests = [
    { name: "log.debug", action: () => { logpp.debug(logpp.$Hello); }, oktest: (res) => res === "" },
    { name: "log.info", action: () => { logpp.info(logpp.$Hello); }, oktest: (res) => res === "hi" },
    { name: "log.info.categoryon", action: () => { logpp.info(logpp.$$yeah, logpp.$Hello); }, oktest: (res) => res === "hi" },
    { name: "log.info.categoryoff", action: () => { logpp.info(logpp.$$no, logpp.$Hello); }, oktest: (res) => res === "" },
    { name: "log2.doit", action: () => { log2.doit(); }, oktest: (res) => res === "" }
];

const optionsRunner = runner.generalSyncRunner(runSingleTest, printTestInfo, optionstests, "option");
optionsRunner(() => {
    process.stdout.write("\nAll tests done!\n\n");
});
