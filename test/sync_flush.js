"use strict";

const runner = require("./runner");

const logpp = require("../src/logger")("sync_flush", { prefix: false, flushCount: 0, bufferSizeLimit: 0 });

function runSingleTest(test) {
    test.action();
    return logpp.emitLogSync(true, true).trim();
}

function printTestInfo(test) {
    return test.name;
}

logpp.addFormat("Action", "Action %n");

const flushtests = [
    { name: "sync", action: () => { logpp.info(logpp.$Action, 1); }, oktest: (msg) => msg === "Action 1" }
];

const flushRunner = runner.generalSyncRunner(runSingleTest, printTestInfo, flushtests, "sync flush");
flushRunner(() => {
    process.stdout.write("\n");
});
