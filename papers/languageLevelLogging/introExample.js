const logger = require('winston').createLogger({ level: "info" });
logger.add(new winston.transports.File({ filename: '/tmp/logging/app.log' }));

function foo(name, flag) {
    console.log("Hello");
    logger.info("World");
    for (var i = 0; i < 1000; ++i) {
        logger.debug(`Data = ${{ nval: name, cval: i }}`);
        ...
    }

    const ok = check(name, flag);
    logger.info(`check(${name}, ${flag}) is ${ok}`);
    if (!ok) {
        logger.warn("Error ...");
    }
}