"use strict";

const specifier = require("./format_specifier");
const processor = require("./msg_processor");
const formatters = require("./msg_formatter");
const transporters = require("./log_transport");


/**
 * Check if the message is enabled at the given level an category
 * @function
 * @param {number} level the level of the message
 * @param {string} category the category of the message
 * @param {number} enabledLevel the logging level we want to retain
 * @param {Object} enabledCategories the logging category we want to see if is enabled
 * @returns {bool}
 */
function isLoggingEnabledFor(level, category, enabledLevel, enabledCategories) {
    return ((level & enabledLevel) === level) && enabledCategories[category];
}

/**
 * Log a message into the logger -- specialized for NOP
 */
function doMsgLog_NOP(level, category, fmt, ...args) { }

/**
 * Constructor for the RootLogger
 * @constructor
 * @param {string} appName name of the root module (application)
 * @param {string} ip the ip address of the host
 */
function LoggerFactory(appName, ip) {
    //Since this will be exposed to the user we want to protect the state from accidental modification.
    //This state is common to all loggers and will be shared.
    const m_env = {
        IP: ip,
        APP: appName,
        MODULE: appName,
        TIMESTAMP: 0,
        CALLBACK: -1,
        REQUEST: -1
    };

    //True if we want to include a standard prefix on each log message
    const m_doPrefix = true;

    //Blocklists containing the information logged into memory and pending to write out
    const m_memoryBlockList = new processor.BlockList();
    const m_writeBlockList = new processor.BlockList();

    //Manage the format of data and processing into a transport
    //
    //TODO: These functions need to do load balancing and nice recovery but for now we just do something really simple
    //

    //Indicates if we have already scheduled writes from the log
    let m_writesScheduled = false;

    const m_writeGroupSize = 20;
    const m_writeCount = 100;
    const m_writeTimeLimit = 10;
    const m_writeWaitTime = 50;

    const processentriescb = (maxtime, maxentries) => {
        const starttime = Date.now();
        let remainentries = maxentries;
        let donework = false;
        let waitflush = false;
        let timelimit = false;
        while (!donework && !waitflush && !timelimit) {
            donework = !m_writeBlockList.emitKEntries(m_formatter, m_doPrefix, m_writeGroupSize);
            if (!donework) {
                remainentries -= m_writeGroupSize;
            }

            const dataBlock = m_formatter.unlinkData();
            waitflush = !m_transport.writeData(dataBlock);

            timelimit = (Date.now() - starttime) >= maxtime;
        }

        if (donework) {
            m_writesScheduled = false;
        }
        else {
            const etime = Date.now() - starttime;
            const nmaxtime = Math.max(maxtime - etime, m_writeTimeLimit / 2);
            const nmaxentries = Math.max(remainentries, m_writeCount / 2);

            if (timelimit) {
                m_writesScheduled = true;
                setTimeout(() => processentriescb(nmaxtime, nmaxentries), m_writeWaitTime);
            }

            if (waitflush) {
                m_writesScheduled = true;
                m_transport.setReadyCallback(() => processentriescb(nmaxtime, nmaxentries));
            }
        }
    };

    const transporterrorcb = (err) => {
        console.error("Error in transport" + err);
    };

    let m_formatter = new formatters.JSONFormatter();
    let m_transport = new transporters.ConsoleTransport(transporterrorcb);

    /**
     * Create a logger for a given module
     * @method
     * @param {string} moduleName name of the module this is defined for
     * @param {Object} memoryLevel the level to write into memory log
     * @param {Object} writeLevel the level to write into the stable storage writer
     */
    this.createLogger = function (moduleName, memoryLevel, writeLevel) {
        return new Logger(moduleName, memoryLevel, writeLevel);
    };

    //////////
    //Define the actual logger class that gets created for each module require

    /**
    * Constructor for a Logger
    * @constructor
    * @param {string} moduleName name of the module this is defined for
    * @param {Object} memoryLevel the level to write into memory log
    * @param {Object} writeLevel the level to write into the stable storage writer
    */
    function Logger(moduleName, memoryLevel, writeLevel) {
        let m_memoryLogLevel = memoryLevel;
        let m_writeLogLevel = writeLevel;

        //all the formats we know about string -> MsgFormat Object
        const m_formatInfo = new Map();

        const m_macroInfo = Object.create(m_globalMacroInfo);
        m_macroInfo.MODULE_NAME = moduleName;

        /**
        * After logging a message see if we need to queue an emit action and, if so, get it ready
        */
        function checkAndQueueEmit() {
            if (m_emitPending) {
                return;
            }
            m_emitPending = true;

            //TODO: temp set for immediate emit
            m_memoryBlockList.processMsgsForWrite(m_writeLogLevel, m_writeBlockList, true);
            m_emitter.emitBlockList(m_writeBlockList);
            m_emitPending = false;
            /*
            process.nextTick(function () {
                m_memoryBlockList.processMsgsForWrite(m_writeLogLevel, m_writeBlockList, true);
                m_emitter.emitBlockList(m_writeBlockList);
                m_emitPending = false;
            });
            */
        }

        /**
         * Update the logical time/requestId/callbackId/etc.
         */
        this.incrementLogicalTime = function () { m_globalMacroInfo.LOGICAL_TIME++; }

        this.getCurrentRequestId = function () { return m_globalMacroInfo.REQUEST_ID; }
        this.setCurrentRequestId = function (requestId) { m_globalMacroInfo.REQUEST_ID = requestId; }

        this.getCurrentCallbackId = function () { return m_globalMacroInfo.CALLBACK_ID; }
        this.setCurrentCallbackId = function (callbackId) { m_globalMacroInfo.CALLBACK_ID = callbackId; }

        /**
         * Add a new format to the format map
         */
        this.addFormat = function (fmtName, fmtInfo) {
            try {
                const fmtObj = extractMsgFormat(fmtName, fmtInfo);
                m_formatInfo.set(fmtName, fmtObj);
            }
            catch (ex) {
                process.stderr.write('Hard failure in format extract -- ' + ex.toString() + '\n');
            }
        }

        /**
         * TODO: add prefix (or postfix) formatters which will be inserted in all writes.
         * Support macro only as well as general options -- macro only are nice since uses don't need to pass other args
         */

        /**
         * Generate a function that logs at the given level
         */
        function getMsgLogWLevelGenerator(desiredLevel) {
            const fixedLevel = desiredLevel;
            return function (fmt, ...args) {
                try {
                    const fmti = m_formatInfo.get(fmt);
                    if (fmti === undefined) {
                        throw new Error('Format name is not defined for this logger: ' + fmt);
                    }

                    m_memoryBlockList.logMessage(m_macroInfo, fixedLevel, fmti, args);
                    checkAndQueueEmit();
                }
                catch (ex) {
                    process.stderr.write('Hard failure in logging -- ' + ex.toString() + '\n');
                }
            }
        }

        /**
         * Log a messages at various levels.
         */
        this.fatal = isLevelEnabledForLogging(LoggingLevels.FATAL, m_memoryLogLevel) ? getMsgLogWLevelGenerator(LoggingLevels.FATAL) : doMsgLog_NOP;
        this.error = isLevelEnabledForLogging(LoggingLevels.ERROR, m_memoryLogLevel) ? getMsgLogWLevelGenerator(LoggingLevels.ERROR) : doMsgLog_NOP;
        this.warn = isLevelEnabledForLogging(LoggingLevels.WARN, m_memoryLogLevel) ? getMsgLogWLevelGenerator(LoggingLevels.WARN) : doMsgLog_NOP;
        this.info = isLevelEnabledForLogging(LoggingLevels.INFO, m_memoryLogLevel) ? getMsgLogWLevelGenerator(LoggingLevels.INFO) : doMsgLog_NOP;
        this.debug = isLevelEnabledForLogging(LoggingLevels.DEBUG, m_memoryLogLevel) ? getMsgLogWLevelGenerator(LoggingLevels.DEBUG) : doMsgLog_NOP;
        this.trace = isLevelEnabledForLogging(LoggingLevels.TRACE, m_memoryLogLevel) ? getMsgLogWLevelGenerator(LoggingLevels.TRACE) : doMsgLog_NOP;

        /**
         * TODO: add conditional versions of these (e.g. traceIf(pred, fmt, args))
         */

        /**
         * TODO: add blocking verions of these (write immediately or do a DEBUG vs RELEASE macro thing?)
         */

        /**
        * Synchronously emit the in memory log to the specified writer for failure notification
        * @method
        * @param {Object} writer the writer we use to emit the log info into
        */
        this.emitLogOnIssueNotify = function (writer) {
            try {
                const blockList = new BlockList();
                m_memoryBlockList.processMsgsForWrite(LoggingLevels.ALL, blockList, false);

                const emitter = new Emitter(writer);
                emitter.processLoop();
            }
            catch (ex) {
                process.stderr.write('Hard failure in emit on issue notify -- ' + ex.toString() + '\n');
            }
        }

        /**
        * Set the writer to a new output (only effective on root logger)
        * @method
        * @param {Object} writer the writer we use to emit the log info into
        * @returns {bool} true if this is the root logger and output method was updated and false otherwise
        */
        this.updateEmitMethod = function (writer) {
            try {
                if (s_rootLogger === this) {
                    return m_emitter.updateWriter(writer);
                }
                else {
                    return false;
                }
            }
            catch (ex) {
                process.stderr.write('Hard failure in update emit method -- ' + ex.toString() + '\n');
                return false;
            }
        }

        /**
        * Explicitly allow a specifc sub-logger to control output levels
        * @method
        * @param {string} subloggerName the name of the sub-logger to enable
        * @returns {bool} true if this is the root logger and sub-logger was updated and false otherwise
        */
        this.enableSubLogger = function (subloggerName) {
            try {
                if (s_rootLogger === this) {
                    s_enabledSubLoggerNames.add(subloggerName);
                    return true;
                }
                else {
                    return false;
                }
            }
            catch (ex) {
                process.stderr.write('Hard failure in update sublogger state -- ' + ex.toString() + '\n');
                return false;
            }
        }

        /**
        * Explicitly suppress output from a specifc sub-logger
        * @method
        * @param {string} subloggerName the name of the sub-logger to enable
        * @returns {bool} true if this is the root logger and sub-logger was updated and false otherwise
        */
        this.disableSublogger = function (subloggerName) {
            try {
                if (s_rootLogger === this) {
                    s_disabledSubLoggerNames.add(subloggerName);
                    return true;
                }
                else {
                    return false;
                }
            }
            catch (ex) {
                process.stderr.write('Hard failure in update sublogger state -- ' + ex.toString() + '\n');
                return false;
            }
        }
    }
}

/////////////////////////////
//Code for creating and managing the logging system

/**
 * Global variables for the logger factor and root logger -- lazily instantiated
 */
let s_loggerFactory = null;
let s_rootLogger = null;

/**
 * Set of module names that are enabled for sub-logging (or expliscitly suppressed)
 */
const s_enabledSubLoggerNames = new Set();
const s_disabledSubLoggerNames = new Set();

/**
 * Map of the loggers created for various module names
 */
const s_loggerMap = new Map();

/**
 * Logger constructor function.
 * @exports
 * @function
 * @param {string} name of the logger object to construct (calls with the same name will return an aliased logger object)
 * @param {string} memoryLevel is the level to log into the high performance rung buffer
 * @param {string} writeLevel is the level to log out to to stable storage
 */
module.exports = function (name, memoryLevel, writeLevel) {
    if (memoryLevel.enum < writeLevel.enum) {
        //have to at least put it in ring buffer if we want to output it
        memoryLevel = writeLevel;
    }

    let memlevelflag = LoggingLevels[memoryLevel] || LoggingLevels.INFO;
    let writelevelflag = LoggingLevels[writeLevel] || LoggingLevels.WARN;

    //Lazy instantiate the logger factory
    if (s_loggerFactory === null) {
        s_loggerFactory = new LoggerFactory(require.main.filename, require('os').hostname());
    }

    //Get the filename of the caller
    const lfilename = extractUserSourceFile();

    let logger = s_loggerMap.get(name);
    if (!logger) {
        if (require.main.filename !== lfilename) {
            if (!s_enabledSubLoggerNames.has(name)) {
                memlevelflag = s_disabledSubLoggerNames.has(name) ? LoggingLevels.OFF : LoggingLevels.WARN;
                writelevelflag = s_disabledSubLoggerNames.has(name) ? LoggingLevels.OFF : LoggingLevels.ERROR;
            }
        }

        logger = s_loggerFactory.createLogger(name, memlevelflag, writelevelflag);
        if (require.main.filename === lfilename) {
            s_rootLogger = logger;
        }

        s_loggerMap.set(name, logger);
    }

    return logger;
};
