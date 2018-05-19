"use strict";

const runner = require("./runner");

const logpp = require("../src/logger")("sublogger", { flushMode: "NOP" });

function runSingleTest(test) {
    test.action();
    return logpp.emitLogSync(true, test.full || false).trim();
}

function printTestInfo(test) {
    return test.name;
}

logpp.addFormat("Hello", "Hello World!!!");
logpp.addFormat("LName", "#logger");

const log2 = require("./log2");
let childlog = undefined;

const subtests = [
    { name: "sublogger.default", action: () => { log2.doit(); }, oktest: (msg) => msg === "Ok Log2!!!" },
    { name: "sublogger.up", full: true, action: () => { logpp.setSubLoggerLevel("log2", logpp.Levels.DETAIL); log2.doit(); }, oktest: (msg) => msg === "Hello Log2!!!\nOk Log2!!!" },
    { name: "sublogger.down", action: () => { logpp.setSubLoggerLevel("log2", logpp.Levels.OFF); log2.doit(); }, oktest: (msg) => msg === "" },
    { name: "sublogger.up2", action: () => { logpp.setSubLoggerLevel("log2", logpp.Levels.INFO); log2.doit(); }, oktest: (msg) => msg === "Ok Log2!!!" },
    { name: "sublogger.off", action: () => { logpp.disableSubLogger("log2"); log2.doit(); }, oktest: (msg) => msg === "" },
    { name: "sublogger.up3", action: () => { logpp.setSubLoggerLevel("log2", logpp.Levels.INFO); log2.doit(); }, oktest: (msg) => msg === "Ok Log2!!!" },

    { name: "emit.change.down", action: () => { logpp.setEmitLevel(logpp.Levels.WARN); log2.doit(); logpp.info(logpp.$Hello); }, oktest: (msg) => msg === "Ok Log2!!!" },
    { name: "emit.change.up", action: () => { logpp.setEmitLevel(logpp.Levels.INFO); log2.doit(); logpp.info(logpp.$Hello); }, oktest: (msg) => msg === "Ok Log2!!!\nHello World!!!" },

    { name: "childlog", action: () => { childlog = logpp.childLogger({ cl: true }); }, oktest: (msg) => msg === "" },
    { name: "childlog.default", action: () => { childlog.info(childlog.$LName); }, oktest: (msg) => msg === "\"sublogger.child\"" },
    { name: "childlog.up", action: () => { childlog.setLoggingLevel(childlog.Levels.DETAIL); childlog.detail(childlog.$LName); }, oktest: (msg) => msg === "" },
];


const subRunner = runner.generalSyncRunner(runSingleTest, printTestInfo, subtests);
subRunner(() => {
    process.stdout.write("\nAll tests done!\n\n");
});
