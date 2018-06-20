//app.js
const logapp = require("logpp")("app");
logapp.addFormat("Hello", "Hello %s %j");

const foo = require("./foo");
foo.doit();

logapp.info(logapp.$Hello, "info", {f: 3});
logapp.detail(logapp.$Hello, "detail", {f: 4});

logapp.addFormat("Now", "#walltime");
logapp.info(logapp.$$Perf, logapp.$Now);
logapp.enableCategory("Perf");
logapp.info(logapp.$$Perf, logapp.$Now);
