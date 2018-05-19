"use strict";

const runner = require("./runner");

const logpp = require("../src/logger")("msg_enable", { flushMode: "NOP", prefix: false });

function runSingleTest(test) {
    test.action();
    return logpp.emitLogSync(true, test.full || false).trim();
}

function printTestInfo(test) {
    return test.name;
}

logpp.addFormat("Hello", "Hello World!!!");

const leveltests = [
    { name: "implicitfmt.basic", action: () => { logpp.info("Hello World!!!"); }, oktest: (msg) => msg === "Hello World!!!" },
    { name: "implicitfmt.arg", action: () => { logpp.info("Hello %s", "Bob"); }, oktest: (msg) => msg === "Hello \"Bob\"" },
    { name: "implicitfmt.obj", action: () => { logpp.info([1, 2]); }, oktest: (msg) => msg === "[1, 2]" },

    { name: "log.warn", action: () => { logpp.warn(logpp.$Hello); }, oktest: (res) => res === "Hello World!!!" },
    { name: "log.detail.full", full: true, action: () => { logpp.detail(logpp.$Hello); }, oktest: (res) => res === "Hello World!!!" },
    { name: "log.detail.normal", action: () => { logpp.detail(logpp.$Hello); }, oktest: (res) => res === "" },
    { name: "log.trace.full", full: true, action: () => { logpp.trace(logpp.$Hello); }, oktest: (res) => res === "" },
    { name: "log.trace.normal", action: () => { logpp.trace(logpp.$Hello); }, oktest: (res) => res === "" },

    { name: "setLevel.info", action: () => { logpp.setLoggingLevel(logpp.Levels.INFO); }, oktest: (res) => res === "" },
    { name: "log.info.level", full: true, action: () => { logpp.info(logpp.$Hello); }, oktest: (res) => res === "Hello World!!!" },
    { name: "log.detail.level", full: true, action: () => { logpp.detail(logpp.$Hello); }, oktest: (res) => res === "" },

    { name: "log.info.nocategory", action: () => { logpp.info(logpp.$$awesome, logpp.$Hello); }, oktest: (res) => res === "" },
    { name: "enableCategory.awesome", action: () => { logpp.enableCategory("awesome", true); }, oktest: (res) => res === "" },
    { name: "log.info.category", action: () => { logpp.info(logpp.$$awesome, logpp.$Hello); }, oktest: (res) => res === "Hello World!!!" },

    { name: "enableCategory.awesome.off", action: () => { logpp.enableCategory("awesome", false); }, oktest: (res) => res === "" },
    { name: "log.info.offcategory", action: () => { logpp.info(logpp.$$awesome, logpp.$Hello); }, oktest: (res) => res === "" },

    { name: "log.infoIf.true", action: () => { logpp.infoIf(true, logpp.$Hello); }, oktest: (res) => res === "Hello World!!!" },
    { name: "log.infoIf.false", action: () => { logpp.infoIf(false, logpp.$Hello); }, oktest: (res) => res === "" },
    { name: "log.detailIf.true", action: () => { logpp.detailIf(true, logpp.$Hello); }, oktest: (res) => res === "" },
    { name: "log.detailIf.true.full", full: true, action: () => { logpp.detailIf(true, logpp.$Hello); }, oktest: (res) => res === "" },
    { name: "reenableCategory.awesome", action: () => { logpp.enableCategory("awesome", true); }, oktest: (res) => res === "" },
    { name: "log.infoIf.category.true", action: () => { logpp.infoIf(true, logpp.$$awesome, logpp.$Hello); }, oktest: (res) => res === "Hello World!!!" }
];

const levelRunner = runner.generalSyncRunner(runSingleTest, printTestInfo, leveltests);
levelRunner(() => {
    process.stdout.write("\n");
});
