"use strict";

const assert = require("assert");
const path = require("path");

/////////////////////////////////////////////////////////////////////////////////////////////////
//Start off with a bunch of costant definitions.
//In a number of cases we don't actually define here. Instead we have a comment and literal value which
//  we actually put in the code where needed (so no need to load in bytecode and very obvious for JIT).

/**
 * Global map of ids -> format specifications
 */
const s_fmtMap = new Map();

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

const LoggingLevelToNameMap = [];
LoggingLevelToNameMap[0x0] = "OFF";
LoggingLevelToNameMap[0x1] = "FATAL";
LoggingLevelToNameMap[0x3] = "ERROR";
LoggingLevelToNameMap[0x7] = "WARN";
LoggingLevelToNameMap[0xF] = "INFO";
LoggingLevelToNameMap[0x1F] = "DEBUG";
LoggingLevelToNameMap[0x3F] = "TRACE";
LoggingLevelToNameMap[0xFF] = "ALL";

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
//ExpandDefaults_Depth 2
//ExpandDefaults_ObjectLength 1024
//ExpandDefaults_ArrayLength 128

/**
 * Enum values indicating the kind of each format entry
 */
//FormatStringEntryKind_Literal 0x1
//FormatStringEntryKind_Expando 0x2
//FormatStringEntryKind_Basic 0x3
//FormatStringEntryKind_Compound 0x4

/**
 * Enum values for the format string singletons
 */
//SingletonFormatStringEntry_HASH 0x11
//SingletonFormatStringEntry_HOST 0x12
//SingletonFormatStringEntry_APP 0x13
//SingletonFormatStringEntry_MODULE 0x14
//SingletonFormatStringEntry_SOURCE 0x15
//SingletonFormatStringEntry_WALLCLOCK 0x16
//SingletonFormatStringEntry_TIMESTAMP 0x17
//SingletonFormatStringEntry_CALLBACK 0x18
//SingletonFormatStringEntry_REQUEST 0x19

//SingletonFormatStringEntry_PERCENT 0x21
//SingletonFormatStringEntry_BOOL 0x22
//SingletonFormatStringEntry_NUMBER 0x23
//SingletonFormatStringEntry_STRING 0x24
//SingletonFormatStringEntry_DATEISO 0x25
//SingletonFormatStringEntry_DATEUTC 0x26
//SingletonFormatStringEntry_DATELOCAL 0x27
//SingletonFormatStringEntry_GENERAL 0x28
//SingletonFormatStringEntry_OBJECT 0x29
//SingletonFormatStringEntry_ARRAY 0x2A

/**
 * Enum values for the types we consider javascript values having for logging purposes
 */
//TypeNameEnum_TUndefined 0x31
//TypeNameEnum_TNull 0x32
//TypeNameEnum_TBoolean 0x33
//TypeNameEnum_TNumber 0x34
//TypeNameEnum_TString 0x35
//TypeNameEnum_LastImmutableType 0x35
//TypeNameEnum_TDate 0x36
//TypeNameEnum_TFunction 0x37
//TypeNameEnum_TObject 0x38
//TypeNameEnum_TJsArray 0x39
//TypeNameEnum_TTypedArray 0x3A
//TypeNameEnum_TUnknown 0x3B
//TypeNameEnum_TypeLimit 0x3C

const TypeNameToFlagEnum = {
    "[object Undefined]": /*TypeNameEnum_TUndefined*/0x31,
    "[object Null]": /*TypeNameEnum_TNull*/0x32,
    "[object Boolean]": /*TypeNameEnum_TBoolean*/0x33,
    "[object Number]": /*TypeNameEnum_TNumber*/0x34,
    "[object String]": /*TypeNameEnum_TString*/0x35,
    "[object Date]": /*TypeNameEnum_TDate*/0x36,
    "[object Function]": /*TypeNameEnum_TFunction*/0x37,
    "[object Object]": /*TypeNameEnum_TObject*/0x38,
    "[object Array]": /*TypeNameEnum_TJsArray*/0x39,
    "[object Float32Array]": /*TypeNameEnum_TTypedArray*/0x3A,
    "[object Float64Array]": /*TypeNameEnum_TTypedArray*/0x3A,
    "[object Int8Array]": /*TypeNameEnum_TTypedArray*/0x3A,
    "[object Int16Array]": /*TypeNameEnum_TTypedArray*/0x3A,
    "[object Int32Array]": /*TypeNameEnum_TTypedArray*/0x3A,
    "[object Uint8Array]": /*TypeNameEnum_TTypedArray*/0x3A,
    "[object Uint16Array]": /*TypeNameEnum_TTypedArray*/0x3A,
    "[object Uint32Array]": /*TypeNameEnum_TTypedArray*/0x3A
};

/**
 * Get the enumeration tag for the type of value
 * @param {object} value
 * @returns TypeNameToFlagEnum value
 */
function getTypeNameEnum(value) {
    return TypeNameToFlagEnum[toString.call(value)] || /*TypeNameEnum_TUnknown*/0x3B;
}

/**
 * Tag values indicating the kind of each entry in the fast log buffer
 */
//LogEntryTags_Clear 0x0
//LogEntryTags_MsgFormat 0x1
//LogEntryTags_MsgLevel 0x2
//LogEntryTags_MsgCategory 0x3
//LogEntryTags_MsgEndSentinal 0x4
//LogEntryTags_LParen 0x5
//LogEntryTags_RParen 0x6
//LogEntryTags_LBrack 0x7
//LogEntryTags_RBrack 0x8
//LogEntryTags_PropertyRecord 0x9
//LogEntryTags_JsBadFormatVar 0xA
//LogEntryTags_JsVarValue 0xB
//LogEntryTags_LengthBoundHit 0xC
//LogEntryTags_CycleValue 0xD
//LogEntryTags_OpaqueValue 0xF
//LogEntryTags_DepthBoundObject 0x20
//LogEntryTags_DepthBoundArray 0x21
//LogEntryTags_MsgWallTime 0x22

//Tags for formatter special encodings of JsVarValues
//LogEntryTags_JsVarValue_Undefined 0x30
//LogEntryTags_JsVarValue_Null 0x31
//LogEntryTags_JsVarValue_Bool 0x32
//LogEntryTags_JsVarValue_Number 0x34
//LogEntryTags_JsVarValue_StringIdx 0x38
//LogEntryTags_JsVarValue_Date 0x3A

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
//#module    -- name of the module
//#source    -- source location of log statment (file, line)
//#wallclock -- wallclock timestamp (defaults to utc)
//#timestamp -- logical timestamp
//#callback  -- the current callback id
//#request   -- the current request id (for http requests)
//##         -- a literal #
////

////
//Valid format specifiers are:
//%{p:b} -- a boolean value
//%{p:n} -- a number
//%{p:s} -- a string
//%{p:d-xxx} -- a date formatted as iso, utc, or local
//%{p:o<d,l>} -- an object expanded up to d levels (default is 2) at most l items in any level (default is * for objects 128 for arrays)
//%{p:a<d,l>} -- an array expanded up to d levels (default is 2) at most l items in any level (default is * for objects 128 for arrays)
//%{p:g} -- general value (general format applied -- no array expansion, object depth of 2)
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
 * Create a format string entry
 * @function
 * @param {string} name the name to use in the macroInfo object when extracting
 * @param {number} kind the FormatStringEntryKind_X tag
 * @param {string} label the string label that appears in a format string
 * @param {number} tag a unique incremented tag for fast integer compare
 * @param {bool} isSingleSlot true if this format is always stored in a single slot
 */
function generateSingletonFormatStringEntry(name, kind, label, tag, isSingleSlot) {
    return {
        name: name,
        kind: kind,
        label: label,
        enum: tag,
        isSingleSlot: isSingleSlot
    };
}

/**
 * Object singletons for format entries
 */
const FormatStringEntrySingletons = {
    HASH: generateSingletonFormatStringEntry("HASH", /*FormatStringEntryKind_Literal*/0x1, "#", /*SingletonFormatStringEntry_HASH*/0x11, true),
    HOST: generateSingletonFormatStringEntry("HOST", /*FormatStringEntryKind_Expando*/0x2, "#host", /*SingletonFormatStringEntry_HOST*/0x12, true),
    APP: generateSingletonFormatStringEntry("APP", /*FormatStringEntryKind_Expando*/0x2, "#app", /*SingletonFormatStringEntry_APP*/0x13, true),
    MODULE: generateSingletonFormatStringEntry("MODULE", /*FormatStringEntryKind_Expando*/0x2, "#module", /*SingletonFormatStringEntry_MODULE*/0x14, true),
    SOURCE: generateSingletonFormatStringEntry("SOURCE", /*FormatStringEntryKind_Expando*/0x2, "#source", /*SingletonFormatStringEntry_SOURCE*/0x15, true),
    WALLCLOCK: generateSingletonFormatStringEntry("WALLCLOCK", /*FormatStringEntryKind_Expando*/0x2, "#wallclock", /*SingletonFormatStringEntry_WALLCLOCK*/0x16, true),
    TIMESTAMP: generateSingletonFormatStringEntry("TIMESTAMP", /*FormatStringEntryKind_Expando*/0x2, "#timestamp", /*SingletonFormatStringEntry_TIMESTAMP*/0x17, true),
    CALLBACK: generateSingletonFormatStringEntry("CALLBACK", /*FormatStringEntryKind_Expando*/0x2, "#callback", /*SingletonFormatStringEntry_CALLBACK*/0x18, true),
    REQUEST: generateSingletonFormatStringEntry("REQUEST", /*FormatStringEntryKind_Expando*/0x2, "#request", /*SingletonFormatStringEntry_REQUEST*/0x19, true),

    PERCENT: generateSingletonFormatStringEntry("PERCENT", /*FormatStringEntryKind_Literal*/0x1, "%", /*SingletonFormatStringEntry_PERCENT*/0x21, true),
    BOOL: generateSingletonFormatStringEntry("BOOL", /*FormatStringEntryKind_Basic*/0x3, "b", /*SingletonFormatStringEntry_BOOL*/0x22, true), //%{p:b}
    NUMBER: generateSingletonFormatStringEntry("NUMBER", /*FormatStringEntryKind_Basic*/0x3, "n", /*SingletonFormatStringEntry_NUMBER*/0x23, true), //%{p:n}
    STRING: generateSingletonFormatStringEntry("STRING", /*FormatStringEntryKind_Basic*/0x3, "s", /*SingletonFormatStringEntry_STRING*/0x24, true), //%{p:s}
    DATEISO: generateSingletonFormatStringEntry("DATEISO", /*FormatStringEntryKind_Basic*/0x3, "di", /*SingletonFormatStringEntry_DATEISO*/0x26, true), //%{p:d-iso}
    DATEUTC: generateSingletonFormatStringEntry("DATEUTC", /*FormatStringEntryKind_Basic*/0x3, "du", /*SingletonFormatStringEntry_DATEUTC*/0x27, true), //%{p:d-utc}
    DATELOCAL: generateSingletonFormatStringEntry("DATELOCAL", /*FormatStringEntryKind_Basic*/0x3, "dl", /*SingletonFormatStringEntry_DATELOCAL*/0x28, true), //%{p:d-local}
    GENERAL: generateSingletonFormatStringEntry("GENERAL", /*FormatStringEntryKind_Basic*/0x3, "g", /*SingletonFormatStringEntry_GENERAL*/0x28, false), //%{p:g}
    OBJECT: generateSingletonFormatStringEntry("OBJECT", /*FormatStringEntryKind_Compound*/0x4, "o", /*SingletonFormatStringEntry_OBJECT*/0x29, false), //%{p:o<d,l>}
    ARRAY: generateSingletonFormatStringEntry("ARRAY", /*FormatStringEntryKind_Compound*/0x4, "a", /*SingletonFormatStringEntry_ARRAY*/0x2A, false) //%{p:a<d,l>}
};

const s_expandoEntries = Object.keys(FormatStringEntrySingletons)
    .filter(function (value) { return FormatStringEntrySingletons[value].kind === /*FormatStringEntryKind_Expando*/0x2; })
    .map(function (value) { return FormatStringEntrySingletons[value]; });

const s_basicFormatEntries = Object.keys(FormatStringEntrySingletons)
    .filter(function (value) { return FormatStringEntrySingletons[value].kind === /*FormatStringEntryKind_Basic*/0x3; })
    .map(function (value) { return FormatStringEntrySingletons[value]; });

const s_compoundFormatEntries = Object.keys(FormatStringEntrySingletons)
    .filter(function (value) { return FormatStringEntrySingletons[value].kind === /*FormatStringEntryKind_Compound*/0x4; })
    .map(function (value) { return FormatStringEntrySingletons[value]; });

const s_expandoStringRe = new RegExp("^(" +
    s_expandoEntries
        .map(function (value) { return value.label; })
        .join("|") +
    ")$");

const s_basicFormatStringRe = new RegExp("^\\${(\\d+):(" +
    s_basicFormatEntries
        .map(function (value) { return value.label; })
        .join("|") +
    ")}$");

const s_compoundFormatStringRe = new RegExp("^\\${(\\d+):(" +
    s_compoundFormatEntries
        .map(function (value) { return value.label; })
        .join("|") +
    ")(<(\\d+|\\*)?,(\\d+|\\*)?>)}$");

/**
 * Construct a msgFormat entry for a compound formatter.
 * @function
 * @param {Object} formatTag the FormatStringEntrySingleton for this entry
 * @param {number} formatStringStart the index that the format text starts at in the format string
 * @param {number} formatStringEnd the index (1 after) the end of the format text in the format string
 * @param {number} argListPosition the (optional) position to find the format arg in the arg list
 * @param {number} formatExpandDepth the (optional) max depth to expand the argument object
 * @param {number} formatExpandLength the (optional) max number of properties/array length to expand the argument object
 * @returns {Object} a message format entry
 */
function createMsgFormatEntry(formatTag, formatStringStart, formatStringEnd, argListPosition, formatExpandDepth, formatExpandLength) {
    return {
        format: formatTag,
        formatStart: formatStringStart,
        formatEnd: formatStringEnd,
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

    if ((typeid === /*TypeNameEnum_TUndefined*/0x31) || (typeid === /*TypeNameEnum_TNull*/0x32) || (typeid === /*TypeNameEnum_TBoolean*/0x33) || (typeid === /*TypeNameEnum_TNumber*/0x34)) {
        return JSON.stringify(jobj);
    }
    else if (typeid === /*TypeNameEnum_TString*/0x35) {
        if (s_expandoStringRe.test(jobj) || s_basicFormatStringRe.test(jobj) || s_compoundFormatStringRe.test(jobj)) {
            return jobj;
        }
        else {
            return "\"" + jobj + "\"";
        }
    }
    else if (typeid === /*TypeNameEnum_TObject*/0x38) {
        return "{ " +
            Object.keys(jobj)
                .sort()
                .map(function (key) { return "\"" + key + "\":" + expandToJsonFormatter(jobj[key]); })
                .join(", ") +
            " }";
    }
    else if (typeid === /*TypeNameEnum_TJsArray*/0x39) {
        return "[ " +
            jobj
                .map(function (value) { return expandToJsonFormatter(value); })
                .join(", ") +
            " ]";
    }
    else {
        return "\"" + jobj.toString() + "\"";
    }
}

/**
 * Helper function to extract and construct an expando format specifier or throws is the expando is malformed.
 * @function
 * @param {string} fmtString the format string we are working on
 * @param {number} vpos the current position in the string
 * @returns {Object} the expando MsgFormatEntry
 */
function extractExpandoSpecifier(fmtString, vpos) {
    if (fmtString.startsWith("##", vpos)) {
        return createMsgFormatEntry(FormatStringEntrySingletons.HASH, vpos, vpos + "##".length, -1, -1, -1);
    }
    else {
        const expando = s_expandoEntries.find(function (expando) { return fmtString.startsWith(expando.label, vpos); });
        if (!expando) {
            throw new FormatSyntaxError("Bad match in expando format string", fmtString, vpos);
        }

        return createMsgFormatEntry(expando, vpos, vpos + expando.label.length, -1, -1, -1);
    }
}

//Helper regexs for parsing numbers in format specifier
const s_formatArgPosNumberRegex = /\d+/y;
const s_formatDepthLengthRegex = /([o|a])<(\d+|\*)?,(\d+|\*)?>/y;

/**
 * Helper function to extract and construct an argument format specifier or throws is the format specifier is malformed.
 * @function
 * @param {string} fmtString the format string we are working on
 * @param {number} vpos the current position in the string
 * @returns {Object} the expando MsgFormatEntry
 */
function extractArgumentFormatSpecifier(fmtString, vpos) {
    if (fmtString.startsWith("%%", vpos)) {
        return createMsgFormatEntry(FormatStringEntrySingletons.PERCENT, vpos, vpos + "%%".length, -1, -1, -1);
    }
    else {
        if (!fmtString.startsWith("%{", vpos)) {
            throw new FormatSyntaxError("Stray '%' in argument formatter", fmtString, vpos);
        }

        s_formatArgPosNumberRegex.lastIndex = vpos + "%{".length;

        const argPositionMatch = s_formatArgPosNumberRegex.exec(fmtString);
        if (!argPositionMatch) {
            throw new FormatSyntaxError("Bad position specifier in format", fmtString, s_formatArgPosNumberRegex.lastIndex);
        }

        const argPosition = Number.parseInt(argPositionMatch[0]);
        if (argPosition < 0) {
            throw new FormatSyntaxError("Bad position specifier in format", fmtString, s_formatArgPosNumberRegex.lastIndex);
        }

        let specPos = vpos + "%{".length + argPositionMatch[0].length;
        if (fmtString.charAt(specPos) !== ":") {
            throw new FormatSyntaxError("Bad formatting specifier", fmtString, specPos);
        }
        specPos++;

        const cchar = fmtString.charAt(specPos);
        const basicFormatOption = s_basicFormatEntries.find(function (value) { return value.label === cchar; });
        const compoundFormatOption = s_compoundFormatEntries.find(function (value) { return value.label === cchar; });

        if (!basicFormatOption && !compoundFormatOption) {
            throw new FormatSyntaxError("Bad formatting specifier", fmtString, specPos);
        }

        if (basicFormatOption) {
            const fendpos = specPos + basicFormatOption.label.length + 1; //"fmt}".length
            return createMsgFormatEntry(basicFormatOption, vpos, fendpos, argPosition, -1, -1);
        }
        else {
            const DL_STAR = 1073741824;

            if (fmtString.startsWith("o}", specPos)) {
                return createMsgFormatEntry(FormatStringEntrySingletons.OBJECT, vpos, specPos + "o}".length, argPosition, /*ExpandDefaults_Depth*/2, /*ExpandDefaults_ObjectLength*/1024);
            }
            else if (fmtString.startsWith("a}", specPos)) {
                return createMsgFormatEntry(FormatStringEntrySingletons.ARRAY, vpos, specPos + "a}".length, argPosition, /*ExpandDefaults_Depth*/2, /*ExpandDefaults_ArrayLength*/128);
            }
            else {
                s_formatDepthLengthRegex.lastIndex = specPos;
                const dlMatch = s_formatDepthLengthRegex.exec(fmtString);
                if (!dlMatch) {
                    throw new FormatSyntaxError("Bad position specifier in format", fmtString, s_formatDepthLengthRegex.lastIndex);
                }

                const ttag = (dlMatch[1] === "o") ? FormatStringEntrySingletons.OBJECT : FormatStringEntrySingletons.ARRAY;
                let tdepth = /*ExpandDefaults_Depth*/2;
                let tlength = (dlMatch[1] === "o") ? /*ExpandDefaults_ObjectLength*/1024 : /*ExpandDefaults_ArrayLength*/128;

                if (dlMatch[2] !== "") {
                    tdepth = (dlMatch[2] !== "*") ? Number.parseInt(dlMatch[2]) : DL_STAR;
                }

                if (dlMatch[3] !== "") {
                    tlength = (dlMatch[3] !== "*") ? Number.parseInt(dlMatch[3]) : DL_STAR;
                }

                return createMsgFormatEntry(ttag, vpos, specPos + dlMatch[0].length, argPosition, tdepth, tlength);
            }
        }
    }
}

/**
 * Construct a msgFormat object.
 * @function
 * @param {string} fmtName the name of the format
 * @param {number} fmtId a unique identifier for the format
 * @param {string} fmtString the raw format string
 * @param {number} maxArgPos the largest arg used in the format
 * @param {Array} fmtEntryArray the array of MsgFormatEntry objects
 * @param {string} initialFormatSegment the string that we want to emit at the start of the format
 * @param {Array} tailingFormatSegmentArray the strings that we want to emit in after each format specifier
 * @param {bool} areAllSingleSlotFormatters true if all the formatters use only a single slot
 * @returns {Object} our MsgFormat object
 */
function createMsgFormat(fmtName, fmtId, fmtString, maxArgPos, fmtEntryArray, initialFormatSegment, tailingFormatSegmentArray, areAllSingleSlotFormatters) {
    return {
        formatName: fmtName,
        formatId: fmtId,
        formatString: fmtString,
        maxArgPosition: maxArgPos,
        formatterArray: fmtEntryArray,
        initialFormatStringSegment: initialFormatSegment,
        tailingFormatStringSegmentArray: tailingFormatSegmentArray,
        allSingleSlotFormatters: areAllSingleSlotFormatters
    };
}

//Helper rexex for extract function
const s_newlineRegex = /(\n|\r)/;

/**
 * Takes a message format string and converts it to our internal format structure.
 * @function
 * @param {string} fmtName the name of the format
 * @param {number} fmtId the numeric id to be associated with this format
 * @param {string|Object} fmtString the raw format string or a JSON style format
 * @returns {Object} our MsgFormat object
 */
function extractMsgFormat(fmtName, fmtId, fmtInfo) {
    let cpos = 0;

    if (typeof (fmtName) !== "string") {
        throw new FormatSyntaxError("Name needs to be a string", undefined, 0);
    }

    let fmtString = fmtInfo;
    if (typeof (fmtInfo) !== "string") {
        const typeid = getTypeNameEnum(fmtInfo);
        if (typeid !== /*TypeNameEnum_TObject*/0x38 && typeid !== /*TypeNameEnum_TJsArray*/0x39) {
            throw new FormatSyntaxError("Format description options are string | object layout | array layout", undefined, 0);
        }

        fmtString = expandToJsonFormatter(fmtInfo);
    }

    if (s_newlineRegex.test(fmtString)) {
        throw new FormatSyntaxError("Format cannot contain newlines", undefined, 0);
    }

    const fArray = [];
    let maxArgPos = 0;
    while (cpos < fmtString.length) {
        const cchar = fmtString.charAt(cpos);
        if (cchar !== "#" && cchar !== "%") {
            cpos++;
        }
        else {
            const fmt = (cchar === "#") ? extractExpandoSpecifier(fmtString, cpos) : extractArgumentFormatSpecifier(fmtString, cpos);
            fArray.push(fmt);

            if (fmt.fposition) {
                maxArgPos = Math.max(maxArgPos, fmt.fposition);
            }

            cpos = fmt.formatEnd;
        }
    }

    const allBasicFormatters = fArray.every(function (value) {
        return value.isSingleSlot;
    });

    const initialFormatSegment = (fArray.length !== 0) ? fmtString.substr(0, fArray[0].formatStart) : fmtString;
    const tailingFormatSegmentArray = [];
    for (let i = 0; i < fArray.length; ++i) {
        const start = fArray[i].formatEnd;
        const end = (i + 1 < fArray.length) ? fArray[i + 1].formatStart : fmtString.length;

        tailingFormatSegmentArray.push(fmtString.substr(start, end - start));
    }

    return createMsgFormat(fmtName, fmtId, fmtString, maxArgPos, fArray, initialFormatSegment, tailingFormatSegmentArray, allBasicFormatters);
}

/////////////////////////////////////////////////////////////////////////////////////////////////
//Define structure for representing the in memory log entries.
//We want to be able to effciently copy any data needed to construct the log message into this structure.
//  The actual formatting of the message will take place once we decide we need the message. Either it is
//  moved to stable storage or we encountered a situation where we want a detailed log dump.

/**
 * The number of entries we have in a msg block.
 */
//MemoryMsgBlockSize 256

//internal function for allocating a block
function createMemoryMsgBlock(previousBlock) {
    const nblock = {
        spos: 0,
        epos: 0,
        tags: new Uint8Array(/*MemoryMsgBlockSize*/256),
        data: new Array(/*MemoryMsgBlockSize*/256),
        next: null,
        previous: previousBlock,
        dataSize: -1
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
    this.head = createMemoryMsgBlock(null);
    this.tail = this.head;
    this.jsonCycleMap = new Set();
}

/**
 * Clear the contents of the InMemoryLog
 * @method
 */
InMemoryLog.prototype.clear = function () {
    this.head.tags.fill(/*LogEntryTags_Clear*/0x0, 0, this.head.epos);
    this.head.data.fill(undefined, 0, this.head.epos);
    this.head.spos = 0;
    this.head.epos = 0;
    this.head.next = null;

    this.tail = this.head;
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
 * Update the size information in a InMemoryLog block
 */
function updateBlocklistSizeInfo(imblock) {
    let total = 0;
    for (let cblock = imblock; cblock !== null; cblock = cblock.next) {
        if (cblock.epos === /*MemoryMsgBlockSize*/256 && cblock.dataSize === -1) {
            let size = /*MemoryMsgBlockSize*/256 * 6; //backbone size
            for (let pos = 0; pos < /*MemoryMsgBlockSize*/256; ++pos) {
                const data = cblock.data[pos];
                if (data === undefined || data === null) {
                    //no extra size
                }
                else {
                    const jstype = typeof (data);
                    if (jstype === "string") {
                        size += data.length;
                    }
                }
            }
            cblock.dataSize = size;
        }

        if (cblock.dataSize !== -1) {
            total += cblock.dataSize;
        }
    }
    return total;
}

/**
 * Remove the head block data from this list
 * @method
 */
InMemoryLog.prototype.removeHeadBlock = function () {
    if (this.head.next == null) {
        this.clear();
    }
    else {
        this.head = this.head.next;
        this.head.previous = null;
    }
};

/**
 * Add an entry to the InMemoryLog
 * @method
 * @param {number} tag the tag for the entry
 * @param {*} data the data value for the entry
 */
InMemoryLog.prototype.addEntry = function (tag, data) {
    let block = this.tail;
    if (block.epos === /*MemoryMsgBlockSize*/256) {
        block = createMemoryMsgBlock(block);
        this.tail = block;
    }

    block.tags[block.epos] = tag;
    block.data[block.epos] = data;
    block.epos++;
};

/**
 * Add an entry to the InMemoryLog that has the common JsVarValue tag
 * @method
 * @param {*} data the data value for the entry
 */
InMemoryLog.prototype.addJsVarValueEntry = function (data) {
    let block = this.tail;
    if (block.epos === /*MemoryMsgBlockSize*/256) {
        block = createMemoryMsgBlock(block);
        this.tail = block;
    }

    block.tags[block.epos] = /*LogEntryTags_JsVarValue*/0xB;
    block.data[block.epos] = data;
    block.epos++;
};

/**
 * Add an entry to the InMemoryLog that has no extra data
 * @method
 * @param {number} tag the tag value for the entry
 */
InMemoryLog.prototype.addTagOnlyEntry = function (tag) {
    let block = this.tail;
    if (block.epos === /*MemoryMsgBlockSize*/256) {
        block = createMemoryMsgBlock(block);
        this.tail = block;
    }

    block.tags[block.epos] = tag;
    block.epos++;
};

/**
 * Add functions to process general values via lookup on typeid number in prototype array
 */
const AddGeneralValue_RemainingTypesCallTable = new Array(/*TypeNameEnum_TypeLimit*/0x3C);
AddGeneralValue_RemainingTypesCallTable.fill(null);

AddGeneralValue_RemainingTypesCallTable[/*TypeNameEnum_TDate*/0x36] = function (inMemoryLog, value, depth) {
    inMemoryLog.addJsVarValueEntry(new Date(value));
};
AddGeneralValue_RemainingTypesCallTable[/*TypeNameEnum_TFunction*/0x37] = function (inMemoryLog, value, depth) {
    inMemoryLog.addJsVarValueEntry("[ #Function# " + value.name + " ]");
};

AddGeneralValue_RemainingTypesCallTable[/*TypeNameEnum_TObject*/0x38] = function (inMemoryLog, value, depth) {
    inMemoryLog.addExpandedObject(value, depth, /*ExpandDefaults_ObjectLength*/1024);
};
AddGeneralValue_RemainingTypesCallTable[/*TypeNameEnum_TJsArray*/0x39] = function (inMemoryLog, value, depth) {
    inMemoryLog.addExpandedArray(value, depth, /*ExpandDefaults_ArrayLength*/128);
};
AddGeneralValue_RemainingTypesCallTable[/*TypeNameEnum_TTypedArray*/0x3A] = function (inMemoryLog, value, depth) {
    inMemoryLog.addExpandedArray(value, depth, /*ExpandDefaults_ArrayLength*/128);
};

AddGeneralValue_RemainingTypesCallTable[/*TypeNameEnum_TUnknown*/0x3B] = function (inMemoryLog, value, depth) {
    inMemoryLog.addTagOnlyEntry(/*LogEntryTags_OpaqueValue*/0xF);
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
        this.addTagOnlyEntry(/*LogEntryTags_CycleValue*/0xD);
        return;
    }

    if (depth === 0) {
        this.addTagOnlyEntry(/*LogEntryTags_DepthBoundObject*/0x20);
    }
    else {
        //Set processing as true for cycle detection
        this.jsonCycleMap.add(obj);
        this.addTagOnlyEntry(/*LogEntryTags_LParen*/0x5);

        let allowedLengthRemain = length;
        for (const p in obj) {
            this.addEntry(/*LogEntryTags_PropertyRecord*/0x9, p);

            const value = obj[p];
            const typeid = getTypeNameEnum(value);
            if (typeid <= /*TypeNameEnum_LastImmutableType*/0x35) {
                this.addJsVarValueEntry(value);
            }
            else {
                (AddGeneralValue_RemainingTypesCallTable[typeid])(this, value, depth);
            }

            allowedLengthRemain--;
            if (allowedLengthRemain <= 0) {
                this.addTagOnlyEntry(/*LogEntryTags_LengthBoundHit*/0xC);
                break;
            }
        }

        //Set processing as false for cycle detection
        this.jsonCycleMap.delete(obj);
        this.addTagOnlyEntry(/*LogEntryTags_RParen*/0x6);
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
        this.addTagOnlyEntry(/*LogEntryTags_CycleValue*/0xD);
        return;
    }

    if (depth === 0) {
        this.addTagOnlyEntry(/*LogEntryTags_DepthBoundArray*/0x21);
    }
    else {
        //Set processing as true for cycle detection
        this.jsonCycleMap.add(obj);
        this.addTagOnlyEntry(/*LogEntryTags_LBrack*/0x7);

        for (let i = 0; i < obj.length; ++i) {
            const value = obj[i];
            const typeid = getTypeNameEnum(value);
            if (typeid <= /*TypeNameEnum_LastImmutableType*/0x35) {
                this.addJsVarValueEntry(value);
            }
            else {
                (AddGeneralValue_RemainingTypesCallTable[typeid])(this, value, depth);
            }

            if (i >= length) {
                this.addTagOnlyEntry(/*LogEntryTags_LengthBoundHit*/0xC);
                break;
            }
        }

        //Set processing as false for cycle detection
        this.jsonCycleMap.delete(obj);
        this.addTagOnlyEntry(/*LogEntryTags_RBrack*/0x8);
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

InMemoryLog.prototype.processImmutableHelper = function (valueok, value) {
    if (valueok) {
        this.addJsVarValueEntry(value);
    }
    else {
        this.addTagOnlyEntry(/*LogEntryTags_JsBadFormatVar*/0xA);
    }
};

InMemoryLog.prototype.processDateHelper = function (vtype, value) {
    if (vtype === /*TypeNameEnum_TDate*/0x36) {
        this.addJsVarValueEntry(value);
    }
    else {
        this.addTagOnlyEntry(/*LogEntryTags_JsBadFormatVar*/0xA);
    }
};

/**
 * Log a message into the InMemoryLog
 * @method
 * @param {Object} env a record with the info for certain environment/expando formatter entries
 * @param {number} level the level the message is being logged at
 * @param {string} category the category the message is being logged at
 * @param {bool} doTimestamp if we want to include an internal timestamp in the log
 * @param {Object} fmt the format of the message
 * @param {Array} args the arguments for the format message
 */
InMemoryLog.prototype.logMessage = function (env, level, category, doTimestamp, fmt, args) {
    this.addEntry(/*LogEntryTags_MsgFormat*/0x1, fmt);
    this.addEntry(/*LogEntryTags_MsgLevel*/0x2, level);
    this.addEntry(/*LogEntryTags_MsgCategory*/0x3, category);

    if (doTimestamp) {
        this.addEntry(/*LogEntryTags_MsgWallTime*/0x22, Date.now());
    }

    let incTimeStamp = false;
    for (let i = 0; i < fmt.formatterArray.length; ++i) {
        const formatEntry = fmt.formatterArray[i];
        const formatSpec = formatEntry.format;

        if (formatSpec.kind === /*FormatStringEntryKind_Literal*/0x1) {
            //don't need to do anything!
        }
        else if (formatSpec.kind === /*FormatStringEntryKind_Expando*/0x2) {
            const specEnum = formatSpec.enum;
            if (specEnum === /*SingletonFormatStringEntry_SOURCE*/0x15) {
                this.addJsVarValueEntry(getCallerLineInfo(env));
            }
            else if (specEnum === /*SingletonFormatStringEntry_WALLCLOCK*/0x16) {
                this.addJsVarValueEntry(Date.now());
            }
            else if (specEnum === /*SingletonFormatStringEntry_TIMESTAMP*/0x17) {
                this.addJsVarValueEntry(env.globalEnv.TIMESTAMP);
                incTimeStamp = true;
            }
            else if (specEnum === /*SingletonFormatStringEntry_MODULE*/0x14) {
                this.addJsVarValueEntry(env[formatSpec.name]);
            }
            else {
                this.addJsVarValueEntry(env.globalEnv[formatSpec.name]);
            }
        }
        else {
            if (formatEntry.argPosition >= args.length) {
                //We hit a bad format value so rather than let it propigate -- report and move on.
                this.addTagOnlyEntry(/*LogEntryTags_JsBadFormatVar*/0xA);
            }
            else {
                const value = args[formatEntry.argPosition];
                const vtype = getTypeNameEnum(value);

                switch (formatSpec.enum) {
                    case /*SingletonFormatStringEntry_BOOL*/0x22:
                        this.processImmutableHelper(vtype === /*TypeNameEnum_TBoolean*/0x33, value);
                        break;
                    case /*SingletonFormatStringEntry_NUMBER*/0x23:
                        this.processImmutableHelper(vtype === /*TypeNameEnum_TNumber*/0x34, value);
                        break;
                    case /*SingletonFormatStringEntry_STRING*/0x24:
                        this.processImmutableHelper(vtype === /*TypeNameEnum_TString*/0x35, value);
                        break;
                    case /*SingletonFormatStringEntry_DATEISO*/0x25:
                    case /*SingletonFormatStringEntry_DATEUTC*/0x26:
                    case /*SingletonFormatStringEntry_DATELOCAL*/0x27:
                        this.processDateHelper(vtype, value);
                        break;
                    case /*SingletonFormatStringEntry_OBJECT*/0x29:
                        if (vtype === /*TypeNameEnum_TObject*/0x38) {
                            this.addExpandedObject(value, formatEntry.depth, formatEntry.length);
                        }
                        else {
                            this.addTagOnlyEntry(/*LogEntryTags_JsBadFormatVar*/0xA);
                        }
                        break;
                    case /*SingletonFormatStringEntry_ARRAY*/0x2A:
                        if (vtype === /*TypeNameEnum_TJsArray*/0x39 || vtype === /*TypeNameEnum_TTypedArray*/0x3A) {
                            this.addExpandedArray(value, formatEntry.depth, formatEntry.length);
                        }
                        else {
                            this.addTagOnlyEntry(/*LogEntryTags_JsBadFormatVar*/0xA);
                        }
                        break;
                    default:
                        if (vtype <= /*TypeNameEnum_LastImmutableType*/0x35) {
                            this.addJsVarValueEntry(value);
                        }
                        else {
                            (AddGeneralValue_RemainingTypesCallTable[vtype])(this, vtype, value, formatEntry.depth);
                        }
                        break;
                }
            }
        }
    }

    if (incTimeStamp) {
        env.globalEnv.TIMESTAMP++;
    }

    this.addTagOnlyEntry(/*LogEntryTags_MsgEndSentinal*/0x4);
};

function hasMoreDataToWrite(cblock) {
    return cblock.spos !== cblock.epos;
}

function isEnabledForWrite(cblock, enabledLevel, enabledCategories) {
    let levelblock = cblock;
    let levelpos = cblock.spos + 1;
    if (levelpos === levelblock.epos) {
        levelblock = levelblock.next;
        levelpos = 0;
    }

    const loglevel = levelblock.data[levelpos];
    if ((loglevel & enabledLevel) !== loglevel) {
        return false;
    }

    let categoryblock = levelblock;
    let categorypos = levelpos + 1;
    if (categorypos === categoryblock.epos) {
        categoryblock = categoryblock.next;
        categorypos = 0;
    }

    return enabledCategories[categoryblock.data[categorypos]];
}

function processSingleMessageForWrite_Helper(iblock, formatterLog) {
    let cblock = iblock;
    while (cblock.tags[cblock.spos] !== /*LogEntryTags_MsgEndSentinal*/0x4) {
        if (cblock.spos !== cblock.epos) {
            formatterLog.addEntry(cblock.tags[cblock.spos], cblock.data[cblock.spos]);
            cblock.spos++;
        }
        else {
            assert(cblock.next !== null, "We failed to complete formatting this message?");
            cblock = cblock.next;
        }
    }
    formatterLog.addEntry(cblock.tags[cblock.spos], cblock.data[cblock.spos]);
    cblock.spos++;

    if (cblock.spos === cblock.epos && cblock.next !== null) {
        cblock = cblock.next;
    }

    return cblock;
}

function processSingleMessageForDiscard_Helper(iblock) {
    let cblock = iblock;
    while (cblock.tags[cblock.spos] !== /*LogEntryTags_MsgEndSentinal*/0x4) {
        if (cblock.spos !== cblock.epos) {
            cblock.spos++;
        }
        else {
            assert(cblock.next !== null, "We failed to complete formatting this message?");
            cblock = cblock.next;
        }
    }
    cblock.spos++;

    if (cblock.spos === cblock.epos && cblock.next !== null) {
        cblock = cblock.next;
    }

    return cblock;
}

function isSizeBoundOk(iblock, sizeLimit) {
    return updateBlocklistSizeInfo(iblock) < sizeLimit;
}

function isTimeBoundOk(iblock, timeLimit, now) {
    const tpos = iblock.spos + 3;
    if (tpos < iblock.epos) {
        return (iblock.tags[tpos] !== /*LogEntryTags_MsgWallTime*/0x22) || (now - iblock.data[tpos]) < timeLimit;
    }
    else {
        const nblock = iblock.next;
        const npos = tpos % iblock.epos;

        return (nblock.tags[npos] !== /*LogEntryTags_MsgWallTime*/0x22) || (now - nblock.data[npos]) < timeLimit;
    }
}

/**
 * Filter out all the msgs that we want to drop when writing to disk and copy them to the pending write list.
 * Returns when we are both (1) under size limit and (2) the size limit -- setting them to Number.MAX_SAFE_INTEGER will effectively disable the check.
 * @method
 * @param {Object} formatterLog the formatterLog list to add into
 * @param {Object} retainLevel the logging level to retain at
 * @param {Object} retainCategories the logging category we want to retain
 * @param {number} timeLimit is the amount of time we are ok with
 * @param {number} sizeLimit is the amount of in-memory logging we are ok with
 */
InMemoryLog.prototype.processMessagesForWrite = function (formatterLog, retainLevel, retainCategories, timeLimit, sizeLimit) {
    let cblock = this.head;

    const now = Date.now();
    let keepProcessing = true;
    while (hasMoreDataToWrite(cblock) && keepProcessing) {
        const nblock = isEnabledForWrite(cblock, retainLevel, retainCategories) ?
            processSingleMessageForWrite_Helper(cblock, formatterLog) :
            processSingleMessageForDiscard_Helper(cblock);

        if (hasMoreDataToWrite(cblock)) {
            const keepProcessingTime = isTimeBoundOk(nblock, timeLimit, now);

            let keepProcessingSize = true;
            if (nblock !== cblock) {
                //We can go under on memory usage so do this check per block written
                keepProcessingSize = isSizeBoundOk(nblock, sizeLimit);
                cblock = nblock;
            }

            keepProcessing = keepProcessingTime || keepProcessingSize;
        }
    }

    while (this.head !== cblock) {
        this.removeHeadBlock();
    }
};

/**
 * Filter out all the msgs that we want to drop when writing to disk and copy them to the pending write list -- process all records.
 * @method
 * @param {Object} formatterLog the formatterLog list to add into
 * @param {bool} forceall true if we want to ignore any level/category information and process everything
 * @param {number} retainLevel the logging level to retain at
 * @param {Object} retainCategories the logging category we want to retain
 */
InMemoryLog.prototype.processMessagesForWrite_HardFlush = function (formatterLog, forceall, retainLevel, retainCategories) {
    let cblock = this.head;
    while (hasMoreDataToWrite(cblock)) {
        if (forceall || isEnabledForWrite(cblock, retainLevel, retainCategories)) {
            cblock = processSingleMessageForWrite_Helper(cblock, formatterLog);
        }
        else {
            cblock = processSingleMessageForDiscard_Helper(cblock, formatterLog);
        }
    }

    this.clear();
};

/////////////////////////////////////////////////////////////////////////////////////////////////
//Define structure for representing the log entries that are pending transport to stable storage.
//  We want to make this representation compact, efficient to convert to formatted log data, *and*
//  setup in a way that is amenable to processing in a native module (off main thread).

/**
 * The number of entries we have in a formatter block.
 */
//FormatterMsgBlockSize 256

//internal function for allocating a block
function createFormatterMsgBlock(previousBlock) {
    const nblock = {
        spos: 0,
        epos: 0,
        tags: new Uint8Array(/*FormatterMsgBlockSize*/256),
        data: new Float64Array(/*FormatterMsgBlockSize*/256),
        strings: new Array(/*FormatterMsgBlockSize*/256),
        stringPos: 0,
        next: null,
        previous: previousBlock
    };

    if (previousBlock) {
        previousBlock.next = nblock;
    }

    return nblock;
}

/**
 * FormatterLog constructor
 * @constructor
 */
function FormatterLog() {
    this.head = createFormatterMsgBlock(null);
    this.tail = this.head;
}

/**
 * Clear the contents of the InMemoryLog
 * @method
 */
FormatterLog.prototype.clear = function () {
    this.head.tags.fill(/*LogEntryTags_Clear*/0x0, 0, this.head.epos);
    this.head.data.fill(0, 0, this.head.epos);
    this.head.strings.fill(undefined, 0, this.head.stringPos);
    this.head.spos = 0;
    this.head.epos = 0;
    this.head.stringPos = 0;
    this.head.next = null;

    this.tail = this.head;
};

/**
 * Add an entry to the InMemoryLog
 * @method
 * @param {number} tag the tag for the entry
 * @param {*} data the data value for the entry
 */
FormatterLog.prototype.addEntry = function (tag, data) {
    let block = this.tail;
    if (block.epos === /*MemoryMsgBlockSize*/256) {
        block = createFormatterMsgBlock(block);
        this.tail = block;
    }

    if (tag === /*LogEntryTags_JsVarValue*/0xB) {
        if (data === undefined) {
            block.tags[block.epos] = /*LogEntryTags_JsVarValue_Undefined*/0x30;
        }
        else if (data === null) {
            block.tags[block.epos] = /*LogEntryTags_JsVarValue_Null*/0x31;
        }
        else {
            const dtype = typeof (data);
            if (dtype === "boolean") {
                block.tags[block.epos] = /*LogEntryTags_JsVarValue_Bool*/0x32;
                block.data[block.epos] = data ? 1 : 0;
            }
            else if (dtype === "number") {
                block.tags[block.epos] = /*LogEntryTags_JsVarValue_Number*/0x34;
                block.data[block.epos] = data;
            }
            else if (dtype === "string") {
                block.tags[block.epos] = /*LogEntryTags_JsVarValue_String*/0x38;
                block.data[block.epos] = block.stringPos;
                block.strings[block.stringPos++] = data;
            }
            else {
                block.tags[block.epos] = /*LogEntryTags_JsVarValue_Date*/0x3A;
                block.data[block.epos] = dtype.valueOf();
            }
        }
    }
    else {
        switch (tag) {
            case /*LogEntryTags_MsgFormat*/0x1:
                block.tags[block.epos] = tag;
                block.data[block.epos] = data.formatId;
                break;
            case /*LogEntryTags_MsgLevel*/0x2:
                block.tags[block.epos] = tag;
                block.data[block.epos] = data;
                break;
            case /*LogEntryTags_MsgCategory*/0x3:
                block.tags[block.epos] = tag;
                if (data === "default") {
                    block.data[block.epos] = -1;
                }
                else {
                    block.data[block.epos] = block.stringPos;
                    block.strings[block.stringPos++] = data;
                }
                break;
            case /*LogEntryTags_PropertyRecord*/0x9:
                block.tags[block.epos] = tag;
                block.data[block.stringPos];
                block.strings[block.stringPos++] = data;
                break;
            case /*LogEntryTags_MsgWallTime*/0x22:
                block.tags[block.epos] = tag;
                block.data[block.epos] = data;
                break;
            default:
                block.tags[block.epos] = tag;
                break;
        }
    }
    block.epos++;
};

FormatterLog.prototype.hasEntriesToWrite = function () {
    return this.head.spos !== this.head.epos;
};

FormatterLog.prototype.getCurrentWriteTag = function () {
    return this.head.tags[this.head.spos];
};

FormatterLog.prototype.getCurrentWriteData = function () {
    return this.head.data[this.head.spos];
};

FormatterLog.prototype.getStringForIdx = function (idx) {
    return this.head.strings[idx];
};

FormatterLog.prototype.advanceWritePos = function () {
    this.head.spos++;

    if (this.head.spos === this.head.epos) {
        if (this.head.next == null) {
            this.clear();
        }
        else {
            this.head = this.head.next;
            this.head.previous = null;
        }
    }
};

/**
 * Emit K formatted messages.
 * @method
 * @param {Object} formatter the formatter that knows how to serialize data values
 * @param {bool} doprefix true if we want to write a standard "LEVEL#CATEGORY TIME? -- " prefix
 * @param {number} k number of messages to write
 * @returns true if there is more to write or false otherwise
 */
FormatterLog.prototype.emitKEntries = function (formatter, doprefix, k) {
    for (let i = 0; i < k; ++i) {
        if (!this.hasEntriesToWrite()) {
            return false;
        }

        this.emitFormatEntry(formatter, doprefix);
    }
    return true;
};

/**
 * Emit a single formatted message.
 * @method
 * @param {Object} formatter the formatter that knows how to serialize data values
 * @param {bool} doprefix true if we want to write a standard "LEVEL#CATEGORY TIME? -- " prefix
 */
FormatterLog.prototype.emitFormatEntry = function (formatter, doprefix) {
    const fmt = s_fmtMap.get(this.getCurrentWriteData());
    this.advanceWritePos();

    if (!doprefix) {
        this.advanceWritePos();
        this.advanceWritePos();

        if (this.getCurrentWriteTag() === /*LogEntryTags_MsgWallTime*/0x22) {
            this.advanceWritePos();
        }
    }
    else {
        formatter.emitLiteralString(LoggingLevelToNameMap[this.getCurrentWriteData()]);
        this.advanceWritePos();
        formatter.emitLiteralChar("#");

        const categoryidx = this.getCurrentWriteData();
        formatter.emitLiteralString(categoryidx === -1 ? "default" : this.getStringForIdx(categoryidx));
        this.advanceWritePos();

        if (this.getCurrentWriteTag() === /*LogEntryTags_MsgWallTime*/0x22) {
            formatter.emitLiteralString(" @ ");
            formatter.emitLiteralString((new Date(this.getCurrentWriteData())).toISOString());
            this.advanceWritePos();
        }

        formatter.emitLiteralString(" -- ");
    }

    const formatArray = fmt.formatterArray;
    const tailingFormatSegmentArray = fmt.tailingFormatStringSegmentArray;
    let formatIndex = 0;

    formatter.emitString(fmt.initialFormatStringSegment);

    for (formatIndex = 0; formatIndex < formatArray.length; formatIndex++) {
        const formatEntry = formatArray[formatIndex];
        const formatSpec = formatEntry.format;

        if (formatSpec.kind === /*FormatStringEntryKind_Literal*/0x1) {
            formatter.emitLiteralChar(formatSpec.enum === /*SingletonFormatStringEntry_HASH*/0x11 ? "#" : "%");
        }
        else if (formatSpec.kind === /*FormatStringEntryKind_Expando*/0x2) {
            const data = this.getCurrentWriteData();
            const specEnum = formatSpec.enum;
            if (specEnum === /*SingletonFormatStringEntry_SOURCE*/0x15) {
                formatter.emitCallStack(this.getStringForIdx(data));
            }
            else if (specEnum === /*SingletonFormatStringEntry_WALLCLOCK*/0x16) {
                formatter.emitLiteralString((new Date(data)).toISOString());
            }
            else if (specEnum === /*SingletonFormatStringEntry_TIMESTAMP*/0x17 || specEnum === /*SingletonFormatStringEntry_CALLBACK*/0x18 || specEnum === /*SingletonFormatStringEntry_REQUEST*/0x19) {
                formatter.emitNumber(data);
            }
            else {
                formatter.emitJsString(this.getStringForIdx(data));
            }
            this.advanceWritePos();
        }
        else {
            const tag = this.getCurrentWriteTag();
            const data = this.getCurrentWriteData();

            if (tag === /*LogEntryTags_JsBadFormatVar*/0xA) {
                this.emitVarTagEntry(formatter);
                this.advanceWritePos();
            }
            else {
                switch (formatSpec.enum) {
                    case /*SingletonFormatStringEntry_BOOL*/0x22:
                        formatter.emitLiteralString(data === 1 ? "true" : "false");
                        this.advanceWritePos();
                        break;
                    case /*SingletonFormatStringEntry_NUMBER*/0x23:
                        formatter.emitNumber(data);
                        this.advanceWritePos();
                        break;
                    case /*SingletonFormatStringEntry_STRING*/0x24:
                        formatter.emitJsString(this.getStringForIdx(data));
                        this.advanceWritePos();
                        break;
                    case /*SingletonFormatStringEntry_DATEISO*/0x25:
                        formatter.emitLiteralString((new Date(data)).toISOString());
                        this.advanceWritePos();
                        break;
                    case /*SingletonFormatStringEntry_DATEUTC*/0x26:
                        formatter.emitLiteralString((new Date(data)).toUTCString());
                        this.advanceWritePos();
                        break;
                    case /*SingletonFormatStringEntry_DATELOCAL*/0x27:
                        formatter.emitLiteralString((new Date(data)).toString());
                        this.advanceWritePos();
                        break;
                    case /*LogEntryTags_LParen*/0x5:
                        this.emitObjectEntry(formatter);
                        //position is advanced in call
                        break;
                    case /*LogEntryTags_LBrack*/0x7:
                        this.emitArrayEntry(formatter);
                        //position is advanced in call
                        break;
                    default:
                        this.emitVarTagEntry(formatter);
                        this.advanceWritePos();
                        break;
                }
            }
        }

        formatter.emitLiteralString(tailingFormatSegmentArray[formatIndex]);
    }

    formatter.emitLiteralString("\n");

    assert(this.getCurrentWriteTag() === /*LogEntryTags_MsgEndSentinal*/0x4, "We messed up something.");
    this.advanceWritePos();
};


/**
 * Emit a single jsvar or special var data entry.
 * @method
 * @param {Object} formatter the formatter that knows how to serialize data values
 */
FormatterLog.prototype.emitVarTagEntry = function (formatter) {
    const tag = this.getCurrentWriteTag();

    switch (tag) {
        case /*LogEntryTags_JsVarValue_Undefined*/0x30:
            formatter.emitLiteralString("undefined");
            break;
        case /*LogEntryTags_JsVarValue_Null*/0x31:
            formatter.emitLiteralString("null");
            break;
        case /*LogEntryTags_JsVarValue_Bool*/0x32:
            formatter.emitLiteralString(this.getCurrentWriteData() === 1 ? "true" : "false");
            break;
        case /*LogEntryTags_JsVarValue_Number*/0x34:
            formatter.emitNumber(this.getCurrentWriteData());
            break;
        case /*LogEntryTags_JsVarValue_String*/0x38:
            formatter.emitJsString(this.getStringForIdx(this.getCurrentWriteData()));
            break;
        case /*LogEntryTags_JsVarValue_Date*/0x3A:
            formatter.emitJsString((new Date(this.getCurrentWriteData())).toISOString());
            break;
        default:
            formatter.emitSpecialVar(tag);
            break;
    }
};


/**
 * Emit an object entry
 * @method
 * @param {Object} formatter the formatter that knows how to serialize data values
 */
FormatterLog.prototype.emitObjectEntry = function (formatter) {
    formatter.emitLiteralChar("{");
    this.advanceWritePos();

    let skipComma = true;
    while (this.getCurrentWriteTag() !== /*LogEntryTags_RParen*/0x6) {
        if (skipComma) {
            skipComma = false;
        }
        else {
            formatter.emitLiteralString(", ");
        }
        this.emitJsString(this.getStringForIdx(this.getCurrentWriteData()));
        formatter.emitLiteralString(": ");

        this.advanceWritePos();

        const tag = this.getCurrentWriteTag();
        if (tag === /*LogEntryTags_LParen*/0x5) {
            this.emitObjectEntry(formatter);
        }
        else if (tag === /*LogEntryTags_LBrack*/0x7) {
            this.emitArrayEntry(formatter);
        }
        else {
            this.emitVarTagEntry(formatter);
            this.advanceWritePos();
        }
    }

    formatter.emitLiteralChar("}");
    this.advanceWritePos();
};

/**
 * Emit an array entry
 * @method
 * @param {Object} formatter the formatter that knows how to serialize data values
 */
FormatterLog.prototype.emitArrayEntry = function (formatter) {
    formatter.emitLiteralChar("[");
    this.advanceWritePos();

    let skipComma = true;
    while (this.getCurrentWriteTag() !== /*LogEntryTags_RBrack*/0x8) {
        if (skipComma) {
            skipComma = false;
        }
        else {
            formatter.emitLiteralString(", ");
        }

        const tag = this.getCurrentWriteTag();
        if (tag === /*LogEntryTags_LParen*/0x5) {
            this.emitObjectEntry(formatter);
        }
        else if (tag === /*LogEntryTags_LBrack*/0x7) {
            this.emitArrayEntry(formatter);
        }
        else {
            this.emitVarTagEntry(formatter);
            this.advanceWritePos();
        }
    }

    formatter.emitLiteralChar("]");
    this.advanceWritePos();
};

/////////////////////////////////////////////////////////////////////////////////////////////////
//Define the actual logger

const formatters = require("./formatter");
const transporters = require("./transport");
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
 * From the option object tag build the appropriate transporter
 * @param {string} kind the kind of transporter we want to build (default to Console)
 * @param {Object} options optional info needed to construct specified transports
 * @param {Function} transporterrorcb the error callback on transporter related errors
 * @returns {Object} the transporter object
 */
function buildTransporter(kind, options, transporterrorcb) {
    if (kind === "String") {
        return new transporters.createStringTransport(transporterrorcb);
    }
    else {
        return new transporters.createConsoleTransport(transporterrorcb);
    }
}

/**
 * From the option string tag build the appropriate formatter
 * @param {string} kind the kind of formatter we want to build (default to JSON)
 * @returns {Object} the formatter object
 */
function buildFormatter(kind) {
    return new formatters.createJSONFormatter();
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
        HOST: options.host || "localhost",
        APP: appName,
        TIMESTAMP: 0,
        CALLBACK: -1,
        REQUEST: -1
    };

    //True if we want to include a standard prefix on each log message
    const m_doPrefix = typeof (options.defaultPrefix) === "boolean" ? options.defaultPrefix : true;
    const m_doTimeLimit = true;

    //Blocklists containing the information logged into memory and pending to write out
    const m_inMemoryLog = new InMemoryLog();
    const m_formatterLog = new FormatterLog();

    let m_retainLevel = sanitizeLogLevel(typeof (options.retainLevel) === "number" ? options.retainLevel : LoggingLevels.WARN);
    const m_retainCategories = {};
    const ctg = options.retainCategories || { "default": true };
    Object.getOwnPropertyNames(ctg).forEach((p) => {
        if (typeof (ctg[p]) === "boolean") {
            m_retainCategories[p] = ctg[p];
        }
    });

    let m_maxBufferTime = typeof (options.bufferTimeLimit) === "number" ? options.bufferTimeLimit : 1000;
    let m_maxBufferSize = typeof (options.bufferSizeLimit) === "number" ? options.bufferSizeLimit : 8192;

    const processentriescb = () => {
        const starttime = Date.now();

        let donework = false;
        let waitflush = false;
        let timelimit = false;

        try {
            m_inMemoryLog.processMessagesForWrite(m_formatterLog, m_retainLevel, m_retainCategories, m_maxBufferTime, m_maxBufferSize);

            while (!donework && !waitflush && !timelimit) {
                donework = !m_formatterLog.emitKEntries(m_formatter, m_doPrefix, m_writeGroupSize);

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

    let m_formatter = buildFormatter(options.formatter);
    let m_transport = buildTransporter(options.transporter, options, transporterrorcb);

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
        const m_enabledCategories = {};
        const ctg = options.retainCategories || { "default": true };
        Object.getOwnPropertyNames(ctg).forEach((p) => {
            if (typeof (ctg[p]) === "boolean") {
                m_enabledCategories[p] = ctg[p];
            }
        });

        const m_env = {
            globalEnv: m_globalenv,
            MODULE: moduleName,
            logger_path: __filename,
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
                        slogLevel = LoggingLevels.OFF;
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
                    m_inMemoryLog.processMessagesForWrite_HardFlush(m_formatterLog, false, slogLevel, m_retainCategories);
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
                    m_inMemoryLog.processMessagesForWrite_HardFlush(m_formatterLog, false, m_retainLevel, m_retainCategories);
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
                    m_inMemoryLog.processMessagesForWrite_HardFlush(m_formatterLog, false, m_retainLevel, m_retainCategories);
                    m_retainCategories[category] = false;
                }
            }
            catch (ex) {
                console.error("Hard failure in disableRetainedLoggingCategory -- " + ex.toString());
            }
        };

        /**
         * Set the ring buffer bound based on the age of the entires -- not older than the bound.
         * @param {number} timeBound is the new time limit for the ring buffer
         */
        this.setTimeLengthBound = function (timeBound) {
            if (typeof (timeBound) !== "number" || timeBound <= 0) {
                return;
            }

            try {
                if (s_rootLogger !== this) {
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
         * @param {number} sizeBound is the new size limit for the ring buffer
         */
        this.setBufferSizeBound = function (sizeBound) {
            if (typeof (sizeBound) !== "number" || sizeBound <= 0) {
                return;
            }

            try {
                if (s_rootLogger !== this) {
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
                const fmtObj = extractMsgFormat(fmtName, s_fmtMap.size, fmtInfo);
                m_formatInfo.set(fmtName, fmtObj);
                s_fmtMap.set(fmtObj.formatId, fmtObj);
            }
            catch (ex) {
                console.error("Hard failure in addFormat -- " + ex.toString());
            }
        };

        //
        //TODO: allow add "formats" from JSON object or file for nice organization
        //

        function isImplicitFormat(fmtInfo) {
            return typeof (fmtInfo) !== "string" || (fmtInfo.startsWith("%") && fmtInfo.endsWith("%"));
        }

        function generateImplicitFormat(fmtInfo, args) {
            //Get the line string of the caller
            const cstack = new Error()
                .stack
                .split("\n")
                .slice(2);
            const lfilename = cstack[0];

            if (m_formatInfo.has(lfilename)) {
                return m_formatInfo.get(lfilename);
            }

            let fmtObj = undefined;
            if (typeof (fmtInfo) === "string") {
                fmtObj = extractMsgFormat("implicit_format", s_fmtMap.size, fmtInfo.substr(1, fmtInfo.length - 2)); //trim %
            }
            else {
                args.unshift(fmtInfo);
                fmtObj = extractMsgFormat("implicit_format", s_fmtMap.size, "%{0:g}");
            }

            m_formatInfo.set(lfilename, fmtObj);
            s_fmtMap.set(fmtObj.formatId, fmtObj);
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

                    m_inMemoryLog.logMessage(m_env, fixedLevel, "default", m_doTimeLimit, fmti, args);
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

                        m_inMemoryLog.logMessage(m_env, fixedLevel, category, m_doTimeLimit, fmti, args);
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

                        m_inMemoryLog.logMessage(m_env, fixedLevel, "default", m_doTimeLimit, fmti, args);
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

                            m_inMemoryLog.logMessage(m_env, fixedLevel, category, m_doTimeLimit, fmti, args);
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
            logger.fatal = isLevelEnabledForLogging(LoggingLevels.FATAL, m_memoryLogLevel) ? getMsgLogWLevelGenerator(LoggingLevels.FATAL) : doMsgLog_NOP;
            logger.error = isLevelEnabledForLogging(LoggingLevels.ERROR, m_memoryLogLevel) ? getMsgLogWLevelGenerator(LoggingLevels.ERROR) : doMsgLog_NOP;
            logger.warn = isLevelEnabledForLogging(LoggingLevels.WARN, m_memoryLogLevel) ? getMsgLogWLevelGenerator(LoggingLevels.WARN) : doMsgLog_NOP;
            logger.info = isLevelEnabledForLogging(LoggingLevels.INFO, m_memoryLogLevel) ? getMsgLogWLevelGenerator(LoggingLevels.INFO) : doMsgLog_NOP;
            logger.debug = isLevelEnabledForLogging(LoggingLevels.DEBUG, m_memoryLogLevel) ? getMsgLogWLevelGenerator(LoggingLevels.DEBUG) : doMsgLog_NOP;
            logger.trace = isLevelEnabledForLogging(LoggingLevels.TRACE, m_memoryLogLevel) ? getMsgLogWLevelGenerator(LoggingLevels.TRACE) : doMsgLog_NOP;

            logger.fatalCategory = isLevelEnabledForLogging(LoggingLevels.FATAL, m_memoryLogLevel) ? getMsgLogWLevelGeneratorCategory(LoggingLevels.FATAL) : doMsgLogCategory_NOP;
            logger.errorCategory = isLevelEnabledForLogging(LoggingLevels.ERROR, m_memoryLogLevel) ? getMsgLogWLevelGeneratorCategory(LoggingLevels.ERROR) : doMsgLogCategory_NOP;
            logger.warnCategory = isLevelEnabledForLogging(LoggingLevels.WARN, m_memoryLogLevel) ? getMsgLogWLevelGeneratorCategory(LoggingLevels.WARN) : doMsgLogCategory_NOP;
            logger.infoCategory = isLevelEnabledForLogging(LoggingLevels.INFO, m_memoryLogLevel) ? getMsgLogWLevelGeneratorCategory(LoggingLevels.INFO) : doMsgLogCategory_NOP;
            logger.debugCategory = isLevelEnabledForLogging(LoggingLevels.DEBUG, m_memoryLogLevel) ? getMsgLogWLevelGeneratorCategory(LoggingLevels.DEBUG) : doMsgLogCategory_NOP;
            logger.traceCategory = isLevelEnabledForLogging(LoggingLevels.TRACE, m_memoryLogLevel) ? getMsgLogWLevelGeneratorCategory(LoggingLevels.TRACE) : doMsgLogCategory_NOP;

            logger.fatalIf = isLevelEnabledForLogging(LoggingLevels.FATAL, m_memoryLogLevel) ? getMsgLogWLevelGeneratorCond(LoggingLevels.FATAL) : doMsgLogCond_NOP;
            logger.errorIf = isLevelEnabledForLogging(LoggingLevels.ERROR, m_memoryLogLevel) ? getMsgLogWLevelGeneratorCond(LoggingLevels.ERROR) : doMsgLogCond_NOP;
            logger.warnIf = isLevelEnabledForLogging(LoggingLevels.WARN, m_memoryLogLevel) ? getMsgLogWLevelGeneratorCond(LoggingLevels.WARN) : doMsgLogCond_NOP;
            logger.infoIf = isLevelEnabledForLogging(LoggingLevels.INFO, m_memoryLogLevel) ? getMsgLogWLevelGeneratorCond(LoggingLevels.INFO) : doMsgLogCond_NOP;
            logger.debugIf = isLevelEnabledForLogging(LoggingLevels.DEBUG, m_memoryLogLevel) ? getMsgLogWLevelGeneratorCond(LoggingLevels.DEBUG) : doMsgLogCond_NOP;
            logger.traceIf = isLevelEnabledForLogging(LoggingLevels.TRACE, m_memoryLogLevel) ? getMsgLogWLevelGeneratorCond(LoggingLevels.TRACE) : doMsgLogCond_NOP;

            logger.fatalCategoryIf = isLevelEnabledForLogging(LoggingLevels.FATAL, m_memoryLogLevel) ? getMsgLogWLevelGeneratorCategoryCond(LoggingLevels.FATAL) : doMsgLogCategoryCond_NOP;
            logger.errorCategoryIf = isLevelEnabledForLogging(LoggingLevels.ERROR, m_memoryLogLevel) ? getMsgLogWLevelGeneratorCategoryCond(LoggingLevels.ERROR) : doMsgLogCategoryCond_NOP;
            logger.warnCategoryIf = isLevelEnabledForLogging(LoggingLevels.WARN, m_memoryLogLevel) ? getMsgLogWLevelGeneratorCategoryCond(LoggingLevels.WARN) : doMsgLogCategoryCond_NOP;
            logger.infoCategoryIf = isLevelEnabledForLogging(LoggingLevels.INFO, m_memoryLogLevel) ? getMsgLogWLevelGeneratorCategoryCond(LoggingLevels.INFO) : doMsgLogCategoryCond_NOP;
            logger.debugCategoryIf = isLevelEnabledForLogging(LoggingLevels.DEBUG, m_memoryLogLevel) ? getMsgLogWLevelGeneratorCategoryCond(LoggingLevels.DEBUG) : doMsgLogCategoryCond_NOP;
            logger.traceCategoryIf = isLevelEnabledForLogging(LoggingLevels.TRACE, m_memoryLogLevel) ? getMsgLogWLevelGeneratorCategoryCond(LoggingLevels.TRACE) : doMsgLogCategoryCond_NOP;
        }
        updateLoggingFunctions(this, m_memoryLogLevel);

        /**
        * Synchronously emit the in memory log to the specified writer for failure notification
        * @method
        */
        this.emitFullLogSync = function () {
            try {
                m_inMemoryLog.processMessagesForWrite_HardFlush(m_formatterLog, true, LoggingLevels.ALL, {});

                let donework = false;
                while (!donework) {
                    donework = !m_formatterLog.emitKEntries(m_formatter, m_doPrefix, m_writeGroupSize);

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

        this.__diagnosticOutput = function () {
            const res = m_transport.data.trim();
            m_transport.data = "";

            return res;
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
const s_defaultSubLoggerLevel = LoggingLevels.WARN;

/**
 * Map of the loggers created for various module names
 */
const s_loggerMap = new Map();

const s_options = {
    emitCategories: "object",
    defaultPrefix: "boolean",
    retainLevel: "string",
    retainCategories: "object",
    bufferSizeLimit: "number",
    bufferTimeLimit: "number",
    formatter: "string",
    transporter: "string"
    //TODO: when we have other transporters (io, network) need to support config options here
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
    if (typeof (level) !== "string" || LoggingLevels[level] === undefined) {
        throw new Error(`Expected logging level but got ${level}`);
    }
    const rlevel = LoggingLevels[level];

    const ropts = {
        host: require("os").hostname(),
        memoryLogLevel: rlevel
    };

    Object.getOwnPropertyNames(options).forEach((p) => {
        if (s_options.hasOwnProperty(p)) {
            const pval = options[p];
            if (pval === null || pval === undefined || typeof (pval) != s_options[p]) {
                throw new Error(`Invalid option "${p}" expected "${options[p]}" value but got ${pval}`);
            }

            if (p === "retainLevel") {
                if (LoggingLevels[pval] === undefined) {
                    throw new Error(`Expected logging level but got ${level}`);
                }
                ropts[p] = LoggingLevels[pval];
            }
            else {
                ropts[p] = pval;
            }
        }
    });

    if (ropts.retainLevel !== undefined) {
        ropts.retainLevel = Math.min(ropts.retainLevel, rlevel);
    }
    else {
        ropts.retainLevel = Math.min(LoggingLevels.WARN, rlevel);
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
    const lfilename = cstack[0];

    let logger = s_loggerMap.get(name);
    if (!logger) {
        if (require.main.filename !== lfilename) {
            if (s_disabledSubLoggerNames.has(lfilename)) {
                ropts.retainLevel = LoggingLevels.OFF;
            }
            else {
                const enabledlevel = s_enabledSubLoggerNames.get(lfilename);
                ropts.retainLevel = enabledlevel !== undefined ? enabledlevel : s_defaultSubLoggerLevel;
            }
        }

        logger = s_loggerFactory.createLogger(name, ropts);
        logger.Levels = LoggingLevels;

        if (require.main.filename === lfilename) {
            s_rootLogger = logger;
        }

        s_loggerMap.set(name, logger);
    }

    return logger;
};
