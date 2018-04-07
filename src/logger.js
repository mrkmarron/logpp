"use strict";

const assert = require("assert");

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
 * Tag values for system info logging levels.
 */
const SystemInfoLevels = {
    OFF: 0x0,
    REQUEST: 0x100, // if enabled written into the log at INFO level.
    ASYNC: 0x300, // if enabled written into the log at DEBUG level.
    ALL: 0xF00
};

/*
 * Keep track of what categories have been enabled in the log.
 */
const EnabledLogCategories = {

};
