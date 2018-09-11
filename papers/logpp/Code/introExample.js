const dest = fs.createWriteStream("/tmp/logging/app.log");
const logger = require('pino')(dest, { level: "info" });

function foo(name, flag) {
    console.log("Hello");
    logger.info("World");
    for (var i = 0; i < 1000; ++i) {
        logger.debug("Data = " + JSON.stringify({ nval: name, cval: i }));
        ...
    }

    const ok = check(name, flag);
    logger.info("check(%s, %b) is %b)", name, flag, ok);
    if (!ok) {
        logger.warn("Error ...");
    }
}