//foo.js
const logfoo = require("logpp")("foo");
logfoo.addFormat("Hello2", "Hello2 %s");

function doit() {
    logfoo.info(logfoo.$Hello2, "foo.js");
}

logfoo.setOutputLevel(logfoo.Levels.TRACE);
module.exports.doit = doit;
