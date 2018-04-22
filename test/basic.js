"use strict";

const os = require("os");
const chalk = require("chalk");

const logpp = require("../src/logger")("basic", "INFO", { transporter: "String", defaultPrefix: false });

function basicTestRunner(nextcb) {
    function runSingleTest(test) {
        logpp.info(test.fmt, test.arg);

        logpp.emitFullLogSync();
        const res = logpp.__diagnosticOutput();
        return res;
    }

    let basictestsRun = 0;
    let basictestsFailed = 0;

    function runSingleTestCB() {
        const test = basictests[basictestsRun++];
        try {
            process.stdout.write(`log.info("${test.fmt}", ${test.arg})...`);
            const res = runSingleTest(test);
            process.stdout.write(res + " ->");
            if (test.oktest(res)) {
                process.stdout.write(chalk.green(" passed\n"));
            }
            else {
                basictestsFailed = basictestsFailed + 1;

                process.stdout.write(chalk.red(` failed with "${res}"\n`));
            }
        }
        catch (ex) {
            basictestsFailed = basictestsFailed + 1;

            process.stdout.write(chalk.red(` failed with exception: ${ex}\n`));
        }

        if (basictestsRun !== basictests.length) {
            setImmediate(runSingleTestCB);
        }
        else {
            process.stdout.write("----\n");
            if (basictestsFailed !== 0) {
                process.stdout.write(chalk.red.bold(`${basictestsFailed} failures out of ${basictestsRun} tests!!!\n`));
            }
            else {
                process.stdout.write(chalk.green.bold(`All ${basictestsRun} tests passed!\n`));
            }

            setImmediate(nextcb);
        }
    }

    process.stdout.write("Running basic tests...\n");
    setImmediate(runSingleTestCB);
}

//formats
logpp.addFormat("Basic_Hello", "Hello World!!!");

logpp.addFormat("Basic_HASH", "##");
logpp.addFormat("Basic_HOST", "#host");
logpp.addFormat("Basic_APP", "#app");
logpp.addFormat("Basic_MODULE", "#module");
logpp.addFormat("Basic_SOURCE", "#source");
logpp.addFormat("Basic_WALLCLOCK", "#wallclock");
logpp.addFormat("Basic_TIMESTAMP", "#timestamp");
logpp.addFormat("Basic_CALLBACK", "#callback");
logpp.addFormat("Basic_REQUEST", "#request");

logpp.addFormat("Basic_PERCENT", "Hello %%");
logpp.addFormat("Basic_Bool", "%{0:b}");
logpp.addFormat("Basic_Number", "%{0:n}");
logpp.addFormat("Basic_String", "%{0:s}");
logpp.addFormat("Basic_DateISO", "%{0:di}");
logpp.addFormat("Basic_DateUTC", "%{0:du}");
logpp.addFormat("Basic_DateLocal", "%{0:dl}");
logpp.addFormat("Basic_General", "%{0:s}");
logpp.addFormat("Basic_Object", "%{0:o}");
logpp.addFormat("Basic_Array", "%{0:a}");

const basictests = [
    { fmt: "Basic_Hello", arg: undefined, oktest: (res) => res === "Hello World!!!" },

    { fmt: "Basic_HASH", arg: undefined, oktest: (res) => res === "#" },
    { fmt: "Basic_HOST", arg: undefined, oktest: (res) => res === os.hostname() },
    { fmt: "Basic_APP", arg: undefined, oktest: (res) => res === __filename.toString() },
    { fmt: "Basic_MODULE", arg: undefined, oktest: (res) => res === "basic" },
    { fmt: "Basic_SOURCE", arg: undefined, oktest: (res) => res === __filename.toString() + ":10:15" },
    { fmt: "Basic_WALLCLOCK", arg: undefined, oktest: (res) => !Number.isNaN(Date.parse(res)) && (new Date() - Date.parse(res)) >= 0 },
    { fmt: "Basic_TIMESTAMP", arg: undefined, oktest: (res) => res === "0" },
    { fmt: "Basic_TIMESTAMP", arg: undefined, oktest: (res) => res === "1" },
    { fmt: "Basic_CALLBACK", arg: undefined, oktest: (res) => res === "-1" },
    { fmt: "Basic_REQUEST", arg: undefined, oktest: (res) => res === "-1" },

    { fmt: "Basic_PERCENT", arg: undefined, oktest: (res) => res === "Hello %" },
    { fmt: "Basic_Bool", arg: true, oktest: (res) => res === "true" },
    { fmt: "Basic_Bool", arg: false, oktest: (res) => res === "false" },
    { fmt: "Basic_Number", arg: 1, oktest: (res) => res === "1" },
    { fmt: "Basic_Number", arg: 323.86, oktest: (res) => res === "323.86" },
    { fmt: "Basic_Number", arg: -11.11, oktest: (res) => res === "-11.11" },
    { fmt: "Basic_Number", arg: NaN, oktest: (res) => res === "NaN" },
    { fmt: "Basic_Number", arg: Infinity, oktest: (res) => res === "Infinity" },
    { fmt: "Basic_String", arg: "ok", oktest: (res) => res === "\"ok\"" },
    { fmt: "Basic_String", arg: "", oktest: (res) => res === "\"\"" },
    { fmt: "Basic_String", arg: "\n", oktest: (res) => res === "\"\\n\"" },
    { fmt: "Basic_String", arg: "the quick brown fox", oktest: (res) => res === "\"the quick brown fox\"" },
    { fmt: "Basic_DateISO", arg: new Date(), oktest: (res) => !Number.isNaN(Date.parse(res.substring(1, res.length - 1))) && (new Date() - Date.parse(res.substring(1, res.length - 1))) >= 0 && res.endsWith("Z\"") },
    { fmt: "Basic_DateUTC", arg: new Date(), oktest: (res) => !Number.isNaN(Date.parse(res)) && (new Date() - Date.parse(res)) >= 0 && res.endsWith("GMT\"") },
    { fmt: "Basic_DateLocal", arg: new Date(), oktest: (res) => !Number.isNaN(Date.parse(res)) && (new Date() - Date.parse(res)) >= 0 },

    { fmt: "Basic_General", arg: undefined, oktest: (res) => res === "undefined" },
    { fmt: "Basic_General", arg: null, oktest: (res) => res === "null" },
    { fmt: "Basic_General", arg: true, oktest: (res) => res === "true" },
    { fmt: "Basic_General", arg: 1, oktest: (res) => res === "1" },
    { fmt: "Basic_General", arg: "Yo", oktest: (res) => res === "\"Yo\"" },
    { fmt: "Basic_General", arg: new Date(), oktest: (res) => !Number.isNaN(Date.parse(res.substring(1, res.length - 1))) && (new Date() - Date.parse(res.substring(1, res.length - 1))) >= 0 && res.endsWith("Z\"") },
    { fmt: "Basic_General", arg: () => 3, oktest: (res) => res === "[Function]" },
    { fmt: "Basic_General", arg: Symbol("ok"), oktest: (res) => res === "<Value>" },
];

const basicfailuretests = [
    { fmt: "Basic_NOT_DEFINED", arg: undefined, oktest: (msg) => msg === "Format name is not defined for this logger -- Basic_NOT_DEFINED" }
];


process.stdout.write("Starting test runs...\n");
basicTestRunner(() => {
    process.stdout.write("\nAll tests done!");
});

/*
const start1 = new Date();
for (let i = 0; i < 50000; ++i) {
    logpp.info("Fixed_Hello");
    //logpp.info(logpp.Fixed_Hello);
}
const end1 = new Date();
console.log(`Total log time = ${end1 - start1}`);
*/
/*
const start2 = new Date();
logpp.emitFullLogSync();

const data = logpp.__diagnosticOutput();
console.log(data);
const end2 = new Date();
console.log(`Total emit time = ${end2 - start2}`);

const startc = new Date();
for (let i = 0; i < 50000; ++i) {
    console.log("Fixed_Hello");
}
const endc = new Date();
console.log(`Total console time = ${endc - startc}`);
*/
