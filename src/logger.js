"use strict";

/**
 * Tag values for logging levels.
 */
const LoggingLevels = {
    OFF: 0x0,
    FATAL: 0x1,
    ERROR: 0x3,
    WARN: 0x7,
    INFO: 0xF,
    DEBUG: 0x1F,
    TRACE: 0x3F,
    ALL: 0xFF
};

/**
 * Keep track of what categories have been enabled in the log.
 */
const EnabledLogCategories = {

};
