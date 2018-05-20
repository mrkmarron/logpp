"use strict";

const os = require("os");
const runner = require("./runner");

const logpp = require("../src/logger")("prefix", { flushMode: "NOP" });
const logpp2 = require("../src/logger")("prefix2", { flushMode: "NOP" });

function runSingleTest(test) {
    test.action();
    return logpp.emitLogSync(true, test.full || false).trim();
}

function printTestInfo(test) {
    return test.name;
}

logpp.addFormat("Hello", "Hello World!!!");
logpp2.addFormat("Hello", "Hello World!!!");

const prefixtests = [
    { name: "prefix", action: () => { logpp.info("Hello"); }, oktest: (msg) => msg.startsWith("INFO#$explicit @ ") && msg.endsWith(os.hostname() + "::prefix | Hello") },
    { name: "prefix2", action: () => { logpp2.warn(logpp2.$Hello); }, oktest: (msg) => msg.startsWith("WARN#$default @ ") && msg.endsWith(os.hostname() + "::prefix2 | Hello World!!!") },
    { name: "prefix.child", action: () => { const childlog = logpp.childLogger({ cl: true }); childlog.info(childlog.$Hello); }, oktest: (msg) => msg.startsWith("INFO#$default @ ") && msg.endsWith(os.hostname() + "::prefix.child | Hello World!!!") }
];

const prefixRunner = runner.generalSyncRunner(runSingleTest, printTestInfo, prefixtests);
prefixRunner(() => {
    process.stdout.write("\n");
});
