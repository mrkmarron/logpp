"use strict";

const runner = require("./runner");

const logpp = require("../src/logger")("msg_enable", { flushMode: "NOP" });

function runSingleTest(test) {
    test.action();
    return logpp.emitLogSync(true, test.full || false).trim();
}

function printTestInfo(test) {
    return test.name;
}

logpp.addFormat("Hello", "Hello World!!!");

asdf;
const optionstests = [
    { name: "implicitfmt.basic", action: () => { logpp.info("Hello World!!!"); }, oktest: (msg) => msg === "Hello World!!!" }
];

const optionsRunner = runner.generalSyncRunner(runSingleTest, printTestInfo, optionstests);
optionsRunner(() => {
    process.stdout.write("\nAll tests done!\n\n");
});
