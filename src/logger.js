"use strict";

const path = require("path");

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

function sanitizeLogLevel(level) {
    if (level >= core.LoggingLevels.ALL) {
        return core.LoggingLevels.ALL;
    }
    else if (level >= core.LoggingLevels.TRACE) {
        return core.LoggingLevels.TRACE;
    }
    else if (level >= core.LoggingLevels.DEBUG) {
        return core.LoggingLevels.DEBUG;
    }
    else if (level >= core.LoggingLevels.INFO) {
        return core.LoggingLevels.INFO;
    }
    else if (level >= core.LoggingLevels.WARN) {
        return core.LoggingLevels.WARN;
    }
    else if (level >= core.LoggingLevels.ERROR) {
        return core.LoggingLevels.ERROR;
    }
    else if (level >= core.LoggingLevels.FATAL) {
        return core.LoggingLevels.FATAL;
    }
    else {
        return core.LoggingLevels.OFF;
    }
}

/**
 * Constructor for the RootLogger
 * @constructor
 * @param {string} appName name of the root module (application)
 * @param {Object} the options object
 */
function LoggerFactory(appName, options) {
    if (typeof (appName) !== "string") {
        throw new Error(`Invalid argument for appName, ${appName}, must provide string.`);
    }
    options = options || {};

    //This state is common to all loggers and will be shared.
    const m_globalenv = {
        HOST: options.HOST || "localhost",
        APP: appName,
        TIMESTAMP: 0,
        CALLBACK: -1,
        REQUEST: -1
    };

    //True if we want to include a standard prefix on each log message
    const m_doPrefix = typeof (options.defaultPrefix) === "boolean" ? options.defaultPrefix : true;

    //Blocklists containing the information logged into memory and pending to write out
    const m_memoryBlockList = new processor.BlockList();
    const m_writeBlockList = new processor.BlockList();

    let m_retainLevel = sanitizeLogLevel(typeof (options.retainLevel) === "number" ? options.retainLevel : core.LoggingLevels.WARN);
    const m_retainCategories = { "default": true };
    Object.getOwnPropertyNames(options.retainCategories).forEach((p) => {
        if (typeof (options.retainCategories[p]) === "boolean") {
            m_retainCategories[p] = options.retainCategories[p];
        }
    });

    const m_doTimeLimit = options.bufferSizeLimit !== undefined ? false : true;
    let m_maxBufferTime = typeof (options.bufferTimeLimit) === "number" ? options.bufferTimeLimit : 1000;
    let m_maxBufferSize = typeof (options.bufferSizeLimit) === "number" ? options.bufferSizeLimit : 8192;

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
            MODULE: moduleName,
            logger_path: __filename,
            msg_path: path.join(path.dirname(__filename), "msg_processor.js")
        };

        /**
         * Get the logging level for this logger
         */
        this.getLoggingLevel = function () {
            return m_memoryLogLevel;
        };

        /**
         * Get the logging level that is written out to the transporter
         */
        this.getRetainedLoggingLevel = function () {
            return m_retainLevel;
        };

        /**
         * Get the logging categories enabled for this logger
         */
        this.getEnabledCategories = function () {
            return m_enabledCategories;
        };

        /**
         * Get the logging categories that are written out to the transporter
         */
        this.getRetainedEnabledCategories = function () {
            return m_retainCategories;
        };

        /**
         * Set the logging level for this logger
         * @param {number} logLevel
         */
        this.setLoggingLevel = function (logLevel) {
            if (typeof (logLevel) !== "number") {
                return;
            }

            try {
                let slogLevel = sanitizeLogLevel(logLevel);
                if (s_rootLogger !== this) {
                    if (s_disabledSubLoggerNames.has(moduleName)) {
                        slogLevel = core.LoggingLevels.OFF;
                    }
                    else {
                        const enabledlevel = s_enabledSubLoggerNames.get(moduleName);
                        slogLevel = enabledlevel !== undefined ? enabledlevel : s_defaultSubLoggerLevel;
                    }
                }

                if (m_memoryLogLevel !== slogLevel) {
                    m_memoryLogLevel = slogLevel;
                    updateLoggingFunctions(this, m_memoryLogLevel);
                }
            }
            catch (ex) {
                console.error("Hard failure in setLoggingLevel -- " + ex.toString());
            }
        };

        /**
         * Set the retained logging level
         * @param {number} logLevel
         */
        this.setRetainedLoggingLevel = function (logLevel) {
            if (typeof (logLevel) !== "number") {
                return;
            }

            try {
                if (s_rootLogger !== this) {
                    return;
                }

                const slogLevel = sanitizeLogLevel(logLevel);
                if (m_retainLevel !== slogLevel) {
                    m_memoryBlockList.processMessagesForWrite_HardFlush(false, slogLevel, m_retainCategories, m_writeBlockList);
                    m_retainLevel = slogLevel;
                }
            }
            catch (ex) {
                console.error("Hard failure in setRetainedLoggingLevel -- " + ex.toString());
            }
        };

        /**
         * Enable the given category of log messages
         * @param {string} category the category of messages to enable
         */
        this.enableLoggingCategory = function (category) {
            if (typeof (category) !== "string") {
                return;
            }

            m_enabledCategories[category] = true;
        };

        /**
         * Disable the given category of log messages
         * @param {string} category the category of messages to disable
         */
        this.disableLoggingCategory = function (category) {
            if (typeof (category) !== "string") {
                return;
            }

            m_enabledCategories[category] = false;
        };


        /**
         * Enable the given category of log messages for sending to the transport
         * @param {string} category the category of messages to enable
         */
        this.enableRetainedLoggingCategory = function (category) {
            if (typeof (category) !== "string") {
                return;
            }

            try {
                if (s_rootLogger !== this) {
                    return;
                }

                if (m_retainCategories[category] !== true) {
                    m_memoryBlockList.processMessagesForWrite_HardFlush(false, m_retainLevel, m_retainCategories, m_writeBlockList);
                    m_retainCategories[category] = true;
                }
            }
            catch (ex) {
                console.error("Hard failure in enableRetainedLoggingCategory -- " + ex.toString());
            }
        };

        /**
         * Disable the given category of log messages for sending to the transport
         * @param {string} category the category of messages to disable
         */
        this.disableRetainedLoggingCategory = function (category) {
            if (typeof (category) !== "string") {
                return;
            }

            try {
                if (s_rootLogger !== this) {
                    return;
                }

                if (m_retainCategories[category] !== false) {
                    m_memoryBlockList.processMessagesForWrite_HardFlush(false, m_retainLevel, m_retainCategories, m_writeBlockList);
                    m_retainCategories[category] = false;
                }
            }
            catch (ex) {
                console.error("Hard failure in disableRetainedLoggingCategory -- " + ex.toString());
            }
        };

        /**
         * Set the ring buffer bound based on the age of the entires -- not older than the bound.
         * We currently do not allow switching between size/time but you can change the value.
         * @param {number} timeBound is the new time limit for the ring buffer
         */
        this.setBufferAsTimeLengthBound = function (timeBound) {
            if (typeof (timeBound) !== "number" || timeBound <= 0) {
                return;
            }

            try {
                if (s_rootLogger !== this) {
                    return;
                }

                if (!m_doTimeLimit) {
                    return;
                }

                m_maxBufferTime = timeBound;
            }
            catch (ex) {
                console.error("Hard failure in setBufferAsTimeLengthBound -- " + ex.toString());
            }
        };

        /**
         * Set the ring buffer bound based on the size of the entries -- not larger than the size bound
         * We currently do not allow switching between size/time but you can change the value.
         * @param {number} sizeBound is the new size limit for the ring buffer
         */
        this.setBufferAsSizeBound = function (sizeBound) {
            if (typeof (sizeBound) !== "number" || sizeBound <= 0) {
                return;
            }

            try {
                if (s_rootLogger !== this) {
                    return;
                }

                if (m_doTimeLimit) {
                    return;
                }

                m_maxBufferSize = sizeBound;
            }
            catch (ex) {
                console.error("Hard failure in setBufferAsSizeBound -- " + ex.toString());
            }
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
            if (typeof (fmtName) !== "string") {
                return;
            }

            try {
                const fmtObj = specifier.extractMsgFormat(fmtName, fmtInfo);
                m_formatInfo.set(fmtName, fmtObj);
            }
            catch (ex) {
                console.error("Hard failure in addFormat -- " + ex.toString());
            }
        };

        function isImplicitFormat(fmtInfo) {
            return typeof (fmtInfo) !== "string" || (fmtInfo.startsWith("%") && fmtInfo.endsWith("%"));
        }

        function generateImplicitFormat(fmtInfo, args) {
            if (typeof (fmtInfo) === "string") {
                return specifier.extractMsgFormat("implicit_format", fmtInfo.substr(1, fmtInfo.length - 2)); //trim %
            }
            else {
                args.unshift(fmtInfo);
                return specifier.extractMsgFormat("implicit_format", "%{0:g}");
            }
        }

        /**
         * TODO: add prefix (or postfix) formatters which will be inserted in all writes.
         * Support macro only as well as general options -- macro only are nice since uses don't need to pass other args
         */

        function getMsgLogWLevelGenerator(desiredLevel) {
            const fixedLevel = desiredLevel;
            return function (fmt, ...args) {
                try {
                    const fmti = isImplicitFormat(fmt) ? generateImplicitFormat(fmt, args) : m_formatInfo.get(fmt);
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
                        const fmti = isImplicitFormat(fmt) ? generateImplicitFormat(fmt, args) : m_formatInfo.get(fmt);
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
                        const fmti = isImplicitFormat(fmt) ? generateImplicitFormat(fmt, args) : m_formatInfo.get(fmt);
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
                            const fmti = isImplicitFormat(fmt) ? generateImplicitFormat(fmt, args) : m_formatInfo.get(fmt);
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
                m_memoryBlockList.processMessagesForWrite_HardFlush(true, core.LoggingLevels.ALL, {}, m_writeBlockList);

                let donework = false;
                while (!donework) {
                    donework = !m_writeBlockList.emitKEntries(m_formatter, m_doPrefix, m_writeGroupSize);

                    const dataBlock = m_formatter.unlinkData();
                    m_transport.writeDataSync(dataBlock);
                }
            }
            catch (ex) {
                console.error("Hard failure in emit on emitFullLogSync -- " + ex.toString());
            }
        };

        /**
        * Explicitly allow a specifc sub-logger to control output levels
        * @method
        * @param {string} subloggerName the name of the sub-logger to enable
        * @param {number} level the level that the sub-logger is allowed to emit at
        */
        this.enableSubLogger = function (subloggerName, level) {
            if (typeof (subloggerName) !== "string" || typeof (level) !== "number") {
                return;
            }

            try {
                if (s_rootLogger === this) {
                    s_enabledSubLoggerNames.add(subloggerName, level);
                    s_disabledSubLoggerNames.delete(subloggerName);
                }
            }
            catch (ex) {
                console.error("Hard failure in enableSubLogger -- " + ex.toString());
            }
        };

        /**
        * Explicitly disable a specifc sub-logger -- entirely suppress the output from it
        * @method
        * @param {string} subloggerName the name of the sub-logger to enable
        */
        this.disableSubLogger = function (subloggerName) {
            if (typeof (subloggerName) !== "string") {
                return;
            }

            try {
                if (s_rootLogger === this) {
                    s_enabledSubLoggerNames.delete(subloggerName);
                    s_disabledSubLoggerNames.add(subloggerName);
                }
            }
            catch (ex) {
                console.error("Hard failure in disableSubLogger -- " + ex.toString());
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
const s_disabledSubLoggerNames = new Set();
const s_enabledSubLoggerNames = new Map();
const s_defaultSubLoggerLevel = core.LoggingLevels.WARN;

/**
 * Map of the loggers created for various module names
 */
const s_loggerMap = new Map();

const s_options = {
    host: "string",
    emitCategories: "object",
    defaultPrefix: "boolean",
    retainLevel: "string",
    retainCategories: "object",
    bufferSizeLimit: "number",
    bufferTimeLimit: "number"
};

/**
 * Logger constructor function.
 * @exports
 * @function
 * @param {string} name of the logger object to construct (calls with the same name will return an aliased logger object)
 * @param {string} level is the level to log into the high performance ring buffer (undefined => default INFO)
 * @param {Object} options an object with other options for the construction (undefined => default options)
 */
module.exports = function (name, level, options) {
    if (typeof (name) !== "string") {
        throw new Error(`Expected name of logger but got ${name}`);
    }

    if (level === undefined) {
        level = "INFO";
    }
    if (typeof (level) !== "string" || core.LoggingLevels[level] === undefined) {
        throw new Error(`Expected logging level but got ${level}`);
    }
    const rlevel = core.LoggingLevels[level];

    const ropts = {
        host: require("os").hostname()
    };

    Object.getOwnPropertyNames(options).forEach((p) => {
        if (s_options.hasOwnProperty(p)) {
            const pval = options[p];
            if (pval === null || pval === undefined || typeof (pval) != s_options[p]) {
                throw new Error(`Invalid option "${p}" expected "${options[p]}" value but got ${pval}`);
            }

            if (p === "retainLevel") {
                if (core.LoggingLevels[pval] === undefined) {
                    throw new Error(`Expected logging level but got ${level}`);
                }
                ropts[p] = core.LoggingLevels[pval];
            }
            else {
                ropts[p] = pval;
            }
        }
    });

    if (ropts.retainLevel !== undefined) {
        ropts.retainLevel = Math.min(core.LoggingLevels.WARN, rlevel);
    }
    else {
        ropts.retainLevel = Math.min(ropts.retainLevel, rlevel);
    }

    //Lazy instantiate the logger factory
    if (s_loggerFactory === null) {
        s_loggerFactory = new LoggerFactory(require.main.filename, ropts);
    }

    //Get the filename of the caller
    const cstack = new Error()
    .stack
    .split("\n")
    .slice(1)
    .map(function (frame) {
        return frame.substring(frame.indexOf("(") + 1, frame.lastIndexOf(".js:") + 3);
    });
    const lfilename = cstack[cstack.length - 2];

    let logger = s_loggerMap.get(name);
    if (!logger) {
        if (require.main.filename !== lfilename) {
            if (s_disabledSubLoggerNames.has(lfilename)) {
                ropts.retainLevel = core.LoggingLevels.OFF;
            }
            else {
                const enabledlevel = s_enabledSubLoggerNames.get(lfilename);
                ropts.retainLevel = enabledlevel !== undefined ? enabledlevel : s_defaultSubLoggerLevel;
            }
        }

        logger = s_loggerFactory.createLogger(name, ropts);
        logger.Levels = core.LoggingLevels;

        if (require.main.filename === lfilename) {
            s_rootLogger = logger;
        }

        s_loggerMap.set(name, logger);
    }

    return logger;
};
