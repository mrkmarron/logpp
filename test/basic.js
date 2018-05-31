"use strict";

const runner = require("./runner");
const os = require("os");

const logpp = require("../src/logger")("basic", { flushMode: "NOP", prefix: false });

function runSingleTest(test) {
    logpp.info(logpp[test.fmt], ...test.arg);
    return logpp.emitLogSync(true, true).trim();
}

function printTestInfo(test) {
    return `log.info("${test.fmt}", ${test.noprint ? "-skip print-" : JSON.stringify(test.arg)})...`;
}

////
//Basic Formats
logpp.addFormat("Basic_Hello", "Hello World!!!");

logpp.addFormat("Basic_HASH", "##");
logpp.addFormat("Basic_HOST", "#host");
logpp.addFormat("Basic_APP", "#app");
logpp.addFormat("Basic_LOGGER", "#logger");
logpp.addFormat("Basic_SOURCE", "#source");
logpp.addFormat("Basic_WALLCLOCK", "#wallclock");
logpp.addFormat("Basic_TIMESTAMP", "#timestamp");
logpp.addFormat("Basic_CALLBACK", "#callback");
logpp.addFormat("Basic_REQUEST", "#request");

logpp.addFormat("Basic_PERCENT", "Hello %%");
logpp.addFormat("Basic_Bool", "%b");
logpp.addFormat("Basic_Number", "%n");
logpp.addFormat("Basic_String", "%s");
logpp.addFormat("Basic_DateISO", "%di");
logpp.addFormat("Basic_DateLocal", "%dl");
logpp.addFormat("Basic_General", "%j");

logpp.addFormat("Basic_ObjectWDepth", "%j<1,>");
logpp.addFormat("Basic_ArrayWDepth", "%j< 1 , * >");
logpp.addFormat("Basic_ObjectWLength", "%j<,1>");
logpp.addFormat("Basic_ArrayWLength", "%j<*,2>");
logpp.addFormat("Basic_ObjectWDepthLength", "%j<1,1>");
logpp.addFormat("Basic_ArrayWDepthLength", "%j<1,2>");

////
//Compund Formats
logpp.addFormat("Compound_Hello", "%s %s!");
logpp.addFormat("Compound_Hello_APP", "%s from #logger!");
logpp.addFormat("Compound_Object", { name: "%s", msg: "Hello", args: ["#logger", 4, "%b", true] });
logpp.addFormat("Compound_Object_Object", { name: "%s", msg: "Hello", args: [4, "%j", true] });

const basictests = [
    { fmt: "$Basic_Hello", arg: [undefined], oktest: (res) => res === "Hello World!!!" },

    { fmt: "$Basic_HASH", arg: [undefined], oktest: (res) => res === "#" },
    { fmt: "$Basic_HOST", arg: [undefined], oktest: (res) => res === JSON.stringify(os.hostname()) },
    { fmt: "$Basic_APP", arg: [undefined], oktest: (res) => res === JSON.stringify(__filename.toString()) },
    { fmt: "$Basic_LOGGER", arg: [undefined], oktest: (res) => res === JSON.stringify("basic") },
    { fmt: "$Basic_SOURCE", arg: [undefined], oktest: (res) => res === JSON.stringify(__filename.toString() + ":9:11") },
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
    { fmt: "$Basic_DateLocal", arg: [new Date()], oktest: (res) => !Number.isNaN(Date.parse(res)) && (new Date() - Date.parse(res)) >= 0 },

    { fmt: "$Basic_Bool", arg: [3], oktest: (res) => res === "\"<BadFormat>\"" },
    { fmt: "$Basic_Number", arg: ["1"], oktest: (res) => res === "\"<BadFormat>\"" },
    { fmt: "$Basic_String", arg: [1], oktest: (res) => res === "\"<BadFormat>\"" },
    { fmt: "$Basic_DateISO", arg: [101], oktest: (res) => res === "\"<BadFormat>\"" },

    { fmt: "$Basic_General", arg: [undefined], oktest: (res) => res === "undefined" },
    { fmt: "$Basic_General", arg: [null], oktest: (res) => res === "null" },
    { fmt: "$Basic_General", arg: [true], oktest: (res) => res === "true" },
    { fmt: "$Basic_General", arg: [1], oktest: (res) => res === "1" },
    { fmt: "$Basic_General", arg: ["Yo"], oktest: (res) => res === "\"Yo\"" },
    { fmt: "$Basic_General", arg: [new Date()], oktest: (res) => !Number.isNaN(Date.parse(res.substring(1, res.length - 1))) && (new Date() - Date.parse(res.substring(1, res.length - 1))) >= 0 && res.endsWith("Z\"") },
    { fmt: "$Basic_General", arg: [() => 3], oktest: (res) => res === "\"<OpaqueValue>\"" },
    { fmt: "$Basic_General", arg: [Symbol("ok")], oktest: (res) => res === "\"<OpaqueValue>\"" },

    { fmt: "$Basic_General", arg: [{}], oktest: (res) => res === "{}" },
    { fmt: "$Basic_General", arg: [{ p1: 1 }], oktest: (res) => res === "{\"p1\": 1}" },
    { fmt: "$Basic_General", arg: [{ p2: 2, p1: Symbol("ok") }], oktest: (res) => res === "{\"p2\": 2, \"p1\": \"<OpaqueValue>\"}" },
    { fmt: "$Basic_General", arg: [{ p1: 1 }], oktest: (res) => res === "{\"p1\": 1}" },

    { fmt: "$Basic_General", arg: [[]], oktest: (res) => res === "[]" },
    { fmt: "$Basic_General", arg: [[1]], oktest: (res) => res === "[1]" },
    { fmt: "$Basic_General", arg: [[1, true]], oktest: (res) => res === "[1, true]" },
    { fmt: "$Basic_General", arg: [[1]], oktest: (res) => res === "[1]" },

    { fmt: "$Basic_General", arg: [{ x: { p1: 1 }, y: 1 }], oktest: (res) => res === "{\"x\": {\"p1\": 1}, \"y\": 1}" },
    { fmt: "$Basic_General", arg: [{ x: [1], y: 1 }], oktest: (res) => res === "{\"x\": [1], \"y\": 1}" },
    { fmt: "$Basic_General", noprint: true, arg: [(() => { const r = { p1: 2 }; r["r"] = r; return r; })()], oktest: (res) => res === "{\"p1\": 2, \"r\": \"<Cycle>\"}" },

    { fmt: "$Basic_General", arg: [[[1], 2]], oktest: (res) => res === "[[1], 2]" },
    { fmt: "$Basic_General", arg: [[{ p1: 1 }, 2]], oktest: (res) => res === "[{\"p1\": 1}, 2]" },
    { fmt: "$Basic_General", noprint: true, arg: [(() => { const r = [2]; r.push(r); return r; })()], oktest: (res) => res === "[2, \"<Cycle>\"]" },

    { fmt: "$Basic_ObjectWDepth", arg: [{ x: { p1: 1 }, y: 1 }], oktest: (res) => res === "{\"x\": \"{...}\", \"y\": 1}" },
    { fmt: "$Basic_ObjectWDepth", arg: [{ x: [1], y: 1 }], oktest: (res) => res === "{\"x\": \"[...]\", \"y\": 1}" },
    { fmt: "$Basic_ArrayWDepth", arg: [[[2], 1]], oktest: (res) => res === "[\"[...]\", 1]" },
    { fmt: "$Basic_ArrayWDepth", arg: [[{ p1: 2 }, 1]], oktest: (res) => res === "[\"{...}\", 1]" },

    { fmt: "$Basic_ObjectWLength", arg: [{ x: { p1: 1 }, y: 1 }], oktest: (res) => res === "{\"x\": {\"p1\": 1}, \"$rest$\": \"...\"}" },
    { fmt: "$Basic_ArrayWLength", arg: [[[2], 1, 5]], oktest: (res) => res === "[[2], 1, \"...\"]" },

    { fmt: "$Compound_Hello", arg: ["Hello", "World"], oktest: (msg) => msg === "\"Hello\" \"World\"!" },
    { fmt: "$Compound_Hello_APP", arg: ["World"], oktest: (msg) => msg === "\"World\" from \"basic\"!" },
    { fmt: "$Compound_Object", arg: ["Bob", true], oktest: (msg) => msg === "{ \"name\": \"Bob\", \"msg\": \"Hello\", \"args\": [ \"basic\", 4, true, true ] }" },
    { fmt: "$Compound_Object_Object", arg: ["Bob", [3, 4]], oktest: (msg) => msg === "{ \"name\": \"Bob\", \"msg\": \"Hello\", \"args\": [ 4, [3, 4], true ] }" },

    { fmt: "$Basic_String", arg: ["\u00A2"], oktest: (res) => res === "\"\u00A2\"" },
    { fmt: "$Basic_String", arg: ["\u03A9"], oktest: (res) => res === "\"\u03A9\"" },
    { fmt: "$Basic_String", arg: ["\u20AC"], oktest: (res) => res === "\"\u20AC\"" },
    { fmt: "$Compound_Hello", arg: ["\u03A9 stuff", "\u00A2\u00A2"], oktest: (res) => res === "\"\u03A9 stuff\" \"\u00A2\u00A2\"!" },
];

///////////////////////////

const basicRunner = runner.generalSyncRunner(runSingleTest, printTestInfo, basictests, "basic");
basicRunner(() => {
    process.stdout.write("\n");
});
