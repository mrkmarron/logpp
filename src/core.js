"use strict";

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
//SingletonFormatStringEntry_IP 0x12
//SingletonFormatStringEntry_APP 0x13
//SingletonFormatStringEntry_MODULE 0x14
//SingletonFormatStringEntry_SOURCE 0x15
//SingletonFormatStringEntry_WALLCLOCK 0x16
//SingletonFormatStringEntry_TIMESTAMP 0x17
//SingletonFormatStringEntry_CALLBACK 0x18
//SingletonFormatStringEntry_REQUEST 0x19

//SingletonFormatStringEntry_DOLLAR 0x21
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
exports.getTypeNameEnum = getTypeNameEnum;

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
//LogEntryTags_MsgWallTime 0x10
