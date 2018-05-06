"use strict";

const logpp = require("../src/logger")("basic", { flushCount: 1 });


logpp.addFormat("Basic_Hello", "Hello World!!!");
logpp.addFormat("Compound_Hello_APP", "%{0:s} from #module!");

logpp.info(logpp.Formats.$Basic_Hello);
