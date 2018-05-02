"use strict";

const nlogger = require("C:\\Code\\logpp\\build\\Debug\\nlogger.node");

/////////////////////////////////////////////////////////////////////////////////////////////////
//Start off with a bunch of costant definitions.
//In a number of cases we don't actually define here. Instead we have a comment and literal value which
//  we actually put in the code where needed (so no need to load in bytecode and very obvious for JIT).

/**
 * Global array of ids -> format specifications
 */
const s_fmtMap = [];

/**
 * Global array of category ids -> enabled/disabled
 */
const s_enabledCategories = [
    false, //0 is not usable since we do -i indexing
    true //$default is enabled by default
];

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
    ObjectLength: 1024,
    ArrayLength: 128
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
    MODULE: 0x4,
    SOURCE: 0x5,
    WALLCLOCK: 0x6,
    TIMESTAMP: 0x7,
    CALLBACK: 0x8,
    REQUEST: 0x9,

    PERCENT: 0x11,
    BOOL: 0x12,
    NUMBER: 0x13,
    STRING: 0x14,
    DATEISO: 0x15,
    DATEUTC: 0x16,
    DATELOCAL: 0x17,
    GENERAL: 0x18,
    OBJECT: 0x19,
    ARRAY: 0x1A
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
    MsgEndSentinal: 0x5,
    LParen: 0x6,
    RParen: 0x7,
    LBrack: 0x8,
    RBrack: 0x9,

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
 * Object singletons for format entries
 */
const FormatStringEntryParseMap = new Map();
FormatStringEntryParseMap.set("##", { kind: FormatStringEntryKind.Literal, enum: FormatStringEnum.HASH });
FormatStringEntryParseMap.set("%%", { kind: FormatStringEntryKind.Literal, enum: FormatStringEnum.PERCENT });

FormatStringEntryParseMap.set("#host", { kind: FormatStringEntryKind.Expando, enum: FormatStringEnum.HOST });
FormatStringEntryParseMap.set("#app", { kind: FormatStringEntryKind.Expando, enum: FormatStringEnum.APP });
FormatStringEntryParseMap.set("#module", { kind: FormatStringEntryKind.Expando, enum: FormatStringEnum.MODULE });
FormatStringEntryParseMap.set("#source", { kind: FormatStringEntryKind.Expando, enum: FormatStringEnum.SOURCE });
FormatStringEntryParseMap.set("#wallclock", { kind: FormatStringEntryKind.Expando, enum: FormatStringEnum.WALLCLOCK });
FormatStringEntryParseMap.set("#timestamp", { kind: FormatStringEntryKind.Expando, enum: FormatStringEnum.TIMESTAMP });
FormatStringEntryParseMap.set("#callback", { kind: FormatStringEntryKind.Expando, enum: FormatStringEnum.CALLBACK });
FormatStringEntryParseMap.set("#request", { kind: FormatStringEntryKind.Expando, enum: FormatStringEnum.REQUEST });

FormatStringEntryParseMap.set("b", { kind: FormatStringEntryKind.Basic, enum: FormatStringEnum.BOOL });
FormatStringEntryParseMap.set("n", { kind: FormatStringEntryKind.Basic, enum: FormatStringEnum.NUMBER });
FormatStringEntryParseMap.set("s", { kind: FormatStringEntryKind.Basic, enum: FormatStringEnum.STRING });
FormatStringEntryParseMap.set("di", { kind: FormatStringEntryKind.Basic, enum: FormatStringEnum.DATEISO });
FormatStringEntryParseMap.set("du", { kind: FormatStringEntryKind.Basic, enum: FormatStringEnum.DATEUTC });
FormatStringEntryParseMap.set("dl", { kind: FormatStringEntryKind.Basic, enum: FormatStringEnum.DATELOCAL });
FormatStringEntryParseMap.set("g", { kind: FormatStringEntryKind.Basic, enum: FormatStringEnum.GENERAL });
FormatStringEntryParseMap.set("o", { kind: FormatStringEntryKind.Compound, enum: FormatStringEnum.OBJECT });
FormatStringEntryParseMap.set("a", { kind: FormatStringEntryKind.Compound, enum: FormatStringEnum.ARRAY });

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
const s_basicFormatStringRe = new RegExp("^\\%{(\\d+):(" + s_basicFormatStrings.join("|") + ")}$");
const s_compoundFormatStringRe = new RegExp("^\\%{(\\d+):(" + s_compoundFormatStrings.join("|") + ")(<(\\d+|\\*)?,(\\d+|\\*)?>)}$");

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
                .sort()
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
const s_formatArgPosNumberRegex = /\d+/y;
const s_formatDepthLengthRegex = /([o|a])<[ ]*(\d+|\*)?[ ]*,[ ]*(\d+|\*)?[ ]*>}/y;

/**
 * Helper function to extract and construct an argument format specifier or throws is the format specifier is malformed.
 * @function
 * @param {string} fmtString the format string we are working on
 * @param {number} vpos the current position in the string
 * @returns Object the expando MsgFormatEntry and the range of the string that was idenitifed as the formatter
 */
function extractArgumentFormatSpecifier(fmtString, vpos) {
    if (fmtString.startsWith("%%", vpos)) {
        return formatEntryInfoExtractorHelper(FormatStringEntryKind.Literal, FormatStringEnum.PERCENT, vpos, vpos + "%%".length);
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
        const basicFormatOptionStr = s_basicFormatStrings.find(function (value) { return value.length === 1 ? value === cchar : fmtString.startsWith(value, specPos); });
        const compoundFormatOptionStr = s_compoundFormatStrings.find(function (value) { return value === cchar; });

        if (!basicFormatOptionStr && !compoundFormatOptionStr) {
            throw new FormatSyntaxError("Bad formatting specifier", fmtString, specPos);
        }

        if (basicFormatOptionStr) {
            const basicFormatOptionInfo = FormatStringEntryParseMap.get(basicFormatOptionStr);
            const fendpos = specPos + basicFormatOptionStr.length + 1; //"fmt}".length
            return formatEntryInfoExtractorHelper(basicFormatOptionInfo.kind, basicFormatOptionInfo.enum, vpos, fendpos, argPosition, -1, -1);
        }
        else {
            const DL_STAR = 1073741824;

            if (fmtString.startsWith("o}", specPos)) {
                return formatEntryInfoExtractorHelper(FormatStringEntryKind.Compound, FormatStringEnum.OBJECT, vpos, specPos + "o}".length, argPosition, ExpandDefaults.Depth, ExpandDefaults.ObjectLength);
            }
            else if (fmtString.startsWith("a}", specPos)) {
                return formatEntryInfoExtractorHelper(FormatStringEntryKind.Compound, FormatStringEnum.ARRAY, vpos, specPos + "a}".length, argPosition, ExpandDefaults.Depth, ExpandDefaults.ArrayLength);
            }
            else {
                s_formatDepthLengthRegex.lastIndex = specPos;
                const dlMatch = s_formatDepthLengthRegex.exec(fmtString);
                if (!dlMatch) {
                    throw new FormatSyntaxError("Bad position specifier in format", fmtString, s_formatDepthLengthRegex.lastIndex);
                }

                const ttag = (dlMatch[1] === "o") ? FormatStringEnum.OBJECT : FormatStringEnum.ARRAY;
                let tdepth = ExpandDefaults.Depth;
                let tlength = (dlMatch[1] === "o") ? ExpandDefaults.ObjectLength : ExpandDefaults.ArrayLength;

                if (dlMatch[2]) {
                    tdepth = (dlMatch[2] !== "*") ? Number.parseInt(dlMatch[2]) : DL_STAR;
                }

                if (dlMatch[3]) {
                    tlength = (dlMatch[3] !== "*") ? Number.parseInt(dlMatch[3]) : DL_STAR;
                }

                return formatEntryInfoExtractorHelper(FormatStringEntryKind.Compound, ttag, vpos, specPos + dlMatch[0].length, argPosition, tdepth, tlength);
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
        if (typeid !== TypeNameEnum.TObject && typeid !== TypeNameEnum.TJsArray) {
            throw new FormatSyntaxError("Format description options are string | object layout | array layout", undefined, 0);
        }

        fmtString = expandToJsonFormatter(fmtInfo);
    }

    if (s_newlineRegex.test(fmtString)) {
        throw new FormatSyntaxError("Format cannot contain newlines", undefined, 0);
    }

    const fArray = [];
    while (cpos < fmtString.length) {
        const cchar = fmtString.charAt(cpos);
        if (cchar !== "#" && cchar !== "%") {
            cpos++;
        }
        else {
            const fmt = (cchar === "#") ? extractExpandoSpecifier(fmtString, cpos) : extractArgumentFormatSpecifier(fmtString, cpos);
            fArray.push(fmt);

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

    nlogger.registerFormat(fmtId, kindArray, enumArray, initialFormatSegment, tailingFormatSegmentArray, fmtString);
    const fmtObj = createMsgFormat(fmtName, fmtId, formatArray);
    s_fmtMap.push(fmtObj);

    return fmtObj.formatId;
}

/////////////////////////////////////////////////////////////////////////////////////////////////
//Define structure for representing the in memory log entries.
//We want to be able to effciently copy any data needed to construct the log message into this structure.
//  The actual formatting of the message will take place once we decide we need the message. Either it is
//  moved to stable storage or we encountered a situation where we want a detailed log dump.

/**
 * The number of entries we have in a msg block.
 */
const MemoryMsgBlockSizes = [256, 512, 1024, 2048, 4096, 8192, 16384];
const MemoryMsgBlockInitSize = 256;

let s_flushCount = MemoryMsgBlockInitSize / 2;

//internal function for allocating a block
function createMemoryMsgBlock(previousBlock, sizespec) {
    let blocksize = MemoryMsgBlockInitSize;
    if (sizespec) {
        const nextSizeTry = MemoryMsgBlockSizes.indexOf(sizespec) + 1;
        blocksize = MemoryMsgBlockSizes[nextSizeTry === MemoryMsgBlockSizes.length ? MemoryMsgBlockSizes.length - 1 : nextSizeTry];
    }

    const nblock = {
        spos: 0,
        epos: 0,
        tags: new Uint8Array(blocksize),
        data: new Float64Array(blocksize),
        stringData: [],
        stringMap: new Map(),
        next: null,
        blocksize: blocksize,
        previous: previousBlock
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

    this.stringCtr = 0;
    this.writeCount = 0;
}

/**
 * Clear the contents of the InMemoryLog
 * @method
 */
InMemoryLog.prototype.clear = function () {
    if (this.head.epos < this.head.blocksize / 2) {
        const downsizeopt = MemoryMsgBlockSizes.find((value) => value <= this.head.epos && this.head.epos <= value * 2);
        this.head = createMemoryMsgBlock(null, downsizeopt);

        this.stringCtr = 0;
    }
    else {
        this.head.tags.fill(LogEntryTags.Clear, 0, this.head.epos);
        this.head.data.fill(undefined, 0, this.head.epos);
        this.head.stringData = [];
        this.head.stringMap.clear();
        this.head.spos = 0;
        this.head.epos = 0;
        this.head.next = null;
    }

    this.tail = this.head;
};

/**
 * Ensure that there is a slot read to be written into
 */
InMemoryLog.prototype.ensureSlot = function () {
    let block = this.tail;
    if (block.epos === block.blocksize) {
        block = createMemoryMsgBlock(block, block.blocksize);
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
 * Add the header info for a msg in the InMemoryLog
 * @method
 */
InMemoryLog.prototype.addMsgHeader = function (fmt, level, category) {
    let block = this.tail;
    if (block.epos + 4 >= block.blocksize) {
        block = createMemoryMsgBlock(block, block.blocksize);
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
 * Add functions to process general values via lookup on typeid number in prototype array
 */
const AddGeneralValue_RemainingTypesCallTable = new Array(TypeNameEnum.TypeLimit);
AddGeneralValue_RemainingTypesCallTable.fill(null);

AddGeneralValue_RemainingTypesCallTable[TypeNameEnum.TDate] = function (inMemoryLog, value, depth) {
    inMemoryLog.addNumberEntry(LogEntryTags.JsVarValue_Date, value.valueOf());
};
AddGeneralValue_RemainingTypesCallTable[TypeNameEnum.TObject] = function (inMemoryLog, value, depth) {
    inMemoryLog.addExpandedObject(value, depth, ExpandDefaults.ObjectLength);
};
AddGeneralValue_RemainingTypesCallTable[TypeNameEnum.TJsArray] = function (inMemoryLog, value, depth) {
    inMemoryLog.addExpandedArray(value, depth, ExpandDefaults.ArrayLength);
};
AddGeneralValue_RemainingTypesCallTable[TypeNameEnum.TTypedArray] = function (inMemoryLog, value, depth) {
    inMemoryLog.addExpandedArray(value, depth, ExpandDefaults.ArrayLength);
};
AddGeneralValue_RemainingTypesCallTable[TypeNameEnum.TUnknown] = function (inMemoryLog, value, depth) {
    inMemoryLog.addTagOnlyEntry(LogEntryTags.OpaqueValue);
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
            this.addStringEntry(LogEntryTags.PropertyRecord, p);

            const value = obj[p];
            const typeid = getTypeNameEnum(value);
            if (typeid <= TypeNameEnum.LastImmutableType) {
                this.addJsVarValueEntry(typeid, value);
            }
            else {
                (AddGeneralValue_RemainingTypesCallTable[typeid])(this, value, depth - 1);
            }

            allowedLengthRemain--;
            if (allowedLengthRemain <= 0) {
                this.addTagOnlyEntry(LogEntryTags.LengthBoundObject);
                break;
            }
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
            const typeid = getTypeNameEnum(value);
            if (typeid <= TypeNameEnum.LastImmutableType) {
                this.addJsVarValueEntry(typeid, value);
            }
            else {
                (AddGeneralValue_RemainingTypesCallTable[typeid])(this, value, depth - 1);
            }

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
    this.addMsgHeader(fmt, level, category);

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
            else if (specEnum === FormatStringEnum.MODULE) {
                this.addStringEntry(LogEntryTags.JsVarValue_StringIdx, env.MODULE);
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
                    case FormatStringEnum.DATEUTC:
                    case FormatStringEnum.DATELOCAL:
                        this.processDateHelper(vtype, value);
                        break;
                    case FormatStringEnum.OBJECT:
                        if (vtype === TypeNameEnum.TObject) {
                            this.addExpandedObject(value, formatEntry.expandDepth, formatEntry.expandLength);
                        }
                        else {
                            this.addTagOnlyEntry(LogEntryTags.JsBadFormatVar);
                        }
                        break;
                    case FormatStringEnum.ARRAY:
                        if (vtype === TypeNameEnum.TJsArray || vtype === TypeNameEnum.TTypedArray) {
                            this.addExpandedArray(value, formatEntry.expandDepth, formatEntry.expandLength);
                        }
                        else {
                            this.addTagOnlyEntry(LogEntryTags.JsBadFormatVar);
                        }
                        break;
                    default:
                        if (vtype <= TypeNameEnum.LastImmutableType) {
                            this.addJsVarValueEntry(vtype, value);
                        }
                        else {
                            (AddGeneralValue_RemainingTypesCallTable[vtype])(this, value, formatEntry.depth);
                        }
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
    if (this.writeCount < s_flushCount) {
        return false;
    }
    else {
        this.writeCount = 0;
        return true;
    }
};

/**
 * Filter out all the msgs that we want to drop when writing to disk and copy them to the pending write list.
 * Returns when we are both (1) under size limit and (2) the size limit -- setting them to Number.MAX_SAFE_INTEGER will effectively disable the check.
 * @method
 */
InMemoryLog.prototype.processMessagesForWrite = function () {
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
        const partialwrite = nlogger.processMsgsForEmit(this.head, newblock, msgCount, false);

        if (this.head.spos === this.head.epos) {
            this.removeHeadBlock();
        }
        newblock = false;
        keepProcessing = !partialwrite;
    } while (keepProcessing);
};

/**
 * Filter out all the msgs that we want to drop when writing to disk and copy them to the pending write list -- process all records.
 * @method
 */
InMemoryLog.prototype.processMessagesForWrite_HardFlush = function () {
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
        nlogger.processMsgsForEmit(this.head, newblock, msgCount, true);

        if (this.head.spos === this.head.epos) {
            this.removeHeadBlock();
        }
        newblock = false;
        keepProcessing = !(this.head.next === null && this.head.spos === this.head.epos);
    } while (keepProcessing);
};

/////////////////////////////////////////////////////////////////////////////////////////////////
//Define the actual logger

function isLevelEnabledForLogging(targetLevel, actualLevel) {
    return (targetLevel & actualLevel) === actualLevel;
}

//Special NOP implementations for disabled levels of logging
function doMsgLog_NOP(fmt, ...args) { }

function syncFlushAction() {
    this.processMessagesForWrite();
    const output = nlogger.formatMsgsSync();
    process.stdout.write(output);
}

let s_flushPending = false;
function asyncFlushAction() {
    if (!s_flushPending) {
        setImmediate(() => {
            s_flushPending = false;
            this.processMessagesForWrite();

            //
            //TODO: this should be async
            //
            const output = nlogger.formatMsgsSync();
            process.stdout.write(output);
        });
    }
}

function nopFlushAction() {
    //no action
}

/**
 * Constructor for the RootLogger
 * @constructor
 * @param {string} appName name of the root module (application)
 * @param {Object} the options object
 */
function LoggerFactory(appName, options) {
    //This state is common to all loggers and will be shared.
    const m_globalenv = {
        TIMESTAMP: 0,
        CALLBACK: -1,
        REQUEST: -1
    };

    //Blocklists containing the information logged into memory and pending to write out
    s_flushCount = options.flushCount;

    let m_flushAction = undefined;
    if (options.flushMode === "SYNC") {
        m_flushAction = syncFlushAction;
    }
    else if (options.flushMode === "ASYNC") {
        m_flushAction = asyncFlushAction;
    }
    else {
        m_flushAction = nopFlushAction;
    }

    const m_inMemoryLog = new InMemoryLog();

    //
    //TODO: set retain level in native code
    //

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
        //Level that this logger will record at going into memory
        let m_memoryLogLevel = options.memoryLevel;

        const m_env = {
            globalEnv: m_globalenv,
            MODULE: moduleName,
            logger_path: __filename,
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
                this.Formats["$" + fmtName] = extractMsgFormat(fmtName, s_fmtMap.length, fmtInfo);
            }
            catch (ex) {
                console.error("Hard failure in addFormat -- " + ex.toString());
            }
        };

        //
        //TODO: allow add "formats" from JSON object or file for nice organization
        //

        /*
        function generateImplicitFormat(fmtInfo, args) {
            //Get the line string of the caller
            const cstack = new Error()
                .stack
                .split("\n")
                .slice(2);
            const lfilename = cstack[0];

            //
            //TODO: add this in later -- use negative fmtId value to indicate
            //

            if (s_formatInfo.has(lfilename)) {
                return s_formatInfo.get(lfilename);
            }

            if (typeof (fmtInfo) === "string") {
                extractMsgFormat(lfilename, s_formatInfo.size * -1, fmtInfo.substr(1, fmtInfo.length - 2)); //trim %
            }
            else {
                args.unshift(fmtInfo);
                extractMsgFormat(lfilename, s_formatInfo.size * -1, "%{0:g}");
            }

            return s_formatInfo.get(lfilename);
        }
        */

        /**
         * TODO: add prefix (or postfix) formatters which will be inserted in all writes.
         * Support macro only as well as general options -- macro only are nice since uses don't need to pass other args
         */

        function processImplicitFormat(fmtstr, level, args) {
            //NOT IMTPLEMENTED YET
        }

        function processDefaultCategoryFormat(fmti, level, args) {
            const fmt = s_fmtMap[fmti];
            if (fmti === undefined) {
                console.error("Format name is not defined for this logger -- " + fmt);
                return;
            }

            const processingmsgs = m_inMemoryLog.logMessage(m_env, level, 1, fmt, 0, args);
            if (processingmsgs) {
                m_flushAction();
            }
        }

        function processExplicitCategoryFormat(categoryi, level, args) {
            const rcategory = -categoryi;
            if (s_enabledCategories[rcategory]) {
                if (args.length < 1) {
                    console.error("Format argument should be provided");
                    return;
                }

                const fmt = s_fmtMap.get(args[0]);
                if (fmt === undefined) {
                    console.error("Format name is not defined for this logger -- " + fmt);
                    return;
                }

                const processingmsgs = m_inMemoryLog.logMessage(m_env, level, rcategory, fmt, 1, args);
                if (processingmsgs) {
                    m_flushAction();
                }
            }
        }

        function getMsgLogGenerator(desiredLevel) {
            const fixedLevel = desiredLevel;
            return function (fmtorctgry, ...args) {
                try {
                    const tsw = typeof (fmtorctgry);
                    if (tsw === "string") {
                        processImplicitFormat(fmtorctgry, fixedLevel, args);
                    }
                    else if (tsw === "number") {
                        if (fmtorctgry >= 0) {
                            processDefaultCategoryFormat(fmtorctgry, desiredLevel, args);
                        }
                        else {
                            processExplicitCategoryFormat(fmtorctgry, desiredLevel, args);
                        }
                    }
                    else {
                        console.error("Bad arguments to formatter");
                    }
                }
                catch (ex) {
                    console.error("Hard failure in logging -- " + ex.toString());
                }
            };
        }

        //
        //TODO: conditional logger
        //

        function updateLoggingFunctions(logger, logLevel) {
            logger.fatal = isLevelEnabledForLogging(LoggingLevels.FATAL, m_memoryLogLevel) ? getMsgLogGenerator(LoggingLevels.FATAL) : doMsgLog_NOP;
            logger.error = isLevelEnabledForLogging(LoggingLevels.ERROR, m_memoryLogLevel) ? getMsgLogGenerator(LoggingLevels.ERROR) : doMsgLog_NOP;
            logger.warn = isLevelEnabledForLogging(LoggingLevels.WARN, m_memoryLogLevel) ? getMsgLogGenerator(LoggingLevels.WARN) : doMsgLog_NOP;
            logger.info = isLevelEnabledForLogging(LoggingLevels.INFO, m_memoryLogLevel) ? getMsgLogGenerator(LoggingLevels.INFO) : doMsgLog_NOP;
            logger.detail = isLevelEnabledForLogging(LoggingLevels.DETAIL, m_memoryLogLevel) ? getMsgLogGenerator(LoggingLevels.DETAIL) : doMsgLog_NOP;
            logger.debug = isLevelEnabledForLogging(LoggingLevels.DEBUG, m_memoryLogLevel) ? getMsgLogGenerator(LoggingLevels.DEBUG) : doMsgLog_NOP;
            logger.trace = isLevelEnabledForLogging(LoggingLevels.TRACE, m_memoryLogLevel) ? getMsgLogGenerator(LoggingLevels.TRACE) : doMsgLog_NOP;
        }
        updateLoggingFunctions(this, m_memoryLogLevel);

        /**
        * Synchronously emit the in memory log to the specified writer for failure notification
        * @method
        * @param {boolean} stdPrefix is true if we want to write a default prefix for each message
        */
        this.emitFullLogSync = function (stdPrefix) {
            try {
                m_inMemoryLog.processMessagesForWrite_HardFlush();
                return nlogger.formatMsgsSync(stdPrefix);
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
const s_defaultSubLoggerLevel = LoggingLevels.WARN;

/**
 * Map of the loggers created for various module names
 */
const s_loggerMap = new Map();

////////
//OPTIONS
//    memoryLevel: "string",
//    //memoryCategories: "object",
//    emitLevel: "string",
//    //emitCategories: "object",
//    //bufferSizeLimit: "number",
//    //bufferTimeLimit: "number"
//    flushCount: "number"
//    flushMode: "string" -- SYNC | ASYNC (default) | NOP
//    //TODO: when we have other transporters (io, network) need to support config options here
//
////

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

    const ropts = {
        host: require("os").hostname()
    };

    if (options.memoryLevel === undefined || typeof (options.memoryLevel) !== "string" || LoggingLevels[options.memoryLevel] === undefined) {
        ropts.memoryLevel = "DETAIL";
    }
    else {
        ropts.memoryLevel = options.memoryLevel;
    }

    if (options.emitLevel === undefined || typeof (options.emitLevel) !== "string" || LoggingLevels[options.emitLevel] === undefined) {
        ropts.emitLevel = (LoggingLevels["INFO"] <= LoggingLevels[ropts.memoryLevel]) ? "INFO" : ropts.memoryLevel;
    }
    else {
        ropts.emitLevel = (LoggingLevels[options.emitLevel] <= LoggingLevels[ropts.memoryLevel]) ? LoggingLevels[options.emitLevel] : ropts.memoryLevel;
    }

    if (options.flushCount === undefined || typeof (options.flushCount) !== "number" || options.flushCount <= 0) {
        ropts.flushCount = s_flushCount;
    }
    else {
        ropts.flushCount = options.flushCount;
    }

    if (options.flushMode === undefined || typeof (options.flushMode) !== "string" || (options.flushMode !== "SYNC" && options.flushMode !== "ASYNC" && options.flushMode !== "NOP")) {
        ropts.flushMode = "ASYNC";
    }
    else {
        ropts.flushMode = options.flushMode;
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
                ropts.memoryLevel = LoggingLevels.OFF;
            }
            else {
                const enabledlevel = s_enabledSubLoggerNames.get(lfilename);
                ropts.memoryLevel = enabledlevel !== undefined ? enabledlevel : s_defaultSubLoggerLevel;
            }
        }

        logger = s_loggerFactory.createLogger(name, ropts);
        logger.Levels = LoggingLevels;
        logger.Formats = {};
        logger.Categories = { $default: -1 };

        if (require.main.filename === lfilename) {
            s_rootLogger = logger;
        }

        s_loggerMap.set(name, logger);
    }

    return logger;
};
