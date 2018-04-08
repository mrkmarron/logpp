"use strict";

////
//Valid expandos are:
//#ip        -- ip address of the host
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
//${p:b} -- a boolean value
//${p:n} -- a number
//${p:s} -- a string
//${p:d-xxx} -- a date formatted as iso, utc, or local
//${p:o<d,l>} -- an object expanded up to d levels (default is 2) at most l items in any level (default is * for objects 128 for arrays)
//${p:a<d,l>} -- an array expanded up to d levels (default is 2) at most l items in any level (default is * for objects 128 for arrays)
//${p:g} -- general value (general format applied -- no array expansion, object depth of 2)
//$$ -- a literal $
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

//Default values we expand objects and arrays to
const DEFAULT_EXPAND_DEPTH = 2;
const DEFAULT_EXPAND_OBJECT_LENGTH = 1024;
const DEFAULT_EXPAND_ARRAY_LENGTH = 128;

/**
 * Tag values indicating the kind of each format entry
 */
const FormatStringEntryKind = {
    Literal: 1,
    Expando: 2,
    Basic: 3,
    Compound: 4
};
exports.FormatStringEntryKind = FormatStringEntryKind;

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
const s_formatStringEntrySingletons = {
    HASH: generateSingletonFormatStringEntry("HASH", FormatStringEntryKind.Literal, "#", 1, true),
    IP: generateSingletonFormatStringEntry("IP", FormatStringEntryKind.Expando, "#ip", 2, true),
    APP: generateSingletonFormatStringEntry("APP", FormatStringEntryKind.Expando, "#app", 3, true),
    MODULE: generateSingletonFormatStringEntry("MODULE", FormatStringEntryKind.Expando, "#module", 4, true),
    SOURCE: generateSingletonFormatStringEntry("SOURCE", FormatStringEntryKind.Expando, "#source", 5, true),
    WALLCLOCK: generateSingletonFormatStringEntry("WALLCLOCK", FormatStringEntryKind.Expando, "#wallclock", 6, true),
    TIMESTAMP: generateSingletonFormatStringEntry("TIMESTAMP", FormatStringEntryKind.Expando, "#timestamp", 7, true),
    CALLBACK: generateSingletonFormatStringEntry("CALLBACK", FormatStringEntryKind.Expando, "#callback", 8, true),
    REQUEST: generateSingletonFormatStringEntry("REQUEST", FormatStringEntryKind.Expando, "#request", 9, true),

    DOLLAR: generateSingletonFormatStringEntry("DOLLAR", FormatStringEntryKind.Literal, "$", 10, true),
    BOOL: generateSingletonFormatStringEntry("BOOL", FormatStringEntryKind.Basic, "b", 11, true), //${p:b}
    NUMBER: generateSingletonFormatStringEntry("NUMBER", FormatStringEntryKind.Basic, "n", 12, true), //${p:n}
    STRING: generateSingletonFormatStringEntry("STRING", FormatStringEntryKind.Basic, "s", 13, true), //${p:s}
    DATE: generateSingletonFormatStringEntry("DATE", FormatStringEntryKind.Basic, "d", 14, true), //${p:d}
    DATEISO: generateSingletonFormatStringEntry("DATEISO", FormatStringEntryKind.Basic, "d-iso", 15, true), //${p:d-iso}
    DATEUTC: generateSingletonFormatStringEntry("DATEUTC", FormatStringEntryKind.Basic, "d-utc", 16, true), //${p:d-utc}
    DATELOCAL: generateSingletonFormatStringEntry("DATELOCAL", FormatStringEntryKind.Basic, "d-local", 17, true), //${p:d-local}
    GENERAL: generateSingletonFormatStringEntry("GENERAL", FormatStringEntryKind.Basic, "g", 18, false), //${p:g}
    OBJECT: generateSingletonFormatStringEntry("OBJECT", FormatStringEntryKind.Compound, "o", 19, false), //${p:o<d,l>}
    ARRAY: generateSingletonFormatStringEntry("ARRAY", FormatStringEntryKind.Compound, "a", 20, false) //${p:a<d,l>}
};

const s_expandoEntries = Object.keys(s_formatStringEntrySingletons)
    .filter(function (value) { return s_formatStringEntrySingletons[value].kind === FormatStringEntryKind.Expando; })
    .map(function (value) { return s_formatStringEntrySingletons[value]; });

const s_basicFormatEntries = Object.keys(s_formatStringEntrySingletons)
    .filter(function (value) { return s_formatStringEntrySingletons[value].kind === FormatStringEntryKind.Basic; })
    .map(function (value) { return s_formatStringEntrySingletons[value]; });

const s_compoundFormatEntries = Object.keys(s_formatStringEntrySingletons)
    .filter(function (value) { return s_formatStringEntrySingletons[value].kind === FormatStringEntryKind.Compound; })
    .map(function (value) { return s_formatStringEntrySingletons[value]; });

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

const TypeNameEnum = {
    TUndefined: 1,
    TNull: 2,
    TBoolean: 3,
    TNumber: 4,
    TString: 5,

    LastImmutableType: 5,

    TDate: 6,

    LastSimpleType: 5,

    TFunction: 7,

    TObject: 8,
    TJsArray: 9,
    TTypedArray: 10,

    TUnknown: 11,

    LastType: 12
};
exports.TypeNameEnum = TypeNameEnum;

const TypeNameToFlagEnum = {
    "[object Undefined]": TypeNameEnum.TUndefined,
    "[object Null]": TypeNameEnum.TNull,
    "[object Boolean]": TypeNameEnum.TBoolean,
    "[object Number]": TypeNameEnum.TNumber,
    "[object String]": TypeNameEnum.TString,
    "[object Date]": TypeNameEnum.TDate,
    "[object Function]": TypeNameEnum.TFunction,
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
function typeGetIdTag(value) {
    return TypeNameToFlagEnum[toString.call(value)] || TypeNameEnum.TUnknown;
}

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
    const typeid = typeGetIdTag(jobj);

    if ((typeid === TypeNameEnum.TUndefined) || (typeid === TypeNameEnum.TNull) || (typeid === TypeNameEnum.TBoolean) || (typeid === TypeNameEnum.TNumber)) {
        return JSON.stringify(jobj);
    }
    else if (typeid === TypeNameEnum.TString) {
        if (s_expandoStringRe.test(jobj) || s_basicFormatStringRe.test(jobj) || s_compoundFormatStringRe.test(jobj)) {
            return jobj;
        }
        else {
            return "\"" + jobj + "\"";
        }
    }
    else if (typeid === TypeNameEnum.TObject) {
        return "{ " +
            Object.keys(jobj)
                .sort()
                .map(function (key) { return "\"" + key + "\":" + expandToJsonFormatter(jobj[key]); })
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
        return createMsgFormatEntry(s_formatStringEntrySingletons.HASH, vpos, vpos + "##".length, -1, -1, -1);
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
    if (fmtString.startsWith("$$", vpos)) {
        return createMsgFormatEntry(s_formatStringEntrySingletons.DOLLAR, vpos, vpos + "$$".length, -1, -1, -1);
    }
    else {
        if (!fmtString.startsWith("${", vpos)) {
            throw new FormatSyntaxError("Stray '$' in argument formatter", fmtString, vpos);
        }

        s_formatArgPosNumberRegex.lastIndex = vpos + "${".length;

        const argPositionMatch = s_formatArgPosNumberRegex.exec(fmtString);
        if (!argPositionMatch) {
            throw new FormatSyntaxError("Bad position specifier in format", fmtString, s_formatArgPosNumberRegex.lastIndex);
        }

        const argPosition = Number.parseInt(argPositionMatch[0]);
        if (argPosition < 0) {
            throw new FormatSyntaxError("Bad position specifier in format", fmtString, s_formatArgPosNumberRegex.lastIndex);
        }

        let specPos = vpos + "${".length + argPositionMatch[0].length;
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
            const fendpos = basicFormatOption.label.length + 1; //"fmt}".length
            return createMsgFormatEntry(basicFormatOption, vpos, fendpos, argPosition, -1, -1);
        }
        else {
            const DL_STAR = 1073741824;

            if (fmtString.startsWith("o}", specPos)) {
                return createMsgFormatEntry(s_formatStringEntrySingletons.OBJECT, vpos, specPos + "o}".length, argPosition, DEFAULT_EXPAND_DEPTH, DEFAULT_EXPAND_OBJECT_LENGTH);
            }
            else if (fmtString.startsWith("a}", specPos)) {
                return createMsgFormatEntry(s_formatStringEntrySingletons.ARRAY, vpos, specPos + "a}".length, argPosition, DEFAULT_EXPAND_DEPTH, DEFAULT_EXPAND_ARRAY_LENGTH);
            }
            else {
                s_formatDepthLengthRegex.lastIndex = specPos;
                const dlMatch = s_formatDepthLengthRegex.exec(fmtString);
                if (!dlMatch) {
                    throw new FormatSyntaxError("Bad position specifier in format", fmtString, s_formatDepthLengthRegex.lastIndex);
                }

                const ttag = (dlMatch[1] === "o") ? s_formatStringEntrySingletons.OBJECT : s_formatStringEntrySingletons.ARRAY;
                let tdepth = DEFAULT_EXPAND_DEPTH;
                let tlength = (dlMatch[1] === "o") ? DEFAULT_EXPAND_OBJECT_LENGTH : DEFAULT_EXPAND_ARRAY_LENGTH;

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
 * @param {string} fmtString the raw format string
 * @param {number} maxArgPos the largest arg used in the format
 * @param {Array} fmtEntryArray the array of MsgFormatEntry objects
 * @param {string} initialFormatSegment the string that we want to emit at the start of the format
 * @param {Array} tailingFormatSegmentArray the strings that we want to emit in after each format specifier
 * @param {bool} areAllSingleSlotFormatters true of all the formatters use only a single slot
 * @returns {Object} our MsgFormat object
 */
function createMsgFormat(fmtName, fmtString, maxArgPos, fmtEntryArray, initialFormatSegment, tailingFormatSegmentArray, areAllSingleSlotFormatters) {
    return {
        formatName: fmtName,
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
 * @param {string|Object} fmtString the raw format string or a JSON style format
 * @returns {Object} our MsgFormat object
 */
function extractMsgFormat(fmtName, fmtInfo) {
    let cpos = 0;

    if (typeof (fmtName) !== "string") {
        throw new FormatSyntaxError("Name needs to be a string", undefined, 0);
    }

    let fmtString = fmtInfo;
    if (typeof (fmtInfo) !== "string") {
        const typeid = typeGetIdTag(fmtInfo);
        if (typeid !== TypeNameEnum.TJsArray && typeid !== TypeNameEnum.TObject) {
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
        if (cchar !== "#" && cchar !== "$") {
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

    return createMsgFormat(fmtName, fmtString, maxArgPos, fArray, initialFormatSegment, tailingFormatSegmentArray, allBasicFormatters);
}
exports.extractMsgFormat = extractMsgFormat;
