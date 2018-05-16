"use strict";

const os = require("os");

//const nlogger = require("C:\\Chakra\\logpp\\build\\Release\\nlogger.node");
const nlogger = require("bindings")("nlogger.node");

/////////////////////////////////////////////////////////////////////////////////////////////////
//A diagnostics logger for our logger
function diaglog_disabled(activity, payload) {
}

let diaglog_wstream = undefined; // require("fs").createWriteStream("C:\\Users\\marron\\Desktop\\logtrace.txt");
function diaglog_enabled(activity, payload) {
    let pls = "";
    try {
        if (payload !== undefined) {
            pls = JSON.stringify(payload);
        }
    }
    catch (ex) {
        //just drop payload
    }

    const output = activity + " -- " + pls + " @ " + (new Date()).toISOString() + "\n";
    diaglog_wstream.write(output);
}

let diaglog = diaglog_disabled;

/////////////////////////////////////////////////////////////////////////////////////////////////
//Start off with a bunch of costant definitions.
//In a number of cases we don't actually define here. Instead we have a comment and literal value which
//  we actually put in the code where needed (so no need to load in bytecode and very obvious for JIT).

/**
 * Tag values for logging levels.
 */
const LoggingLevels = {
    OFF: 0x0,
    FATAL: 0x1,
    ERROR: 0x3,
    WARN: 0x7,
    INFO: 0xF,
    DETAIL: 0x1F,
    DEBUG: 0x3F,
    TRACE: 0x7F,
    ALL: 0xFF
};

function sanitizeLogLevel(level) {
    if (level >= LoggingLevels.ALL) {
        return LoggingLevels.ALL;
    }
    else if (level >= LoggingLevels.TRACE) {
        return LoggingLevels.TRACE;
    }
    else if (level >= LoggingLevels.DEBUG) {
        return LoggingLevels.DEBUG;
    }
    else if (level >= LoggingLevels.DETAIL) {
        return LoggingLevels.DETAIL;
    }
    else if (level >= LoggingLevels.INFO) {
        return LoggingLevels.INFO;
    }
    else if (level >= LoggingLevels.WARN) {
        return LoggingLevels.WARN;
    }
    else if (level >= LoggingLevels.ERROR) {
        return LoggingLevels.ERROR;
    }
    else if (level >= LoggingLevels.FATAL) {
        return LoggingLevels.FATAL;
    }
    else {
        return LoggingLevels.OFF;
    }
}

/*
 * Default values we expand objects and arrays
 */
const ExpandDefaults = {
    Depth: 2,
    Length: 32
};

/**
 * Enum values indicating the kind of each format entry
 */
const FormatStringEntryKind = {
    Literal: 0x1,
    Expando: 0x2,
    Basic: 0x3,
    Compound: 0x4
};

/**
 * Enum values for the format strings
 */
const FormatStringEnum = {
    HASH: 0x1,
    HOST: 0x2,
    APP: 0x3,
    LOGGER: 0x4,
    SOURCE: 0x5,
    WALLCLOCK: 0x6,
    TIMESTAMP: 0x7,
    CALLBACK: 0x8,
    REQUEST: 0x9,

    PERCENT: 0x11,
    ARGREQUIRED: 0x12,
    BOOL: 0x12,
    NUMBER: 0x13,
    STRING: 0x14,
    DATEISO: 0x15,
    DATELOCAL: 0x16,
    GENERAL: 0x17
};

/**
 * Enum values for the types we consider javascript values having for logging purposes
 */
const TypeNameEnum = {
    TUndefined: 0x1,
    TNull: 0x2,
    TBoolean: 0x3,
    TNumber: 0x4,
    TString: 0x5,
    LastImmutableType: 0x5,
    TDate: 0x6,
    TObject: 0x7,
    TJsArray: 0x8,
    TTypedArray: 0x9,
    TUnknown: 0xA,
    TypeLimit: 0xB
};

const TypeNameToFlagEnum = {
    "[object Undefined]": TypeNameEnum.TUndefined,
    "[object Null]": TypeNameEnum.TNull,
    "[object Boolean]": TypeNameEnum.TBoolean,
    "[object Number]": TypeNameEnum.TNumber,
    "[object String]": TypeNameEnum.TString,
    "[object Date]": TypeNameEnum.TDate,
    "[object Object]": TypeNameEnum.TObject,
    "[object Array]": TypeNameEnum.TJsArray,
    "[object Float32Array]": TypeNameEnum.TTypedArray,
    "[object Float64Array]": TypeNameEnum.TTypedArray,
    "[object Int8Array]": TypeNameEnum.TTypedArray,
    "[object Int16Array]": TypeNameEnum.TTypedArray,
    "[object Int32Array]": TypeNameEnum.TTypedArray,
    "[object Uint8Array]": TypeNameEnum.TTypedArray,
    "[object Uint16Array]": TypeNameEnum.TTypedArray,
    "[object Uint32Array]": TypeNameEnum.TTypedArray
};

/**
 * Get the enumeration tag for the type of value
 * @param {object} value
 * @returns TypeNameToFlagEnum value
 */
function getTypeNameEnum(value) {
    return TypeNameToFlagEnum[toString.call(value)] || TypeNameEnum.TUnknown;
}

/**
 * Tag values indicating the kind of each entry in the fast log buffer
 */
const LogEntryTags = {
    Clear: 0x0,
    MsgFormat: 0x1,
    MsgLevel: 0x2,
    MsgCategory: 0x3,
    MsgWallTime: 0x4,
    MSGLogger: 0x5,
    MSGChildInfo: 0x6,
    MsgEndSentinal: 0x7,
    LParen: 0x8,
    RParen: 0x9,
    LBrack: 0xA,
    RBrack: 0xB,

    JsVarValue_Undefined: 0x11,
    JsVarValue_Null: 0x12,
    JsVarValue_Bool: 0x13,
    JsVarValue_Number: 0x14,
    JsVarValue_StringIdx: 0x15,
    JsVarValue_Date: 0x16,

    PropertyRecord: 0x21,
    JsBadFormatVar: 0x22,
    JsVarValue: 0x23,
    CycleValue: 0x24,
    OpaqueValue: 0x25,
    DepthBoundObject: 0x26,
    LengthBoundObject: 0x27,
    DepthBoundArray: 0x28,
    LengthBoundArray: 0x29
};

function internalLogFailure(msg, ex) {
    try {
        if (diaglog === diaglog_enabled) {
            diaglog("internalLogFailure", { msg: msg, ex: ex.toString() });
        }
        else {
            console.error(internalLogFailure + " -- " + ex.toString() + " @ " + (new Date()).toISOString());
        }
    }
    catch (fex) {
        //yeah I don't even know
    }

    //Something went really wrong and we will probably continue to fail.
    //This also means we lost visibility into the health of the real process.
    //So, for now, fail fast. We may be able to do a hard recover but for now simple is better.
    process.exit(1);
}

//Map of all formats known to the loggers
const s_fmtMap = [];
const s_fmtStringToIdMap = new Map();

//Map of all known categories + their enabled disabled status
const s_enabledCategories = [
    false, //0 is not usable since we do -i indexing
    true, //$default is enabled by default
    true //$explicit is enabled by default
];
const s_categoryNames = new Map();
s_categoryNames.set("__dummy__", 0);
s_categoryNames.set("default", -1);
s_categoryNames.set("explicit", -2);

const s_environment = {
    defaultSubLoggerLevel: LoggingLevels.WARN,

    //Number of log writes that we see before we try and flush again -- default to every write
    flushCount: 0,

    //The flush action we should use when flushCount is hit -- default to sync
    flushAction: discardFlushAction,

    //The target we want to emit to -- default stdout
    flushTarget: "console",

    //The flush callback to use -- by default nops
    flushCB: () => { },

    //Set if we emit a default prefix (level/category/timestamp) on every log message
    doPrefix: false
};

//This state is common to all loggers and will be shared.
const s_globalenv = {
    TIMESTAMP: 0,
    CALLBACK: -1,
    REQUEST: -1
};

/////////////////////////////////////////////////////////////////////////////////////////////////
//Define structure for representing log message formats.
//Our goal is to do preprocessing into an optimized format *1* time and then be able to quickly process
//  the data in the (many) uses of this formatter in log statements.
//We also provide a new expando macro concept that allows the easy/efficient inclusion of commonly useful
//  data into the message.

////
//Valid expandos are:
//#host      -- name of the host
//#app       -- name of the root app
//#logger    -- name of the logger
//#source    -- source location of log statment (file, line)
//#wallclock -- wallclock timestamp (defaults to utc)
//#timestamp -- logical timestamp
//#callback  -- the current callback id
//#request   -- the current request id (for http requests)
//##         -- a literal #
////

////
//Valid format specifiers are:
//%b -- a boolean value
//%n -- a number
//%s -- a string
//%d -- a date formatted as iso
//%dl -- a date formatted as local
//%o<d,l> -- an object expanded up to d levels (default is 2) at most l items in any level (default is 32 for objects 16 for arrays)
//%j -- general value (general format applied -- no array expansion, object depth of 2)
//%% -- a literal %
////

/*
 * Error class representing issues encountered when attempting to parse a format.
 */
class FormatSyntaxError extends Error {
    constructor(message, format, position) {
        super(message);
        this.format = format;
        this.position = position;
    }
}

/**
 * Object singletons for format entries
 */
const FormatStringEntryParseMap = new Map();
FormatStringEntryParseMap.set("##", { kind: FormatStringEntryKind.Literal, enum: FormatStringEnum.HASH });
FormatStringEntryParseMap.set("%%", { kind: FormatStringEntryKind.Literal, enum: FormatStringEnum.PERCENT });

FormatStringEntryParseMap.set("#host", { kind: FormatStringEntryKind.Expando, enum: FormatStringEnum.HOST });
FormatStringEntryParseMap.set("#app", { kind: FormatStringEntryKind.Expando, enum: FormatStringEnum.APP });
FormatStringEntryParseMap.set("#logger", { kind: FormatStringEntryKind.Expando, enum: FormatStringEnum.LOGGER });
FormatStringEntryParseMap.set("#source", { kind: FormatStringEntryKind.Expando, enum: FormatStringEnum.SOURCE });
FormatStringEntryParseMap.set("#wallclock", { kind: FormatStringEntryKind.Expando, enum: FormatStringEnum.WALLCLOCK });
FormatStringEntryParseMap.set("#timestamp", { kind: FormatStringEntryKind.Expando, enum: FormatStringEnum.TIMESTAMP });
FormatStringEntryParseMap.set("#callback", { kind: FormatStringEntryKind.Expando, enum: FormatStringEnum.CALLBACK });
FormatStringEntryParseMap.set("#request", { kind: FormatStringEntryKind.Expando, enum: FormatStringEnum.REQUEST });

FormatStringEntryParseMap.set("b", { kind: FormatStringEntryKind.Basic, enum: FormatStringEnum.BOOL });
FormatStringEntryParseMap.set("n", { kind: FormatStringEntryKind.Basic, enum: FormatStringEnum.NUMBER });
FormatStringEntryParseMap.set("s", { kind: FormatStringEntryKind.Basic, enum: FormatStringEnum.STRING });
FormatStringEntryParseMap.set("di", { kind: FormatStringEntryKind.Basic, enum: FormatStringEnum.DATEISO });
FormatStringEntryParseMap.set("dl", { kind: FormatStringEntryKind.Basic, enum: FormatStringEnum.DATELOCAL });
FormatStringEntryParseMap.set("j", { kind: FormatStringEntryKind.Compound, enum: FormatStringEnum.GENERAL });

const s_expandoFormatStrings = [];
const s_basicFormatStrings = [];
const s_compoundFormatStrings = [];
FormatStringEntryParseMap.forEach((v, k) => {
    if (v.kind === FormatStringEntryKind.Literal) {
    }
    else if (v.kind === FormatStringEntryKind.Expando) {
        s_expandoFormatStrings.push(k);
    }
    else if (v.kind === FormatStringEntryKind.Basic) {
        s_basicFormatStrings.push(k);
    }
    else {
        s_compoundFormatStrings.push(k);
    }
});

const s_expandoStringRe = new RegExp("^(" + s_expandoFormatStrings.join("|") + ")$");
const s_basicFormatStringRe = new RegExp("^\\%(" + s_basicFormatStrings.join("|") + ")$");
const s_compoundFormatStringRe = new RegExp("^\\%(" + s_compoundFormatStrings.join("|") + ")(<(\\d+|\\*)?,(\\d+|\\*)?>)?$");

/**
 * Construct a msgFormat entry for a compound formatter.
 * @function
 * @param {number} kind the FormatStringEntryKind value
 * @param {number} tag the FormatStringEnum value
 * @param {number} argListPosition the (optional) position to find the format arg in the arg list
 * @param {number} formatExpandDepth the (optional) max depth to expand the argument object
 * @param {number} formatExpandLength the (optional) max number of properties/array length to expand the argument object
 * @returns {Object} a message format entry
 */
function createMsgFormatEntry(kind, tag, argListPosition, formatExpandDepth, formatExpandLength) {
    return {
        kind: kind,
        enum: tag,
        argPosition: argListPosition,
        expandDepth: formatExpandDepth,
        expandLength: formatExpandLength
    };
}

/**
 * Take an array or object literal format representation and convert it to json string format representation.
 * @function
 * @param {*} jobj
 * @returns {string}
 */
function expandToJsonFormatter(jobj) {
    const typeid = getTypeNameEnum(jobj);

    if ((typeid === TypeNameEnum.TUndefined) || (typeid === TypeNameEnum.TNull) || (typeid === TypeNameEnum.TBoolean) || (typeid === TypeNameEnum.TNumber)) {
        return JSON.stringify(jobj);
    }
    else if (typeid === TypeNameEnum.TString) {
        if (s_expandoStringRe.test(jobj) || s_basicFormatStringRe.test(jobj) || s_compoundFormatStringRe.test(jobj)) {
            return jobj;
        }
        else {
            return JSON.stringify(jobj);
        }
    }
    else if (typeid === TypeNameEnum.TObject) {
        return "{ " +
            Object.keys(jobj)
                .map(function (key) { return "\"" + key + "\": " + expandToJsonFormatter(jobj[key]); })
                .join(", ") +
            " }";
    }
    else if (typeid === TypeNameEnum.TJsArray) {
        return "[ " +
            jobj
                .map(function (value) { return expandToJsonFormatter(value); })
                .join(", ") +
            " ]";
    }
    else {
        return JSON.stringify(jobj.toString());
    }
}

function formatEntryInfoExtractorHelper(kind, tag, spos, epos, argpos, depth, length) {
    const fmtentry = createMsgFormatEntry(kind, tag, argpos !== undefined ? argpos : -1, depth !== undefined ? depth : -1, length !== undefined ? length : -1);
    return { fmt: fmtentry, formatStart: spos, formatEnd: epos };
}

/**
 * Helper function to extract and construct an expando format specifier or throws is the expando is malformed.
 * @function
 * @param {string} fmtString the format string we are working on
 * @param {number} vpos the current position in the string
 * @returns Object the expando MsgFormatEntry and the range of the string that was idenitifed as the formatter
 */
function extractExpandoSpecifier(fmtString, vpos) {
    if (fmtString.startsWith("##", vpos)) {
        return formatEntryInfoExtractorHelper(FormatStringEntryKind.Literal, FormatStringEnum.HASH, vpos, vpos + "##".length);
    }
    else {
        const expando = s_expandoFormatStrings.find(function (expandostr) { return fmtString.startsWith(expandostr, vpos); });
        if (!expando) {
            throw new FormatSyntaxError("Bad match in expando format string", fmtString, vpos);
        }

        const eentry = FormatStringEntryParseMap.get(expando);
        return formatEntryInfoExtractorHelper(eentry.kind, eentry.enum, vpos, vpos + expando.length);
    }
}

//Helper regexs for parsing numbers in format specifier
const s_formatDepthLengthRegex = /<[ ]*(\d+|\*)?[ ]*,[ ]*(\d+|\*)?[ ]*>/y;

/**
 * Helper function to extract and construct an argument format specifier or throws is the format specifier is malformed.
 * @function
 * @param {string} fmtString the format string we are working on
 * @param {number} vpos the current position in the string
 * @returns Object the expando MsgFormatEntry and the range of the string that was idenitifed as the formatter
 */
function extractArgumentFormatSpecifier(fmtString, vpos, argPosition) {
    if (fmtString.startsWith("%%", vpos)) {
        return formatEntryInfoExtractorHelper(FormatStringEntryKind.Literal, FormatStringEnum.PERCENT, vpos, vpos + "%%".length);
    }
    else {
        const specPos = vpos + 1;

        const cchar = fmtString.charAt(specPos);
        const basicFormatOptionStr = s_basicFormatStrings.find(function (value) { return value.length === 1 ? value === cchar : fmtString.startsWith(value, specPos); });
        const compoundFormatOptionStr = s_compoundFormatStrings.find(function (value) { return value === cchar; });

        if (!basicFormatOptionStr && !compoundFormatOptionStr) {
            throw new FormatSyntaxError("Bad formatting specifier", fmtString, specPos);
        }

        if (basicFormatOptionStr) {
            const basicFormatOptionInfo = FormatStringEntryParseMap.get(basicFormatOptionStr);
            const fendpos = specPos + basicFormatOptionStr.length; //"fmt".length
            return formatEntryInfoExtractorHelper(basicFormatOptionInfo.kind, basicFormatOptionInfo.enum, vpos, fendpos, argPosition, -1, -1);
        }
        else {
            const DL_STAR = 1073741824;

            s_formatDepthLengthRegex.lastIndex = specPos + 1; //advance j
            const dlMatch = s_formatDepthLengthRegex.exec(fmtString);

            if (dlMatch === null) {
                const fendpos = specPos + 1; //"j".length
                return formatEntryInfoExtractorHelper(FormatStringEntryKind.Compound, FormatStringEnum.GENERAL, vpos, fendpos, argPosition, ExpandDefaults.Depth, ExpandDefaults.Length);
            }
            else {
                let tdepth = ExpandDefaults.Depth;
                let tlength = ExpandDefaults.Length;

                if (dlMatch[1]) {
                    tdepth = (dlMatch[1] !== "*") ? Number.parseInt(dlMatch[1]) : DL_STAR;
                }

                if (dlMatch[2]) {
                    tlength = (dlMatch[2] !== "*") ? Number.parseInt(dlMatch[2]) : DL_STAR;
                }

                return formatEntryInfoExtractorHelper(FormatStringEntryKind.Compound, FormatStringEnum.GENERAL, vpos, specPos + 1 + dlMatch[0].length, argPosition, tdepth, tlength);
            }
        }
    }
}

/**
 * Construct a msgFormat object.
 * @function
 * @param {string} fmtName the name of the format
 * @param {number} fmtId a unique identifier for the format
 * @param {Array} fmtEntryArray the array of FormatEntry objects
 * @returns {Object} our MsgFormat object
 */
function createMsgFormat(fmtName, fmtId, fmtEntryArray) {
    return {
        formatName: fmtName,
        formatId: fmtId,
        formatterArray: fmtEntryArray
    };
}

//Helper rexex for extract function
const s_newlineRegex = /(\n|\r)/;

/**
 * Takes a message format string and converts it to our internal format structure (and saves it).
 * @function
 * @param {string} fmtName the name of the format
 * @param {string|Object} fmtString the raw format string or a JSON style format
 * @returns {number} our ID for the saved message format
 */
function extractMsgFormat(fmtName, fmtInfo) {
    let cpos = 0;

    if (typeof (fmtName) !== "string") {
        throw new FormatSyntaxError("Name needs to be a string", undefined, 0);
    }

    let fmtString = fmtInfo;
    if (typeof (fmtInfo) !== "string") {
        const typeid = getTypeNameEnum(fmtInfo);
        if (typeid !== TypeNameEnum.TObject && typeid !== TypeNameEnum.TJsArray) {
            throw new FormatSyntaxError("Format description options are string | object layout | array layout", undefined, 0);
        }

        fmtString = expandToJsonFormatter(fmtInfo);
    }

    if (s_newlineRegex.test(fmtString)) {
        throw new FormatSyntaxError("Format cannot contain newlines", undefined, 0);
    }

    const fmtMemoString = fmtName + fmtString;
    const fmtMemoId = s_fmtStringToIdMap.get(fmtMemoString);
    if (fmtMemoId !== undefined) {
        return fmtMemoId;
    }

    let argPosition = 0;
    const fArray = [];
    while (cpos < fmtString.length) {
        const cchar = fmtString.charAt(cpos);
        if (cchar !== "#" && cchar !== "%") {
            cpos++;
        }
        else {
            const fmt = (cchar === "#") ? extractExpandoSpecifier(fmtString, cpos) : extractArgumentFormatSpecifier(fmtString, cpos, argPosition);
            fArray.push(fmt);

            if (fmt.fmt.enum >= FormatStringEnum.ARGREQUIRED) {
                argPosition++;
            }

            cpos = fmt.formatEnd;
        }
    }

    const formatArray = [];
    const kindArray = new Uint8Array(fArray.length);
    const enumArray = new Uint8Array(fArray.length);

    const initialFormatSegment = (fArray.length !== 0) ? fmtString.substr(0, fArray[0].formatStart) : fmtString;
    const tailingFormatSegmentArray = [];
    for (let i = 0; i < fArray.length; ++i) {
        const fentry = fArray[i];

        formatArray.push(fentry.fmt);
        kindArray[i] = fentry.fmt.kind;
        enumArray[i] = fentry.fmt.enum;

        const start = fentry.formatEnd;
        const end = (i + 1 < fArray.length) ? fArray[i + 1].formatStart : fmtString.length;

        tailingFormatSegmentArray.push(fmtString.substr(start, end - start));
    }

    const fmtId = s_fmtMap.length;
    nlogger.registerFormat(fmtId, kindArray, enumArray, initialFormatSegment, tailingFormatSegmentArray, fmtString);
    const fmtObj = createMsgFormat(fmtName, fmtId, formatArray);
    s_fmtMap.push(fmtObj);

    //memoize the result
    s_fmtStringToIdMap.set(fmtMemoString, fmtObj.formatId);

    return fmtObj.formatId;
}

/////////////////////////////////////////////////////////////////////////////////////////////////
//Define structure for representing the in memory log entries.
//We want to be able to efficiently copy any data needed to construct the log message into this structure.
//  The actual formatting of the message will take place once we decide we need the message. Either it is
//  moved to stable storage or we encountered a situation where we want a detailed log dump.

/**
 * The number of entries we have in a msg block.
 */
const MemoryMsgBlockSizes = [256, 512, 1024, 2048, 4096, 8192, 16384];
const MemoryMsgBlockSizesRev = [16384, 8192, 4096, 2048, 1024, 512, 256];

const MemoryMsgBlockInitSize = 256;
const MemoryMsgBlockLimitSize = 16384;

let s_blockIdCtr = 0;

function sizeUp(sizespec) {
    const nextTry = MemoryMsgBlockSizes.find((size) => sizespec < size);
    return nextTry || MemoryMsgBlockLimitSize;
}

function sizeDown(sizespec) {
    const nextTry = MemoryMsgBlockSizesRev.find((size) => sizespec > size);
    return nextTry || MemoryMsgBlockInitSize;
}

function blockSize(utilization, size) {
    diaglog("blockSize", { utilization: utilization, size: size });

    if (utilization <= size / 4) {
        return sizeDown(size);
    }
    else if (utilization >= size * 3 / 4) {
        return sizeUp(size);
    }
    else {
        return size;
    }
}

//internal function for allocating a block
function createMemoryMsgBlock(previousBlock, blocksize) {
    diaglog("createMemoryMsgBlock", { blocksize: blocksize, blockId: s_blockIdCtr });

    const nblock = {
        spos: 0,
        epos: 0,
        tags: new Uint8Array(blocksize),
        data: new Float64Array(blocksize),
        stringData: [],
        stringMap: new Map(),
        next: null,
        blocksize: blocksize,
        previous: previousBlock,
        blockId: s_blockIdCtr++
    };

    if (previousBlock) {
        previousBlock.next = nblock;
    }

    return nblock;
}

/**
 * InMemoryLog constructor
 * @constructor
 */
function InMemoryLog() {
    this.head = createMemoryMsgBlock(null, MemoryMsgBlockInitSize);
    this.tail = this.head;
    this.jsonCycleMap = new Set();

    this.stringCtr = 0;
    this.writeCount = 0;
}

/**
 * Reset the contents of the InMemoryLog
 * @method
 */
InMemoryLog.prototype.reset = function () {
    this.head = createMemoryMsgBlock(null, MemoryMsgBlockInitSize);
    this.tail = this.head;

    this.stringCtr = 0;
};

/**
 * Ensure that there is a slot read to be written into
 */
InMemoryLog.prototype.ensureSlot = function () {
    let block = this.tail;
    if (block.epos === block.blocksize) {
        block = createMemoryMsgBlock(block, blockSize(block.epos - block.spos, block.blocksize));
        this.tail = block;
    }
    return block;
};

/**
 * Count of the entries in the InMemoryLog
 * @method
 * @returns number of entries in the InMemoryLog
 */
InMemoryLog.prototype.count = function () {
    let tcount = 0;
    for (let cblock = this.head; cblock !== null; cblock = cblock.next) {
        tcount += (cblock.epos - cblock.spos);
    }
    return tcount;
};

/**
 * Get the writeCount value for the log (since last writeCountReset)
 * @method
 * @returns writeCount value
 */
InMemoryLog.prototype.getWriteCount = function () {
    return this.writeCount;
};

/**
 * Get the writeCount value for the log (since last resetWriteCount)
 * @method
 * @returns writeCount value
 */
InMemoryLog.prototype.resetWriteCount = function () {
    return this.writeCount = 0;
};

/**
 * Remove the head block data from this list
 * @method
 */
InMemoryLog.prototype.removeHeadBlock = function (utilization) {
    if (this.head.next == null) {
        this.reset(blockSize(utilization, this.head.blocksize));
    }
    else {
        this.head = this.head.next;
        this.head.previous = null;
    }
};

/**
 * Add the header info for a msg in the InMemoryLog
 * @method
 */
InMemoryLog.prototype.addMsgHeader = function (fmt, level, category, env) {
    let block = this.tail;
    if (block.epos + 6 >= block.blocksize) {
        block = createMemoryMsgBlock(block, blockSize(block.epos - block.spos, block.blocksize));
        this.tail = block;
    }

    block.tags[block.epos] = LogEntryTags.MsgFormat;
    block.data[block.epos] = fmt.formatId;

    block.tags[block.epos + 1] = LogEntryTags.MsgLevel;
    block.data[block.epos + 1] = level;

    block.tags[block.epos + 2] = LogEntryTags.MsgCategory;
    block.data[block.epos + 2] = category;

    block.epos += 3;

    block.tags[block.epos] = LogEntryTags.MsgWallTime;
    block.data[block.epos] = Date.now();
    block.epos++;

    if (s_environment.doPrefix) {
        this.addStringEntry(LogEntryTags.MSGLogger, env.LOGGER);
    }

    if (env.isChild) {
        this.addStringEntry(LogEntryTags.MSGChildInfo, env.childPrefixString);
    }
};

/**
 * Add an entry to the InMemoryLog
 * @method
 * @param {number} tag the tag for the entry
 * @param {number} data the data value for the entry
 */
InMemoryLog.prototype.addNumberEntry = function (tag, data) {
    const block = this.ensureSlot();
    block.tags[block.epos] = tag;
    block.data[block.epos] = data;
    block.epos++;
};

/**
 * Add an entry to the InMemoryLog
 * @method
 * @param {number} tag the tag for the entry
 * @param {string} data the data value for the entry
 */
InMemoryLog.prototype.addStringEntry = function (tag, data) {
    const block = this.ensureSlot();
    block.tags[block.epos] = tag;

    let pid = block.stringMap.get(data);
    if (pid === undefined) {
        pid = this.stringCtr++;
        block.stringData[pid] = data;
        block.stringMap.set(data, pid);
    }
    block.data[block.epos] = pid;
    block.epos++;
};

/**
 * Add an entry to the InMemoryLog that has no extra data
 * @method
 * @param {number} tag the tag value for the entry
 */
InMemoryLog.prototype.addTagOnlyEntry = function (tag) {
    const block = this.ensureSlot();
    block.tags[block.epos] = tag;
    block.epos++;
};

/**
 * Add an entry to the InMemoryLog that has the common JsVarValue tag
 * @method
 * @param {number} tenum the TypeNameEnum value for the data
 * @param {*} data the data value for the entry
 */
InMemoryLog.prototype.addJsVarValueEntry = function (tenum, data) {
    switch (tenum) {
        case TypeNameEnum.TUndefined:
            this.addTagOnlyEntry(LogEntryTags.JsVarValue_Undefined);
            break;
        case TypeNameEnum.TNull:
            this.addTagOnlyEntry(LogEntryTags.JsVarValue_Null);
            break;
        case TypeNameEnum.TBoolean:
            this.addNumberEntry(LogEntryTags.JsVarValue_Bool, data ? 1 : 0);
            break;
        case TypeNameEnum.TNumber:
            this.addNumberEntry(LogEntryTags.JsVarValue_Number, data);
            break;
        case TypeNameEnum.TString:
            this.addStringEntry(LogEntryTags.JsVarValue_StringIdx, data);
            break;
        default:
            this.addTagOnlyEntry(LogEntryTags.JsBadFormatVar);
    }
};

/**
 * Add an expanded general value to the InMemoryLog
 * @method
 * @param {Object} obj the object to expand into the InMemoryLog
 * @param {number} depth the max depth to recursively expand the object
 * @param {number} length the max number of properties to expand
 */
InMemoryLog.prototype.addGeneralValue = function (value, depth, length) {
    const typeid = getTypeNameEnum(value);
    if (typeid <= TypeNameEnum.LastImmutableType) {
        this.addJsVarValueEntry(typeid, value);
    }
    else if (typeid === TypeNameEnum.TDate) {
        this.addNumberEntry(LogEntryTags.JsVarValue_Date, value.valueOf());
    }
    else if (typeid === TypeNameEnum.TObject) {
        this.addExpandedObject(value, depth, length);
    }
    else if (typeid === TypeNameEnum.TJsArray || typeid === TypeNameEnum.TTypedArray) {
        this.addExpandedArray(value, depth, length);
    }
    else {
        this.addTagOnlyEntry(LogEntryTags.OpaqueValue);
    }
};

/**
 * Add an expanded object value to the InMemoryLog
 * @method
 * @param {Object} obj the object to expand into the InMemoryLog
 * @param {number} depth the max depth to recursively expand the object
 * @param {number} length the max number of properties to expand
 */
InMemoryLog.prototype.addExpandedObject = function (obj, depth, length) {
    //if the value is in the set and is currently processing
    if (this.jsonCycleMap.has(obj)) {
        this.addTagOnlyEntry(LogEntryTags.CycleValue);
        return;
    }

    if (depth === 0) {
        this.addTagOnlyEntry(LogEntryTags.DepthBoundObject);
    }
    else {
        //Set processing as true for cycle detection
        this.jsonCycleMap.add(obj);
        this.addTagOnlyEntry(LogEntryTags.LParen);

        let allowedLengthRemain = length;
        for (const p in obj) {
            if (allowedLengthRemain <= 0) {
                this.addTagOnlyEntry(LogEntryTags.LengthBoundObject);
                break;
            }
            allowedLengthRemain--;

            this.addStringEntry(LogEntryTags.PropertyRecord, p);

            const value = obj[p];
            this.addGeneralValue(value, depth - 1, length);
        }

        //Set processing as false for cycle detection
        this.jsonCycleMap.delete(obj);
        this.addTagOnlyEntry(LogEntryTags.RParen);
    }
};

/**
 * Add an expanded array value to the InMemoryLog
 * @method
 * @param {Array} obj the array to expand into the InMemoryLog
 * @param {number} depth the max depth to recursively expand the array
 * @param {number} length the max number of index entries to expand
 */
InMemoryLog.prototype.addExpandedArray = function (obj, depth, length) {
    //if the value is in the set and is currently processing
    if (this.jsonCycleMap.has(obj)) {
        this.addTagOnlyEntry(LogEntryTags.CycleValue);
        return;
    }

    if (depth === 0) {
        this.addTagOnlyEntry(LogEntryTags.DepthBoundArray);
    }
    else {
        //Set processing as true for cycle detection
        this.jsonCycleMap.add(obj);
        this.addTagOnlyEntry(LogEntryTags.LBrack);

        for (let i = 0; i < obj.length; ++i) {
            const value = obj[i];
            this.addGeneralValue(value, depth - 1, length);

            if (i >= length - 1) {
                this.addTagOnlyEntry(LogEntryTags.LengthBoundArray);
                break;
            }
        }

        //Set processing as false for cycle detection
        this.jsonCycleMap.delete(obj);
        this.addTagOnlyEntry(LogEntryTags.RBrack);
    }
};

/**
 * Get the caller info for this call to logMsg
 */
function getCallerLineInfo(env) {
    const errstk = new Error()
        .stack
        .split("\n")
        .slice(2)
        .map((frame) => frame.substring(frame.indexOf("(") + 1, frame.lastIndexOf(")")))
        .filter((frame) => !frame.includes(env.logger_path));

    return errstk[0];
}

InMemoryLog.prototype.processImmutableHelper = function (oktenum, tenum, value) {
    if (oktenum === tenum) {
        this.addJsVarValueEntry(tenum, value);
    }
    else {
        this.addTagOnlyEntry(LogEntryTags.JsBadFormatVar);
    }
};

InMemoryLog.prototype.processDateHelper = function (vtype, value) {
    if (vtype === TypeNameEnum.TDate) {
        this.addNumberEntry(LogEntryTags.JsVarValue_Date, value.valueOf());
    }
    else {
        this.addTagOnlyEntry(LogEntryTags.JsBadFormatVar);
    }
};

/**
 * Log a message into the InMemoryLog
 * @method
 * @param {Object} env a record with the info for certain environment/expando formatter entries
 * @param {number} level the level the message is being logged at
 * @param {number} category the category the message is being logged at
 * @param {Object} fmt the format of the message
 * @param {number} argStart the first index of the real arguments
 * @param {Array} args the arguments for the format message
 */
InMemoryLog.prototype.logMessage = function (env, level, category, fmt, argStart, args) {
    this.addMsgHeader(fmt, level, category, env);

    let incTimeStamp = false;
    for (let i = 0; i < fmt.formatterArray.length; ++i) {
        const formatEntry = fmt.formatterArray[i];

        if (formatEntry.kind === FormatStringEntryKind.Literal) {
            //don't need to do anything!
        }
        else if (formatEntry.kind === FormatStringEntryKind.Expando) {
            const specEnum = formatEntry.enum;
            if (specEnum === FormatStringEnum.SOURCE) {
                this.addStringEntry(LogEntryTags.JsVarValue_StringIdx, getCallerLineInfo(env));
            }
            else if (specEnum === FormatStringEnum.WALLCLOCK) {
                this.addNumberEntry(LogEntryTags.JsVarValue_Number, Date.now());
            }
            else if (specEnum === FormatStringEnum.TIMESTAMP) {
                this.addNumberEntry(LogEntryTags.JsVarValue_Number, env.globalEnv.TIMESTAMP);
                incTimeStamp = true;
            }
            else if (specEnum === FormatStringEnum.CALLBACK) {
                this.addNumberEntry(LogEntryTags.JsVarValue_Number, env.globalEnv.CALLBACK);
            }
            else if (specEnum === FormatStringEnum.REQUEST) {
                this.addNumberEntry(LogEntryTags.JsVarValue_Number, env.globalEnv.REQUEST);
            }
            else if (specEnum === FormatStringEnum.LOGGER) {
                this.addStringEntry(LogEntryTags.JsVarValue_StringIdx, env.LOGGER);
            }
            else {
                //Otherwise the format macro should just be a constant value
            }
        }
        else {
            if (formatEntry.argPosition >= argStart + args.length) {
                //We hit a bad format value so rather than let it propigate -- report and move on.
                this.addTagOnlyEntry(LogEntryTags.JsBadFormatVar);
            }
            else {
                const value = args[argStart + formatEntry.argPosition];
                const vtype = getTypeNameEnum(value);

                switch (formatEntry.enum) {
                    case FormatStringEnum.BOOL:
                        this.processImmutableHelper(TypeNameEnum.TBoolean, vtype, value);
                        break;
                    case FormatStringEnum.NUMBER:
                        this.processImmutableHelper(TypeNameEnum.TNumber, vtype, value);
                        break;
                    case FormatStringEnum.STRING:
                        this.processImmutableHelper(TypeNameEnum.TString, vtype, value);
                        break;
                    case FormatStringEnum.DATEISO:
                    case FormatStringEnum.DATELOCAL:
                        this.processDateHelper(vtype, value);
                        break;
                    default:
                        this.addGeneralValue(value, formatEntry.expandDepth, formatEntry.expandLength);
                        break;
                }
            }
        }
    }

    if (incTimeStamp) {
        env.globalEnv.TIMESTAMP++;
    }

    this.addTagOnlyEntry(LogEntryTags.MsgEndSentinal);

    this.writeCount++;
};

/**
 * Filter out all the msgs that we want to drop when writing to disk and copy them to the pending write list.
 * Returns when we are both (1) under size limit and (2) the size limit -- setting them to Number.MAX_SAFE_INTEGER will effectively disable the check.
 * @method
 * @ returns true if there is data that was not processed (but will need to be processed eventually)
 */
InMemoryLog.prototype.processMessagesForWrite = function () {
    let keepProcessing = true;
    let newblock = true;
    do {
        let msgCount = 0;
        for (let cblock = this.head; cblock !== null; cblock = cblock.next) {
            msgCount += cblock.epos - cblock.spos;
        }

        if (msgCount === 0) {
            return false;
        }

        diaglog("InMemoryLog.processMessagesForWrite.processing", { blockId: this.head.blockId, msgCount: msgCount });
        const opos = this.head.spos;
        const complete = nlogger.processMsgsForEmit(this.head, newblock, msgCount, Date.now(), false);

        diaglog("InMemoryLog.processMessagesForWrite.complete", { processed: this.head.spos - opos });
        if (this.head.spos === this.head.epos) {
            diaglog("InMemoryLog.processMessagesForWrite.remove", { blockId: this.head.blockId });
            this.removeHeadBlock(this.head.epos - opos);
        }
        newblock = false;
        keepProcessing = !complete;
    } while (keepProcessing);

    return (this.head.spos !== this.head.epos) || (this.head.next != null);
};

/**
 * Filter out all the msgs that we want to drop when writing to disk and copy them to the pending write list -- process all records.
 * @method
 */
InMemoryLog.prototype.processMessagesForWrite_FullFlush = function (fulldetail) {
    let msgCount = 0;
    for (let cblock = this.head; cblock !== null; cblock = cblock.next) {
        msgCount += cblock.epos - cblock.spos;
    }

    if (msgCount === 0) {
        return;
    }

    let keepProcessing = true;
    let newblock = true;
    do {
        diaglog("InMemoryLog.processMessagesForWrite_FullFlush.processing", { blockId: this.head.blockId });
        const opos = this.head.spos;
        nlogger.processMsgsForEmit(this.head, newblock, msgCount, Date.now(), fulldetail);

        if (this.head.spos === this.head.epos) {
            diaglog("InMemoryLog.processMessagesForWrite_FullFlush.remove", { blockId: this.head.blockId });
            this.removeHeadBlock(this.head.epos - opos);
        }
        newblock = false;
        keepProcessing = !(this.head.next === null && this.head.spos === this.head.epos);
    } while (keepProcessing);
};

/////////////////////////////////////////////////////////////////////////////////////////////////
//Define the actual logger
const s_inMemoryLog = new InMemoryLog();

function isLevelEnabledForLogging(targetLevel, actualLevel) {
    return (targetLevel & actualLevel) === targetLevel;
}

//Special NOP implementations for disabled levels of logging
function doMsgLog_NOP(fmtorctgry, ...args) { }

//Special NOP implementations for disabled levels of logging
function doMsgLog_COND_NOP(cond, fmt, ...args) { }

function syncFlushAction() {
    if (s_inMemoryLog.getWriteCount() > s_environment.flushCount) {
        diaglog("syncFlushAction", { writeCount: s_inMemoryLog.getWriteCount(), flushCount: s_environment.flushCount });

        s_inMemoryLog.resetWriteCount();

        this.processMessagesForWrite();

        diaglog("syncFlushAction.formatMsgsSync");
        const output = nlogger.formatMsgsSync();

        diaglog("syncFlushAction.output", { target: s_environment.flushTarget });
        if (s_environment.flushTarget === "console") {
            process.stdout.write(output);
        }
        else if (s_environment.flushTarget === "stream") {
            try {
                s_environment.stream.write(output);
            }
            catch (wex) {
                diaglog("syncFlushAction.failedStreamWrite", { ex: wex.toString() });
                s_environment.flushTarget = "console";
                process.stdout.write(output);
            }
        }
        else {
            //
            //TODO: should be flushCBSync here
            //
        }
    }
}

let s_flushTimeout = undefined;
let s_formatPending = false;

function asyncFlushCallback() {
    try {
        diaglog("asyncFlushCallback", { flushtTimeout: s_flushTimeout, formatPending: s_formatPending });

        s_formatPending = true;

        if (s_flushTimeout !== undefined) {
            clearTimeout(s_flushTimeout);
        }
        s_flushTimeout = undefined;

        const hasmore = s_inMemoryLog.processMessagesForWrite();
        diaglog("asyncFlushCallback.process", { hasmore: hasmore });

        nlogger.formatMsgsAsync((err, result) => {
            diaglog("formatMsgsAsync.callback", { flushTimeout: s_flushTimeout, formatPending: s_formatPending });

            s_formatPending = false;

            if (nlogger.hasWorkPending()) {
                diaglog("formatMsgsAsync.callback.pending", { hasWorkPending: "hasWorkPending" });
                s_flushTimeout = setTimeout(asyncFlushCallback, 0);
            }
            else if (hasmore) {
                diaglog("formatMsgsAsync.callback.ms", { hasmore: hasmore });
                s_flushTimeout = setTimeout(asyncFlushCallback, 250);
            }
            else {
                diaglog("formatMsgsAsync.callback.nop");
            }

            if (err) {
                diaglog("formatMsgsAsync.callback.err", { error: err.toString() });
            }
            else {
                diaglog("formatMsgsAsync.callback.ok", { flushTarget: s_environment.flushTarget, resultSize: result.length });

                if (s_environment.flushTarget === "console") {
                    process.stdout.write(result);
                }
                else if (s_environment.flushTarget === "stream") {
                    try {
                        s_environment.stream.write(result);
                    }
                    catch (wex) {
                        diaglog("formatMsgsAsync.failedStreamWrite", { ex: wex.toString() });

                        s_environment.flushTarget = "console";
                        process.stdout.write(result);
                    }
                }
                else {
                    //
                    //TODO: we will need to have a flushCB, a flushCBSync, and a abortFlushCB to handle everything
                    //
                    s_environment.flushCB(err, result);
                }
            }
        }, s_environment.doPrefix);
    }
    catch (ex) {
        internalLogFailure("Hard failure in asyncFlushCallback", ex);
    }
}

function asyncFlushAction() {
    if (s_inMemoryLog.getWriteCount() > s_environment.flushCount) {
        diaglog("asyncFlushAction", { writeCount: s_inMemoryLog.getWriteCount(), flushCount: s_environment.flushCount, flushTimeout: s_flushTimeout, formatPending: s_formatPending });

        s_inMemoryLog.resetWriteCount();

        if (s_formatPending) {
            //don't mess around with async races and let it schedule when it is done -- but if we have lots of data process some here
            if (s_inMemoryLog.count() > nlogger.getMsgSlotLimit() * 4) {
                diaglog("asyncFlushAction.reducePressureFlush", { currentCount: s_inMemoryLog.count(), targetCount: nlogger.getMsgSlotLimit() });
                s_inMemoryLog.processMessagesForWrite();
            }

            return;
        }

        if (s_flushTimeout !== undefined) {
            diaglog("asyncFlushAction.cleartimeout");
            clearTimeout(s_flushTimeout);
        }

        s_flushTimeout = setTimeout(asyncFlushCallback, 0);
    }
    else {
        if (s_formatPending) {
            //don't mess around with async races and let it schedule when it is done
            return;
        }

        if (s_flushTimeout === undefined) {
            diaglog("asyncFlushAction.setTimeout");
            s_flushTimeout = setTimeout(asyncFlushCallback, 500);
        }
    }
}

function abortAsyncWork() {
    diaglog("abortAsyncWork", { formatPending: s_formatPending, flushTimeout: s_flushTimeout });

    if (s_flushTimeout !== undefined) {
        clearTimeout(s_flushTimeout);
        s_flushTimeout = undefined;
    }

    if (s_formatPending) {
        nlogger.abortAsyncWork();
        s_formatPending = false;
    }
}

function discardFlushAction() {
    s_inMemoryLog.reset(MemoryMsgBlockInitSize);
}

function nopFlushAction() {
    //no action
}

//////////
//Define the actual logger class that gets created for each module require

/**
 * Provide a way to bulk load formats from JSON object, array of JSON objects, file of JSON (or array of JSON), or array of files
 * @param {Object} logger
 * @param {Object|Array|String} arg
 */
function loadLoggerFormats(logger, arg) {
    const fs = require("fs");

    const garg = Array.isArray(arg) ? arg : [arg];
    let rargs = [];
    garg.forEach((sarg) => {
        const nfmts = (typeof (sarg) === "string") ? JSON.parse(fs.readFileSync(sarg)) : sarg;
        rargs = rargs.concat(Array.isArray(nfmts) ? nfmts : [nfmts]);
    });

    let allok = true;
    rargs.forEach((fmts) => {
        Object.keys(fmts).forEach((fmtname) => {
            allok &= logger.addFormat(fmtname, fmts[fmtname]);
        });
    });

    return allok;
}

/**
 * Provide a way to bulk load category configurations from JSON object, array of JSON objects, file of JSON (or array of JSON), or array of files
 * @param {Object} logger
 * @param {Object|Array|String} arg
 */
function loadLoggerCategories(logger, arg) {
    const fs = require("fs");

    const garg = Array.isArray(arg) ? arg : [arg];
    let rargs = [];
    garg.forEach((sarg) => {
        const nctgrys = (typeof (sarg) === "string") ? JSON.parse(fs.readFileSync(sarg)) : sarg;
        rargs = rargs.concat(Array.isArray(nctgrys) ? nctgrys : [nctgrys]);
    });

    let allok = true;
    rargs.forEach((ctgrys) => {
        Object.keys(ctgrys).forEach((ctgryname) => {
            allok &= logger.enableCategory(ctgryname, ctgrys[ctgryname]);
        });
    });

    return allok;
}

/**
 * Provide a way to bulk load sublogger configurations from JSON object or file of JSON
 * @param {Object} logger
 * @param {Object|String} arg
 */
function loadSubloggerConfigurations(logger, arg) {
    const fs = require("fs");

    const slconfigs = (typeof (arg) === "string") ? JSON.parse(fs.readFileSync(arg)) : arg;

    let allok = true;
    const disabled = (slconfigs.disabled || []);
    disabled.forEach((slname) => {
        allok &= logger.disableSubLogger(slname);
    });

    const configured = slconfigs.enabled || {};
    Object.keys(configured).forEach((slname) => {
        allok &= logger.setSubLoggerLevel(slname, LoggingLevels[configured[slname]]);
    });

    return allok;
}

/**
* Constructor for a Logger
* @constructor
* @param {string} loggerName name of the logger this is defined for
* @param {Object} options the options for this logger
*/
function Logger(loggerName, options) {
    //Level that this logger will record at going into memory
    let m_memoryLogLevel = LoggingLevels[options.memoryLevel];

    this.logger_env = {
        globalEnv: s_globalenv,
        logger_path: __filename,
        LOGGER: loggerName
    };
    this.isChild = false;

    this.childLogger = function (childPrefix) {
        const cenv = {};
        Object.keys(this.logger_env).forEach((p) => {
            cenv[p] = this.logger_env[p];
        });
        cenv.LOGGER = this.logger_env.LOGGER + ".child";

        cenv.childPrefix = {};
        if (this.childPrefix) {
            Object.keys(this.childPrefix).forEach((p) => {
                cenv.childPrefix[p] = this.childPrefix[p];
            });
        }
        if (childPrefix !== null && typeof (childPrefix) === "object") {
            Object.keys(childPrefix).forEach((p) => {
                cenv.childPrefix[p] = childPrefix[p];
            });
        }
        cenv.childPrefixString = JSON.stringify(cenv.childPrefix);

        return Object.create(this, { logger_env: cenv, isChild: true });
    };

    /**
     * Set the logging level for this logger
     * @param {number} logLevel
     */
    this.setLoggingLevel = function (logLevel) {
        if (typeof (logLevel) !== "number" || this.isChild) {
            return;
        }

        try {
            let slogLevel = sanitizeLogLevel(logLevel);
            diaglog("setLoggingLevel", { level: slogLevel });

            if (s_rootLogger !== this) {
                if (s_disabledSubLoggerNames.has(loggerName)) {
                    slogLevel = LoggingLevels.OFF;
                }
                else {
                    const enabledlevel = s_enabledSubLoggerNames.get(loggerName);
                    slogLevel = enabledlevel !== undefined ? enabledlevel : s_environment.defaultSubLoggerLevel;
                }

                diaglog("setLoggingLevel.sublogger", { level: slogLevel });
            }

            if (m_memoryLogLevel !== slogLevel) {
                diaglog("setLoggingLevel.update");
                updateLoggingFunctions(this, m_memoryLogLevel);
            }
        }
        catch (ex) {
            internalLogFailure("Hard failure in setLoggingLevel", ex);
        }
    };

    /**
     * Set the emit logging level
    * @param {number} logLevel
    */
    this.setEmitLevel = function (logLevel) {
        if (typeof (logLevel) !== "number" || this.isChild) {
            return;
        }

        try {
            if (s_rootLogger !== this) {
                return;
            }

            const slogLevel = sanitizeLogLevel(logLevel);
            diaglog("setEmitLevel", { level: slogLevel });

            if (nlogger.getEmitLevel() !== slogLevel) {
                diaglog("setLoggingLevel.update");

                s_inMemoryLog.processMessagesForWrite_FullFlush(false);
                nlogger.setEmitLevel(slogLevel);
            }
        }
        catch (ex) {
            internalLogFailure("Hard failure in setLoggingLevel", ex);
        }
    };

    /**
     * Enable a logging category for this logger
     * @param {string} name the name of the category to enable
     * @param {boolean|undefined} enabled the (optional) boolean enabled value (default is true)
     * @returns true if the category was defined and enabled successfully false otherwise
     */
    this.enableCategory = function (name, enabled) {
        if (typeof (name) !== "string" || this.isChild || (enabled !== undefined && typeof (enabled) !== "boolean")) {
            //This is a "safe" failure so just warn and continue
            diaglog("enableCategory.failure", { name: name, enabled: enabled });
            return false;
        }

        try {
            let cid = s_categoryNames.get(name);
            if (cid === undefined) {
                cid = s_categoryNames.size;
                s_categoryNames.set(name, cid);
                nlogger.addCategory(cid, name);
            }

            if (this === s_rootLogger) {
                s_enabledCategories[cid] = (enabled === undefined || enabled === true);
            }
            else {
                s_enabledCategories[cid] = s_enabledCategories[cid] || false;
            }

            this["$$" + name] = -cid;
            return true;
        }
        catch (ex) {
            //This is a "safe" failure so just warn and continue
            diaglog("enableCategory.failure", { name: name, enabled: enabled, ex: ex.toString() });
            return false;
        }
    };

    /**
     * Enable a logging categories for this logger from files or JSON
     * @param {string|string[]|JSON|JSON[]} arg JSON object(s) of catetory enabled/disabled or file(s) to load this information from
     * @returns true if all categories were enabled successfully false otherwise
     */
    this.enableCategories = function (arg) {
        try {
            return loadLoggerCategories(this, arg);
        }
        catch (ex) {
            //This is a "safe" failure so just warn and continue
            diaglog("enableCategories.failure", { arg: arg, ex: ex.toString() });
            return false;
        }
    };

    /**
     * Update the logical time/requestId/callbackId/etc.
     */
    this.incrementLogicalTime = function () { s_globalenv.TIMESTAMP++; };

    this.getCurrentRequestId = function () { return s_globalenv.REQUEST; };
    this.setCurrentRequestId = function (requestId) { s_globalenv.REQUEST = requestId; };

    this.getCurrentCallbackId = function () { return s_globalenv.CALLBACK; };
    this.setCurrentCallbackId = function (callbackId) { s_globalenv.CALLBACK = callbackId; };

    /**
     * Add a format to the logger
     * @param {string} fmtName the name to give the format
     * @param {string|JSON} fmtInfo the descriptor for the format as printf style or JSON style
     * @returns true if the format was successfully registered false otherwise
     */
    this.addFormat = function (fmtName, fmtInfo) {
        if (this.isChild) {
            return false;
        }

        try {
            this["$" + fmtName] = extractMsgFormat(fmtName, fmtInfo);
            return true;
        }
        catch (ex) {
            //This is a "safe" failure so just warn and continue
            diaglog("addFormat.failure", { fmtName: fmtName, fmtInfo: fmtInfo, ex: ex.toString() });
            return false;
        }
    };

    /**
     * Add formats for this logger from files or JSON
     * @param {string|string[]|JSON|JSON[]} arg JSON object(s) of catetory enabled/disabled or file(s) to load this information from
     * @returns true if all categories were enabled successfully false otherwise
     */
    this.addFormats = function (arg) {
        try {
            return loadLoggerFormats(this, arg);
        }
        catch (ex) {
            //This is a "safe" failure so just warn and continue
            diaglog("addFormats.failure", { arg: arg, ex: ex.toString() });
            return false;
        }
    };

    /**
     * Set the timeout limit for messages in the worklist
     */
    this.setMsgTimeLimit = function (timeLimit) {
        if (typeof (timeLimit) !== "number" || this.isChild) {
            return;
        }

        try {
            if (s_rootLogger === this) {
                diaglog("setMsgTimeLimit.update");
                nlogger.SetMsgTimeLimit(timeLimit);
            }
        }
        catch (ex) {
            internalLogFailure("Hard failure in setMsgTimeLimit", ex);
        }
    };

    /**
     * Set the space limit for messages in the worklist
     */
    this.setMsgSpaceLimit = function (spaceLimit) {
        if (typeof (spaceLimit) !== "number" || this.isChild) {
            return;
        }

        try {
            if (s_rootLogger === this) {
                diaglog("setMsgSpaceLimit.update");
                nlogger.SetMsgSpaceLimit(spaceLimit);
            }
        }
        catch (ex) {
            internalLogFailure("Hard failure in setMsgSpaceLimit", ex);
        }
    };

    function generateImplicitFormat(fmtInfo, args) {
        if (fmtInfo === null) {
            diaglog("generateImplicitFormat.badformat", { fmtInfo: fmtInfo });
            return; //technically an object but not ok with us
        }

        //Get the line string of the caller
        const cstack = new Error()
            .stack
            .split("\n")
            .slice(2);
        const lfilename = cstack[0];

        if (typeof (fmtInfo) === "string") {
            return extractMsgFormat(lfilename, fmtInfo);
        }
        else {
            args.unshift(fmtInfo);
            return extractMsgFormat(lfilename, "%{0:g}");
        }
    }

    function processImplicitFormat(lenv, fmtInfo, level, args) {
        const fmti = generateImplicitFormat(fmtInfo, args);

        const fmt = s_fmtMap[fmti];
        if (fmti === undefined) {
            diaglog("processDefaultCategoryFormat.undef", { fmti: fmti });
            return;
        }

        s_inMemoryLog.logMessage(lenv, level, 2 /*explicit category*/, fmt, 0, args);
        s_environment.flushAction();
    }

    function processDefaultCategoryFormat(lenv, fmti, level, args) {
        const fmt = s_fmtMap[fmti];
        if (fmti === undefined) {
            diaglog("processDefaultCategoryFormat.undef", { fmti: fmti });
            return;
        }

        s_inMemoryLog.logMessage(lenv, level, 1 /*default category*/, fmt, 0, args);
        s_environment.flushAction();
    }

    function processExplicitCategoryFormat(lenv, categoryi, level, args) {
        const rcategory = -categoryi;
        if (s_enabledCategories[rcategory]) {
            if (args.length < 1) {
                diaglog("processExplicitCategoryFormat.args");
                return;
            }

            const fmt = s_fmtMap.get(args[0]);
            if (fmt === undefined) {
                diaglog("processExplicitCategoryFormat.undef", { fmti: args[0] });
                return;
            }

            s_inMemoryLog.logMessage(lenv, level, rcategory, fmt, 1, args);
            s_environment.flushAction();
        }
    }

    function getMsgLogGenerator(desiredLevel) {
        const fixedLevel = desiredLevel;
        return function (fmtorctgry, ...args) {
            try {
                const tsw = typeof (fmtorctgry);
                if (tsw === "number") {
                    if (fmtorctgry >= 0) {
                        processDefaultCategoryFormat(this.logger_env, fmtorctgry, fixedLevel, args);
                    }
                    else {
                        processExplicitCategoryFormat(this.logger_env, fmtorctgry, fixedLevel, args);
                    }
                }
                if (tsw === "string" || tsw === "object") {
                    processImplicitFormat(this.logger_env, fmtorctgry, fixedLevel, args);
                }
                else {
                    diaglog("logaction.badformat", { fmtorctgry: fmtorctgry });
                }
            }
            catch (ex) {
                internalLogFailure("Hard failure in logging", ex);
            }
        };
    }

    function getConditionalMsgLogGenerator(desiredLevel) {
        const fixedLevel = desiredLevel;
        return function (cond, fmtorctgry, ...args) {
            if (!cond) {
                return;
            }

            try {
                const tsw = typeof (fmtorctgry);
                if (tsw === "number") {
                    if (fmtorctgry >= 0) {
                        processDefaultCategoryFormat(this.logger_env, fmtorctgry, fixedLevel, args);
                    }
                    else {
                        processExplicitCategoryFormat(this.logger_env, fmtorctgry, fixedLevel, args);
                    }
                }
                else if (tsw === "string" || tsw === "object") {
                    processImplicitFormat(this.logger_env, fmtorctgry, fixedLevel, args);
                }
                else {
                    diaglog("logaction.badformat", { fmtorctgry: fmtorctgry });
                }
            }
            catch (ex) {
                internalLogFailure("Hard failure in logging", ex);
            }
        };
    }

    function updateLoggingFunctions(logger, logLevel) {
        m_memoryLogLevel = logLevel;

        logger.fatal = isLevelEnabledForLogging(LoggingLevels.FATAL, m_memoryLogLevel) ? getMsgLogGenerator(LoggingLevels.FATAL) : doMsgLog_NOP;
        logger.error = isLevelEnabledForLogging(LoggingLevels.ERROR, m_memoryLogLevel) ? getMsgLogGenerator(LoggingLevels.ERROR) : doMsgLog_NOP;
        logger.warn = isLevelEnabledForLogging(LoggingLevels.WARN, m_memoryLogLevel) ? getMsgLogGenerator(LoggingLevels.WARN) : doMsgLog_NOP;
        logger.info = isLevelEnabledForLogging(LoggingLevels.INFO, m_memoryLogLevel) ? getMsgLogGenerator(LoggingLevels.INFO) : doMsgLog_NOP;
        logger.detail = isLevelEnabledForLogging(LoggingLevels.DETAIL, m_memoryLogLevel) ? getMsgLogGenerator(LoggingLevels.DETAIL) : doMsgLog_NOP;
        logger.debug = isLevelEnabledForLogging(LoggingLevels.DEBUG, m_memoryLogLevel) ? getMsgLogGenerator(LoggingLevels.DEBUG) : doMsgLog_NOP;
        logger.trace = isLevelEnabledForLogging(LoggingLevels.TRACE, m_memoryLogLevel) ? getMsgLogGenerator(LoggingLevels.TRACE) : doMsgLog_NOP;

        logger.fatalIf = isLevelEnabledForLogging(LoggingLevels.FATAL, m_memoryLogLevel) ? getConditionalMsgLogGenerator(LoggingLevels.FATAL) : doMsgLog_COND_NOP;
        logger.errorIf = isLevelEnabledForLogging(LoggingLevels.ERROR, m_memoryLogLevel) ? getConditionalMsgLogGenerator(LoggingLevels.ERROR) : doMsgLog_COND_NOP;
        logger.warnIf = isLevelEnabledForLogging(LoggingLevels.WARN, m_memoryLogLevel) ? getConditionalMsgLogGenerator(LoggingLevels.WARN) : doMsgLog_COND_NOP;
        logger.infoIf = isLevelEnabledForLogging(LoggingLevels.INFO, m_memoryLogLevel) ? getConditionalMsgLogGenerator(LoggingLevels.INFO) : doMsgLog_COND_NOP;
        logger.detailIf = isLevelEnabledForLogging(LoggingLevels.DETAIL, m_memoryLogLevel) ? getConditionalMsgLogGenerator(LoggingLevels.DETAIL) : doMsgLog_COND_NOP;
        logger.debugIf = isLevelEnabledForLogging(LoggingLevels.DEBUG, m_memoryLogLevel) ? getConditionalMsgLogGenerator(LoggingLevels.DEBUG) : doMsgLog_COND_NOP;
        logger.traceIf = isLevelEnabledForLogging(LoggingLevels.TRACE, m_memoryLogLevel) ? getConditionalMsgLogGenerator(LoggingLevels.TRACE) : doMsgLog_COND_NOP;
    }
    updateLoggingFunctions(this, m_memoryLogLevel);

    /**
    * Synchronously emit as much of the in-memory and emit buffer as possible
    * @method
    */
    this.emitLogSync = function (processall, includeFullDetail, optTimingInfo) {
        try {
            if (s_rootLogger === this) {
                diaglog("emitLogSync", { includeFullDetail: includeFullDetail });
                abortAsyncWork();

                diaglog("emitLogSync.process");
                const timingInfo = optTimingInfo || {};
                timingInfo.pstart = new Date();
                if (processall) {
                    s_inMemoryLog.processMessagesForWrite_FullFlush(includeFullDetail);
                }
                else {
                    s_inMemoryLog.processMessagesForWrite();
                }
                timingInfo.pend = new Date();

                diaglog("emitLogSync.format");
                timingInfo.fstart = new Date();
                const result = nlogger.formatMsgsSync(s_environment.doPrefix);
                timingInfo.fend = new Date();

                return result;
            }
        }
        catch (ex) {
            internalLogFailure("Hard failure in emit on emitLogSync", ex);
        }
    };

    /**
    * Explicitly set the named sublogger to the given level (now or later)
    * @method
    * @param {string} subloggerName the name of the sub-logger to enable
    * @param {number} level the level that the sub-logger is allowed to emit at
    */
    this.setSubLoggerLevel = function (subloggerName, level) {
        if (typeof (subloggerName) !== "string" || typeof (level) !== "number" || this.isChild) {
            return false;
        }

        try {
            if (s_rootLogger === this) {
                diaglog("setSubLoggerLevel", { name: subloggerName, level: level });

                s_enabledSubLoggerNames.add(subloggerName, level);
                s_disabledSubLoggerNames.delete(subloggerName);

                if (s_loggerMap.has(subloggerName)) {
                    s_loggerMap.get(subloggerName).setLoggingLevel(level);
                }
            }
            return true;
        }
        catch (ex) {
            internalLogFailure("Hard failure in enableSubLogger", ex);
            return false;
        }
    };

    /**
    * Explicitly disable a specifc sub-logger -- entirely suppress the output from it
    * @method
    * @param {string} subloggerName the name of the sub-logger to enable
    */
    this.disableSubLogger = function (subloggerName) {
        if (typeof (subloggerName) !== "string" || this.isChild) {
            return false;
        }

        try {
            if (s_rootLogger === this) {
                diaglog("disableSubLogger", { name: subloggerName });

                s_enabledSubLoggerNames.delete(subloggerName);
                s_disabledSubLoggerNames.add(subloggerName);

                if (s_loggerMap.has(subloggerName)) {
                    s_loggerMap.get(subloggerName).setLoggingLevel(LoggingLevels.OFF);
                }
            }
            return true;
        }
        catch (ex) {
            internalLogFailure("Hard failure in disableSubLogger", ex);
            return false;
        }
    };

    /**
     * Configure subloggers from files or JSON
     * @param {string|JSON} arg JSON object(s) of catetory enabled/disabled or file(s) to load this information from
     * @returns true if all configurations were successful false otherwise
     */
    this.configureSubloggers = function (arg) {
        try {
            return loadSubloggerConfigurations(this, arg);
        }
        catch (ex) {
            internalLogFailure("Hard failure in configureSubloggers", ex);
            return false;
        }
    };
}

/////////////////////////////
//Code for creating and managing the logging system

/**
 * Global variables for the logger factor and root logger -- lazily instantiated
 */
let s_rootLogger = null;

/**
 * Map of logger names that are enabled for sub-logging + level cap override
 */
const s_disabledSubLoggerNames = new Set();
const s_enabledSubLoggerNames = new Map();

/**
 * Map of the loggers created for various logger names
 */
const s_loggerMap = new Map();

function processSimpleOption(options, realOptions, name, typestr, pred, defaultvalue) {
    realOptions[name] = (options[name] && typeof (options[name]) === typestr && pred(options[name])) ? options[name] : defaultvalue;
}

function processLogOnTermination(iserror) {
    diaglog("processLogOnTermination", { iserror: iserror });

    const finallog = s_rootLogger.emitLogSync(true, iserror);

    if (s_environment.flushTarget === "console") {
        process.stdout.write(finallog);
    }
    else if (s_environment.flushTarget === "stream") {
        try {
            s_environment.stream.end(finallog);
        }
        catch (wex) {
            diaglog("formatMsgsAsync.failedStreamWrite", { ex: wex.toString() });
        }
    }
    else {
        //
        //TODO: should be flushCBSync here
        //
    }
}

/**
 * Logger constructor function.
 * @exports
 * @function
 * @param {string} name of the logger object to construct (calls with the same name will return an aliased logger object)
 * @param {Object} options an object with other options for the construction (undefined => default options)
 */
module.exports = function (name, options) {
    if (typeof (name) !== "string") {
        throw new Error(`Expected name of logger but got ${name}`);
    }
    options = options || {};
    diaglog("logger.options", { name: name, options: options });

    const debuggerAttached = /--inspect/.test(process.execArgv.join(" "));

    const ropts = {
        host: require("os").hostname()
    };

    processSimpleOption(options, ropts, "memoryLevel", "string", (optv) => LoggingLevels[optv] !== undefined, "DETAIL");

    processSimpleOption(options, ropts, "emitLevel", "string", (optv) => LoggingLevels[optv] !== undefined, "INFO");
    ropts.emitLevel = (LoggingLevels[ropts.emitLevel] <= LoggingLevels[ropts.memoryLevel]) ? ropts.emitLevel : ropts.memoryLevel;

    processSimpleOption(options, ropts, "defaultSubloggerLevel", "string", (optv) => LoggingLevels[optv] !== undefined, "WARN");

    if (debuggerAttached && !options.disableAutoDebugger) {
        processSimpleOption(options, ropts, "flushCount", "number", (optv) => optv >= 0, 0);
        processSimpleOption(options, ropts, "flushTarget", "string", (optv) => /console|stream|callback/.test(optv), "console");
        processSimpleOption(options, ropts, "flushMode", "string", (optv) => /SYNC|ASYNC|NOP|DISCARD/.test(optv), "SYNC");
        processSimpleOption(options, ropts, "flushCallback", "function", (optv) => true, () => { });
    }
    else {
        processSimpleOption(options, ropts, "flushCount", "number", (optv) => optv >= 0, MemoryMsgBlockInitSize / 4);
        processSimpleOption(options, ropts, "flushTarget", "string", (optv) => /console|stream|callback/.test(optv), "console");
        processSimpleOption(options, ropts, "flushMode", "string", (optv) => /SYNC|ASYNC|NOP|DISCARD/.test(optv), "ASYNC");
        processSimpleOption(options, ropts, "flushCallback", "function", (optv) => true, () => { });
    }

    if (ropts.flushTarget === "stream") {
        if (options.stream === undefined) {
            ropts.flushMode = "console";
        }
        else {
            ropts.stream = options.stream;
        }
    }

    processSimpleOption(options, ropts, "doPrefix", "boolean", (optv) => true, false);

    processSimpleOption(options, ropts, "bufferSizeLimit", "number", (optv) => optv >= 0, 4096);
    processSimpleOption(options, ropts, "bufferTimeLimit", "number", (optv) => optv >= 0, 500);

    processSimpleOption(options, ropts, "formats", undefined, (optv) => (typeof (optv) === "string" || typeof (optv) === "object"), undefined);
    processSimpleOption(options, ropts, "categories", undefined, (optv) => (typeof (optv) === "string" || typeof (optv) === "object"), undefined);
    processSimpleOption(options, ropts, "subloggers", undefined, (optv) => (typeof (optv) === "string" || typeof (optv) === "object"), undefined);

    //special diagnostics flags
    processSimpleOption(options, ropts, "enableDiagnosticLog", "boolean", (optv) => true, false);
    if (ropts.enableDiagnosticLog) {
        processSimpleOption(options, ropts, "diagnosticLogStream", "object", (optv) => true, null);
    }

    diaglog("logger.ropts", { ropts: ropts });

    let logger = s_loggerMap.get(name);
    try {
        if (!logger) {
            diaglog("logger.create");

            //Get the filename of the caller
            const cstack = new Error()
                .stack
                .split("\n")
                .slice(2)
                .map(function (frame) {
                    return frame.substring(frame.indexOf("(") + 1, frame.lastIndexOf(".js:") + 3);
                });
            const lfilename = cstack[0];

            s_environment.defaultSubLoggerLevel = options.defaultSubloggerLevel;

            if (require.main.filename !== lfilename) {
                if (s_disabledSubLoggerNames.has(lfilename) || s_rootLogger === null) {
                    ropts.memoryLevel = LoggingLevels.OFF;
                }
                else {
                    const enabledlevel = s_enabledSubLoggerNames.get(lfilename);
                    ropts.memoryLevel = enabledlevel !== undefined ? enabledlevel : s_environment.defaultSubLoggerLevel;
                }
            }

            logger = new Logger(name, ropts);
            logger.Levels = LoggingLevels;
            logger.$$default = -1;

            if (require.main.filename === lfilename) {
                diaglog("logger.create.root");

                if (ropts.enableDiagnosticLog && ropts.diagnosticLogStream) {
                    diaglog_wstream = ropts.diagnosticLogStream;
                    diaglog = diaglog_enabled;
                }

                s_rootLogger = logger;

                s_environment.flushCount = ropts.flushCount;

                if (ropts.flushMode === "SYNC") {
                    s_environment.flushAction = syncFlushAction;
                }
                else if (ropts.flushMode === "ASYNC") {
                    s_environment.flushAction = asyncFlushAction;
                }
                else if (ropts.flushMode === "NOP") {
                    s_environment.flushAction = nopFlushAction;
                }
                else {
                    s_environment.flushAction = discardFlushAction;
                }

                s_environment.flushTarget = ropts.flushTarget;
                s_environment.flushCB = ropts.flushCB;
                s_environment.doPrefix = ropts.doPrefix;

                if (ropts.stream !== undefined) {
                    s_environment.stream = ropts.stream;
                }

                nlogger.initializeLogger(LoggingLevels[ropts.emitLevel], os.hostname(), lfilename);
                nlogger.setMsgSlotLimit(ropts.bufferSizeLimit);
                nlogger.setMsgTimeLimit(ropts.bufferTimeLimit);

                process.on("exit", (code) => {
                    processLogOnTermination(code !== 0);
                });

                process.on("uncaughtException", () => {
                    processLogOnTermination(true);
                });

                if (ropts.subloggers !== undefined) {
                    //this can throw and we want to catch in the general config handler below
                    loadSubloggerConfigurations(s_rootLogger, ropts.subloggers);
                }

                s_loggerMap.forEach((v, k) => {
                    v.setLoggingLevel(s_environment.defaultSubLoggerLevel);
                });

                if (ropts.formats !== undefined) {
                    //this can throw and we want to catch in the general config handler below
                    loadLoggerFormats(s_rootLogger, ropts.formats);
                }

                if (ropts.categories !== undefined) {
                    //this can throw and we want to catch in the general config handler below
                    loadLoggerCategories(s_rootLogger, ropts.categories);
                }
            }

            s_loggerMap.set(name, logger);
        }
    }
    catch (lcex) {
        internalLogFailure("Hard Failure in logger creation", lcex);
    }

    return logger;
};
