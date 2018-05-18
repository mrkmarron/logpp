"use strict";

//const dfile = require("fs").openSync("C:\\Users\\markm\\Desktop\\logtrace.txt", "w");
//, enableDiagnosticLog: true, diagnosticLogFile: dfile

const wstream = require("fs").createWriteStream("./test/scratchlog.txt");
const logpp = require("../src/logger")("basic", { flushCount: 1, flushMode: "ASYNC", flushTarget: "stream", stream: wstream });

logpp.addFormat("Basic_Hello", "Hello World!!!");
logpp.addFormat("Compound_Hello_APP", "%s from #module!");

logpp.info(logpp.$Basic_Hello);
