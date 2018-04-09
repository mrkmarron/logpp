"use strict";

/*
 * Default values we expand objects and arrays
 */
const ExpandDefaults = {
    Depth: 2,
    ObjectLength: 1024,
    ArrayLength: 128
};
exports.ExpandDefaults = ExpandDefaults;

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

    TypeCount: 12
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
function getTypeNameEnum(value) {
    return TypeNameToFlagEnum[toString.call(value)] || TypeNameEnum.TUnknown;
}
exports.getTypeNameEnum = getTypeNameEnum;
