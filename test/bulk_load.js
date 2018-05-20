"use strict";

const path = require("path");
const runner = require("./runner");

const logpp = require("../src/logger")("load", { flushMode: "NOP", prefix: false });

function runSingleTest(test) {
    test.action();
    return logpp.emitLogSync(true, test.full || false).trim();
}

function printTestInfo(test) {
    return test.name;
}

logpp.enableCategories({ cat1: true, cat2: true });
logpp.enableCategories([{ cat1: false }, { cat3: true }]);
logpp.enableCategories(path.join(__dirname, "configs/categoryfile.json"));
logpp.enableCategories([path.join(__dirname, "configs/categoryfile.json"), path.join(__dirname, "configs/categoryfile2.json")]);

logpp.addFormats({ Hello: "hi", Goodbye: "bye" });
logpp.addFormats([{ Time: "#wallclock" }, { Obj: "%j" }]);
logpp.addFormats(path.join(__dirname, "configs/formatfile.json"));
logpp.addFormats([path.join(__dirname, "configs/formatfile.json"), path.join(__dirname, "configs/formatfile2.json")]);

logpp.configureSubloggers({
    configured: { log2: "WARN" },
    disabled: ["log3"]
});
logpp.configureSubloggers(path.join(__dirname, "configs/subloggerfile.json"));

const log2 = require("./log2");

const loadtests = [
    { name: "log.warn.hi", action: () => { logpp.warn(logpp.$Hello); }, oktest: (res) => res === "hi file" },
    { name: "log.warn.hi.cat1", action: () => { logpp.warn(logpp.$$cat1, logpp.$Hello); }, oktest: (res) => res === "" },
    { name: "log.warn.hi.cat3", action: () => { logpp.warn(logpp.$$cat3, logpp.$Hello); }, oktest: (res) => res === "hi file" },
    { name: "log2.doit", action: () => { log2.doit(); }, oktest: (res) => res === "Ok Log2!!!" }
];

const loadRunner = runner.generalSyncRunner(runSingleTest, printTestInfo, loadtests, "bulk load");
loadRunner(() => {
    process.stdout.write("\n");
});
