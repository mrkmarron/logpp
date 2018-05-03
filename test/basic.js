"use strict";

const os = require("os");
const chalk = require("chalk");

const logpp = require("../src/logger")("basic", { flushMode: "NOP" });

function basicTestRunner(nextcb) {
    function runSingleTest(test) {
        logpp.info(logpp.Formats[test.fmt], ...test.arg);
        return logpp.emitFullLogSync(false).trim();
    }

    let basictestsRun = 0;
    let basictestsFailed = 0;

    function runSingleTestCB() {
        const test = basictests[basictestsRun++];
        try {
            process.stdout.write(`log.info("${test.fmt}", ${test.noprint ? "-skip print-" : JSON.stringify(test.arg)})...`);
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

///////////////////////////

////
//Basic Formats
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
logpp.addFormat("Basic_General", "%{0:g}");
logpp.addFormat("Basic_Object", "%{0:o}");
logpp.addFormat("Basic_Array", "%{0:a}");

logpp.addFormat("Basic_ObjectWDepth", "%{0:o<1,>}");
logpp.addFormat("Basic_ArrayWDepth", "%{0:a< 1 , * >}");
logpp.addFormat("Basic_ObjectWLength", "%{0:o<,1>}");
logpp.addFormat("Basic_ArrayWLength", "%{0:a<*,2>}");
logpp.addFormat("Basic_ObjectWDepthLength", "%{0:o<1,1>}");
logpp.addFormat("Basic_ArrayWDepthLength", "%{0:a<1,2>}");

////
//Compund Formats
logpp.addFormat("Compound_Hello", "%{0:s} %{1:s}!");
logpp.addFormat("Compound_Hello_APP", "%{0:s} from #module!");
logpp.addFormat("Compound_Object", { name: "%{0:s}", msg: "Hello", args: ["#module", 4, "%{1:b}", true] });
logpp.addFormat("Compound_Object_Object", { name: "%{0:s}", msg: "Hello", args: [4, "%{1:g}", true] });

const basictests = [
    { fmt: "$Basic_Hello", arg: [undefined], oktest: (res) => res === "Hello World!!!" },

    { fmt: "$Basic_HASH", arg: [undefined], oktest: (res) => res === "#" },
    { fmt: "$Basic_HOST", arg: [undefined], oktest: (res) => res === JSON.stringify(os.hostname()) },
    { fmt: "$Basic_APP", arg: [undefined], oktest: (res) => res === JSON.stringify(__filename.toString()) },
    { fmt: "$Basic_MODULE", arg: [undefined], oktest: (res) => res === JSON.stringify("basic") },
    { fmt: "$Basic_SOURCE", arg: [undefined], oktest: (res) => res === JSON.stringify(__filename.toString() + ":10:15") },
    { fmt: "$Basic_WALLCLOCK", arg: [undefined], oktest: (res) => !Number.isNaN(Date.parse(res.substring(1, res.length - 1))) && (new Date() - Date.parse(res.substring(1, res.length - 1))) >= 0 && res.endsWith("Z\"") },
    { fmt: "$Basic_TIMESTAMP", arg: [undefined], oktest: (res) => res === "0" },
    { fmt: "$Basic_TIMESTAMP", arg: [undefined], oktest: (res) => res === "1" },
    { fmt: "$Basic_CALLBACK", arg: [undefined], oktest: (res) => res === "-1" },
    { fmt: "$Basic_REQUEST", arg: [undefined], oktest: (res) => res === "-1" },

    { fmt: "$Basic_PERCENT", arg: [undefined], oktest: (res) => res === "Hello %" },
    { fmt: "$Basic_Bool", arg: [true], oktest: (res) => res === "true" },
    { fmt: "$Basic_Bool", arg: [false], oktest: (res) => res === "false" },
    { fmt: "$Basic_Number", arg: [1], oktest: (res) => res === "1" },
    { fmt: "$Basic_Number", arg: [323.86], oktest: (res) => res === "323.86" },
    { fmt: "$Basic_Number", arg: [-11.11], oktest: (res) => res === "-11.11" },
    { fmt: "$Basic_Number", arg: [NaN], oktest: (res) => res === "null" },
    { fmt: "$Basic_Number", arg: [Infinity], oktest: (res) => res === "null" },
    { fmt: "$Basic_String", arg: ["ok"], oktest: (res) => res === "\"ok\"" },
    { fmt: "$Basic_String", arg: [""], oktest: (res) => res === "\"\"" },
    { fmt: "$Basic_String", arg: ["\n"], oktest: (res) => res === "\"\\n\"" },
    { fmt: "$Basic_String", arg: ["the quick brown fox"], oktest: (res) => res === "\"the quick brown fox\"" },
    { fmt: "$Basic_DateISO", arg: [new Date()], oktest: (res) => !Number.isNaN(Date.parse(res.substring(1, res.length - 1))) && (new Date() - Date.parse(res.substring(1, res.length - 1))) >= 0 && res.endsWith("Z\"") },
    { fmt: "$Basic_DateUTC", arg: [new Date()], oktest: (res) => !Number.isNaN(Date.parse(res)) && (new Date() - Date.parse(res)) >= 0 && res.endsWith("GMT\"") },
    { fmt: "$Basic_DateLocal", arg: [new Date()], oktest: (res) => !Number.isNaN(Date.parse(res)) && (new Date() - Date.parse(res)) >= 0 },

    { fmt: "$Basic_Bool", arg: [3], oktest: (res) => res === "\"<BadFormat>\"" },
    { fmt: "$Basic_Number", arg: ["1"], oktest: (res) => res === "\"<BadFormat>\"" },
    { fmt: "$Basic_String", arg: [1], oktest: (res) => res === "\"<BadFormat>\"" },
    { fmt: "$Basic_DateISO", arg: [101], oktest: (res) => res === "\"<BadFormat>\"" },
    { fmt: "$Basic_DateUTC", arg: ["Tuesday"], oktest: (res) => res === "\"<BadFormat>\"" },

    { fmt: "$Basic_General", arg: [undefined], oktest: (res) => res === "undefined" },
    { fmt: "$Basic_General", arg: [null], oktest: (res) => res === "null" },
    { fmt: "$Basic_General", arg: [true], oktest: (res) => res === "true" },
    { fmt: "$Basic_General", arg: [1], oktest: (res) => res === "1" },
    { fmt: "$Basic_General", arg: ["Yo"], oktest: (res) => res === "\"Yo\"" },
    { fmt: "$Basic_General", arg: [new Date()], oktest: (res) => !Number.isNaN(Date.parse(res.substring(1, res.length - 1))) && (new Date() - Date.parse(res.substring(1, res.length - 1))) >= 0 && res.endsWith("Z\"") },
    { fmt: "$Basic_General", arg: [() => 3], oktest: (res) => res === "\"<OpaqueValue>\"" },
    { fmt: "$Basic_General", arg: [Symbol("ok")], oktest: (res) => res === "\"<OpaqueValue>\"" },

    { fmt: "$Basic_Object", arg: [{}], oktest: (res) => res === "{}" },
    { fmt: "$Basic_Object", arg: [{ p1: 1 }], oktest: (res) => res === "{\"p1\": 1}" },
    { fmt: "$Basic_Object", arg: [{ p2: 2, p1: Symbol("ok") }], oktest: (res) => res === "{\"p2\": 2, \"p1\": \"<OpaqueValue>\"}" },
    { fmt: "$Basic_General", arg: [{ p1: 1 }], oktest: (res) => res === "{\"p1\": 1}" },

    { fmt: "$Basic_Array", arg: [[]], oktest: (res) => res === "[]" },
    { fmt: "$Basic_Array", arg: [[1]], oktest: (res) => res === "[1]" },
    { fmt: "$Basic_Array", arg: [[1, true]], oktest: (res) => res === "[1, true]" },
    { fmt: "$Basic_General", arg: [[1]], oktest: (res) => res === "[1]" },

    { fmt: "$Basic_Object", arg: [{ x: { p1: 1 }, y: 1 }], oktest: (res) => res === "{\"x\": {\"p1\": 1}, \"y\": 1}" },
    { fmt: "$Basic_Object", arg: [{ x: [1], y: 1 }], oktest: (res) => res === "{\"x\": [1], \"y\": 1}" },
    { fmt: "$Basic_Object", noprint: true, arg: [(() => { const r = { p1: 2 }; r["r"] = r; return r; })()], oktest: (res) => res === "{\"p1\": 2, \"r\": \"<Cycle>\"}" },

    { fmt: "$Basic_Array", arg: [[[1], 2]], oktest: (res) => res === "[[1], 2]" },
    { fmt: "$Basic_Array", arg: [[{ p1: 1 }, 2]], oktest: (res) => res === "[{\"p1\": 1}, 2]" },
    { fmt: "$Basic_Array", noprint: true, arg: [(() => { const r = [2]; r.push(r); return r; })()], oktest: (res) => res === "[2, \"<Cycle>\"]" },

    { fmt: "$Basic_ObjectWDepth", arg: [{ x: { p1: 1 }, y: 1 }], oktest: (res) => res === "{\"x\": \"{...}\", \"y\": 1}" },
    { fmt: "$Basic_ObjectWDepth", arg: [{ x: [1], y: 1 }], oktest: (res) => res === "{\"x\": \"[...]\", \"y\": 1}" },
    { fmt: "$Basic_ArrayWDepth", arg: [[[2], 1]], oktest: (res) => res === "[\"[...]\", 1]" },
    { fmt: "$Basic_ArrayWDepth", arg: [[{ p1: 2 }, 1]], oktest: (res) => res === "[\"{...}\", 1]" },

    { fmt: "$Basic_ObjectWLength", arg: [{ x: { p1: 1 }, y: 1 }], oktest: (res) => res === "{\"x\": {\"p1\": 1}, \"$rest$\": \"...\"}" },
    { fmt: "$Basic_ArrayWLength", arg: [[[2], 1, 5]], oktest: (res) => res === "[[2], 1, \"...\"]" },

    { fmt: "$Compound_Hello", arg: ["Hello", "World"], oktest: (msg) => msg === "\"Hello\" \"World\"!" },
    { fmt: "$Compound_Hello_APP", arg: ["World"], oktest: (msg) => msg === "\"World\" from \"basic\"!" },
    { fmt: "$Compound_Object", arg: ["Bob", true], oktest: (msg) => msg === "{ \"args\": [ \"basic\", 4, true, true ], \"msg\": \"Hello\", \"name\": \"Bob\" }" },
    { fmt: "$Compound_Object_Object", arg: ["Bob", [3, 4]], oktest: (msg) => msg === "{ \"args\": [ 4, [3, 4], true ], \"msg\": \"Hello\", \"name\": \"Bob\" }" }
];

///////////////////////////

basicTestRunner(() => {
    process.stdout.write("\nAll tests done!");
});
