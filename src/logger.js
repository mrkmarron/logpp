"use strict";

const core = require("./core");
const specifier = require("./format_specifier");
const processor = require("./msg_processor");
const formatters = require("./msg_formatter");
const transporters = require("./log_transport");

const scheduler = require("./scheduler").createScheduler(250, 50);

//number of elements to stringify into write buffer at a time
const m_writeGroupSize = 20;

function isLevelEnabledForLogging(targetLevel, actualLevel) {
    return (targetLevel & actualLevel) === actualLevel;
}

//Special NOP implementations for disabled levels of logging
function doMsgLog_NOP(fmt, ...args) { }
function doMsgLogCategory_NOP(category, fmt, ...args) { }
function doMsgLogCond_NOP(cond, fmt, ...args) { }
function doMsgLogCategoryCond_NOP(cond, fmt, ...args) { }

/**
 * Constructor for the RootLogger
 * @constructor
 * @param {string} appName name of the root module (application)
 * @param {string} ip the ip address of the host
 */
function LoggerFactory(appName, ip) {
    //Since this will be exposed to the user we want to protect the state from accidental modification.
    //This state is common to all loggers and will be shared.
    const m_globalenv = {
        IP: ip,
        APP: appName,
        TIMESTAMP: 0,
        CALLBACK: -1,
        REQUEST: -1
    };

    //True if we want to include a standard prefix on each log message
    const m_doPrefix = true;

    //Blocklists containing the information logged into memory and pending to write out
    const m_memoryBlockList = new processor.BlockList();
    const m_writeBlockList = new processor.BlockList();

    let m_retainLevel = core.LoggingLevels.WARN;
    let m_retainCategories = { "default": true };

    let m_doTimeLimit = true;
    let m_maxBufferTime = 1000;
    let m_maxBufferSize = 8192;

    const processentriescb = () => {
        const starttime = Date.now();

        let donework = false;
        let waitflush = false;
        let timelimit = false;

        try {
            if (m_doTimeLimit) {
                m_memoryBlockList.processMessagesForWrite_TimeRing(m_retainLevel, m_retainCategories, m_writeBlockList, m_maxBufferTime);
            }
            else {
                m_memoryBlockList.processMessagesForWrite_SizeRing(m_retainLevel, m_retainCategories, m_writeBlockList, m_maxBufferSize);
            }

            while (!donework && !waitflush && !timelimit) {
                donework = !m_writeBlockList.emitKEntries(m_formatter, m_doPrefix, m_writeGroupSize);

                const dataBlock = m_formatter.unlinkData();
                waitflush = !m_transport.writeData(dataBlock);

                timelimit = (Date.now() - starttime) >= scheduler.getMaxProcessingTime();
            }
        }
        catch (ex) {
            console.error("Filed in log write with -- " + ex.toString());
        }

        //
        //TODO: Right now we could have our processing list grow without bound which is not cool.
        //      Also our scheduler is a simple controller that will over/under shoot or hunt if stressed.
        //

        if (donework) {
            scheduler.wait();
        }
        else if (waitflush) {
            scheduler.waitOnIO();
            m_transport.setReadyCallback(processentriescb);
        }
        else {
            scheduler.waitOnProcessing();
            setTimeout(processentriescb, scheduler.getCurrentSchedulingWait());
        }
    };

    const transporterrorcb = (err) => {
        console.error("Error in transport -- " + err.toString());
    };

    let m_formatter = new formatters.JSONFormatter();
    let m_transport = new transporters.ConsoleTransport(transporterrorcb);

    /**
     * Create a logger for a given module
     * @method
     * @param {string} moduleName name of the module this is defined for
     * @param {Object} options the options for this logger
     */
    this.createLogger = function (moduleName, options) {
        return new Logger(moduleName, options);
    };

    //////////
    //Define the actual logger class that gets created for each module require

    /**
    * Constructor for a Logger
    * @constructor
    * @param {string} moduleName name of the module this is defined for
    * @param {Object} options the options for this logger
    */
    function Logger(moduleName, options) {
        //All the formats we know about string -> MsgFormat Object
        const m_formatInfo = new Map();

        //Level that this logger will record at going into memory
        let m_memoryLogLevel = options.memoryLogLevel;
        const m_enabledCategories = options.enabledCategories;

        const m_env = {
            globalEnv: m_globalenv,
            MODULE: moduleName
        };

        /**
         * Get the logging level for this logger
         */
        this.getLoggingLevel = function () {
            return m_memoryLogLevel;
        };

        /**
         * Get the logging categories enabled for this logger
         */
        this.getEnabledCategories = function () {
            return m_enabledCategories;
        };

        /**
         * Set the logging level for this logger
         * @param {number} logLevel
         */
        this.setLoggingLevel = function (logLevel) {
            if (s_rootLogger !== this) {
                const enabledlevel = s_enabledSubLoggerNames.get(moduleName);
                logLevel = enabledlevel !== undefined ? enabledlevel : s_defaultSubLoggerLevel;
            }

            m_memoryLogLevel = logLevel;
            updateLoggingFunctions(this, m_memoryLogLevel);
        };

        /**
         * Enable the given category of log messages
         * @param {string} category the category of messages to enable
         */
        this.enableLoggingCategory = function (category) {
            m_enabledCategories[category] = true;
        };

        /**
         * Disable the given category of log messages
         * @param {string} category the category of messages to disable
         */
        this.disableLoggingCategory = function (category) {
            m_enabledCategories[category] = false;
        };

        /**
         * Update the logical time/requestId/callbackId/etc.
         */
        this.incrementLogicalTime = function () { m_globalenv.TIMESTAMP++; };

        this.getCurrentRequestId = function () { return m_globalenv.REQUEST; };
        this.setCurrentRequestId = function (requestId) { m_globalenv.REQUEST = requestId; };

        this.getCurrentCallbackId = function () { return m_globalenv.CALLBACK; };
        this.setCurrentCallbackId = function (callbackId) { m_globalenv.CALLBACK = callbackId; };

        /**
         * Add a new format to the format map
         */
        this.addFormat = function (fmtName, fmtInfo) {
            try {
                const fmtObj = specifier.extractMsgFormat(fmtName, fmtInfo);
                m_formatInfo.set(fmtName, fmtObj);
            }
            catch (ex) {
                console.error("Hard failure in format extract -- " + ex.toString());
            }
        };

        /**
         * TODO: add prefix (or postfix) formatters which will be inserted in all writes.
         * Support macro only as well as general options -- macro only are nice since uses don't need to pass other args
         */

        function getMsgLogWLevelGenerator(desiredLevel) {
            const fixedLevel = desiredLevel;
            return function (fmt, ...args) {
                try {
                    const fmti = m_formatInfo.get(fmt);
                    if (fmti === undefined) {
                        console.error("Format name is not defined for this logger -- " + fmt);
                    }

                    m_memoryBlockList.logMessage(m_env, fixedLevel, "default", m_doTimeLimit, fmti, args);
                    if (scheduler.notify()) {
                        setTimeout(processentriescb, scheduler.getCurrentSchedulingWait());
                    }
                }
                catch (ex) {
                    console.error("Hard failure in logging -- " + ex.toString());
                }
            };
        }

        function getMsgLogWLevelGeneratorCategory(desiredLevel) {
            const fixedLevel = desiredLevel;
            return function (category, fmt, ...args) {
                try {
                    if (m_enabledCategories[category]) {
                        const fmti = m_formatInfo.get(fmt);
                        if (fmti === undefined) {
                            console.error("Format name is not defined for this logger -- " + fmt);
                        }

                        m_memoryBlockList.logMessage(m_env, fixedLevel, category, m_doTimeLimit, fmti, args);
                        if (scheduler.notify()) {
                            setTimeout(processentriescb, scheduler.getCurrentSchedulingWait());
                        }
                    }
                }
                catch (ex) {
                    console.error("Hard failure in logging -- " + ex.toString());
                }
            };
        }

        function getMsgLogWLevelGeneratorCond(desiredLevel) {
            const fixedLevel = desiredLevel;
            return function (cond, fmt, ...args) {
                if (cond) {
                    try {
                        const fmti = m_formatInfo.get(fmt);
                        if (fmti === undefined) {
                            console.error("Format name is not defined for this logger -- " + fmt);
                        }

                        m_memoryBlockList.logMessage(m_env, fixedLevel, "default", m_doTimeLimit, fmti, args);
                        if (scheduler.notify()) {
                            setTimeout(processentriescb, scheduler.getCurrentSchedulingWait());
                        }
                    }
                    catch (ex) {
                        console.error("Hard failure in logging -- " + ex.toString());
                    }
                }
            };
        }

        function getMsgLogWLevelGeneratorCategoryCond(desiredLevel) {
            const fixedLevel = desiredLevel;
            return function (category, cond, fmt, ...args) {
                if (cond) {
                    try {
                        if (m_enabledCategories[category]) {
                            const fmti = m_formatInfo.get(fmt);
                            if (fmti === undefined) {
                                console.error("Format name is not defined for this logger -- " + fmt);
                            }

                            m_memoryBlockList.logMessage(m_env, fixedLevel, category, m_doTimeLimit, fmti, args);
                            if (scheduler.notify()) {
                                setTimeout(processentriescb, scheduler.getCurrentSchedulingWait());
                            }
                        }
                    }
                    catch (ex) {
                        console.error("Hard failure in logging -- " + ex.toString());
                    }
                }
            };
        }

        function updateLoggingFunctions(logger, logLevel) {
            this.fatal = isLevelEnabledForLogging(core.LoggingLevels.FATAL, m_memoryLogLevel) ? getMsgLogWLevelGenerator(core.LoggingLevels.FATAL) : doMsgLog_NOP;
            this.error = isLevelEnabledForLogging(core.LoggingLevels.ERROR, m_memoryLogLevel) ? getMsgLogWLevelGenerator(core.LoggingLevels.ERROR) : doMsgLog_NOP;
            this.warn = isLevelEnabledForLogging(core.LoggingLevels.WARN, m_memoryLogLevel) ? getMsgLogWLevelGenerator(core.LoggingLevels.WARN) : doMsgLog_NOP;
            this.info = isLevelEnabledForLogging(core.LoggingLevels.INFO, m_memoryLogLevel) ? getMsgLogWLevelGenerator(core.LoggingLevels.INFO) : doMsgLog_NOP;
            this.debug = isLevelEnabledForLogging(core.LoggingLevels.DEBUG, m_memoryLogLevel) ? getMsgLogWLevelGenerator(core.LoggingLevels.DEBUG) : doMsgLog_NOP;
            this.trace = isLevelEnabledForLogging(core.LoggingLevels.TRACE, m_memoryLogLevel) ? getMsgLogWLevelGenerator(core.LoggingLevels.TRACE) : doMsgLog_NOP;

            this.fatalCategory = isLevelEnabledForLogging(core.LoggingLevels.FATAL, m_memoryLogLevel) ? getMsgLogWLevelGeneratorCategory(core.LoggingLevels.FATAL) : doMsgLogCategory_NOP;
            this.errorCategory = isLevelEnabledForLogging(core.LoggingLevels.ERROR, m_memoryLogLevel) ? getMsgLogWLevelGeneratorCategory(core.LoggingLevels.ERROR) : doMsgLogCategory_NOP;
            this.warnCategory = isLevelEnabledForLogging(core.LoggingLevels.WARN, m_memoryLogLevel) ? getMsgLogWLevelGeneratorCategory(core.LoggingLevels.WARN) : doMsgLogCategory_NOP;
            this.infoCategory = isLevelEnabledForLogging(core.LoggingLevels.INFO, m_memoryLogLevel) ? getMsgLogWLevelGeneratorCategory(core.LoggingLevels.INFO) : doMsgLogCategory_NOP;
            this.debugCategory = isLevelEnabledForLogging(core.LoggingLevels.DEBUG, m_memoryLogLevel) ? getMsgLogWLevelGeneratorCategory(core.LoggingLevels.DEBUG) : doMsgLogCategory_NOP;
            this.traceCategory = isLevelEnabledForLogging(core.LoggingLevels.TRACE, m_memoryLogLevel) ? getMsgLogWLevelGeneratorCategory(core.LoggingLevels.TRACE) : doMsgLogCategory_NOP;

            this.fatalIf = isLevelEnabledForLogging(core.LoggingLevels.FATAL, m_memoryLogLevel) ? getMsgLogWLevelGeneratorCond(core.LoggingLevels.FATAL) : doMsgLogCond_NOP;
            this.errorIf = isLevelEnabledForLogging(core.LoggingLevels.ERROR, m_memoryLogLevel) ? getMsgLogWLevelGeneratorCond(core.LoggingLevels.ERROR) : doMsgLogCond_NOP;
            this.warnIf = isLevelEnabledForLogging(core.LoggingLevels.WARN, m_memoryLogLevel) ? getMsgLogWLevelGeneratorCond(core.LoggingLevels.WARN) : doMsgLogCond_NOP;
            this.infoIf = isLevelEnabledForLogging(core.LoggingLevels.INFO, m_memoryLogLevel) ? getMsgLogWLevelGeneratorCond(core.LoggingLevels.INFO) : doMsgLogCond_NOP;
            this.debugIf = isLevelEnabledForLogging(core.LoggingLevels.DEBUG, m_memoryLogLevel) ? getMsgLogWLevelGeneratorCond(core.LoggingLevels.DEBUG) : doMsgLogCond_NOP;
            this.traceIf = isLevelEnabledForLogging(core.LoggingLevels.TRACE, m_memoryLogLevel) ? getMsgLogWLevelGeneratorCond(core.LoggingLevels.TRACE) : doMsgLogCond_NOP;

            this.fatalCategoryIf = isLevelEnabledForLogging(core.LoggingLevels.FATAL, m_memoryLogLevel) ? getMsgLogWLevelGeneratorCategoryCond(core.LoggingLevels.FATAL) : doMsgLogCategoryCond_NOP;
            this.errorCategoryIf = isLevelEnabledForLogging(core.LoggingLevels.ERROR, m_memoryLogLevel) ? getMsgLogWLevelGeneratorCategoryCond(core.LoggingLevels.ERROR) : doMsgLogCategoryCond_NOP;
            this.warnCategoryIf = isLevelEnabledForLogging(core.LoggingLevels.WARN, m_memoryLogLevel) ? getMsgLogWLevelGeneratorCategoryCond(core.LoggingLevels.WARN) : doMsgLogCategoryCond_NOP;
            this.infoCategoryIf = isLevelEnabledForLogging(core.LoggingLevels.INFO, m_memoryLogLevel) ? getMsgLogWLevelGeneratorCategoryCond(core.LoggingLevels.INFO) : doMsgLogCategoryCond_NOP;
            this.debugCategoryIf = isLevelEnabledForLogging(core.LoggingLevels.DEBUG, m_memoryLogLevel) ? getMsgLogWLevelGeneratorCategoryCond(core.LoggingLevels.DEBUG) : doMsgLogCategoryCond_NOP;
            this.traceCategoryIf = isLevelEnabledForLogging(core.LoggingLevels.TRACE, m_memoryLogLevel) ? getMsgLogWLevelGeneratorCategoryCond(core.LoggingLevels.TRACE) : doMsgLogCategoryCond_NOP;
        }
        updateLoggingFunctions(this, m_memoryLogLevel);

        /**
        * Synchronously emit the in memory log to the specified writer for failure notification
        * @method
        */
        this.emitFullLogSync = function () {
            try {
                m_memoryBlockList.processMessagesForWrite_HardFlush(s_rootLogger.getLoggingLevel(), s_rootLogger.getEnabledCategories(), m_writeBlockList);

                let donework = false;
                while (!donework) {
                    donework = !m_writeBlockList.emitKEntries(m_formatter, m_doPrefix, m_writeGroupSize);

                    const dataBlock = m_formatter.unlinkData();
                    m_transport.writeDataSync(dataBlock);
                }
            }
            catch (ex) {
                console.error("Hard failure in emit on issue notify -- " + ex.toString());
            }
        };

        /**
        * Explicitly allow a specifc sub-logger to control output levels
        * @method
        * @param {string} subloggerName the name of the sub-logger to enable
        * @param {number} level the level that the sub-logger is allowed to emit at
        * @returns {bool} true if this is the root logger and sub-logger was updated and false otherwise
        */
        this.enableSubLogger = function (subloggerName, level) {
            try {
                if (s_rootLogger === this) {
                    s_enabledSubLoggerNames.add(subloggerName, level);
                    return true;
                }
                else {
                    return false;
                }
            }
            catch (ex) {
                console.error("Hard failure in update sublogger state -- " + ex.toString());
                return false;
            }
        };
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
 * Map of module names that are enabled for sub-logging + level cap override
 */
const s_enabledSubLoggerNames = new Map();
const s_defaultSubLoggerLevel = core.LoggingLevels.WARN;

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

    let memlevelflag = core.LoggingLevels[memoryLevel] || core.LoggingLevels.INFO;
    let writelevelflag = core.LoggingLevels[writeLevel] || core.LoggingLevels.WARN;

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
