"use strict";

////
//Valid expandos are:
//#ip_addr      -- ip address of the host
//#app_name     -- name of the root app
//#module_name  -- name of the module
//#msg_name     -- name of the msg (what it was registered with)
//#wall_time    -- wallclock timestamp
//#logical_time -- logical timestamp
//#callback_id  -- the current callback id
//#request_id   -- the current request id (for http requests)
//##            -- a literal #
////

////
//Valid format specifiers are:
//${p:b} -- a boolean value
//${p:n} -- a number
//${p:s} -- a string
//${p:d-xxx} -- a data formatted as iso, utc, or local
//${p:o<d,l>} -- an object expanded up to d levels (default is 2) at most l items in any level (default is * for objects 128 for arrays)
//${p:a<d,l>} -- an array expanded up to d levels (default is 2) at most l items in any level (default is * for objects 128 for arrays)
//${p:g} -- general value (general format applied -- no array expansion, object depth of 2)
//$$ -- a literal $
////

//Default values we expand objects and arrays to
const DEFAULT_EXPAND_DEPTH = 2;
const DEFAULT_EXPAND_OBJECT_LENGTH = 1024;
const DEFAULT_EXPAND_ARRAY_LENGTH = 128;

/////////////////////////////
//Generally useful code
const TypeNameEnum_Undefined = 1;
const TypeNameEnum_Null = 2;
const TypeNameEnum_Boolean = 3;
const TypeNameEnum_Number = 4;

const TypeNameEnum_String = 5;
const TypeNameEnum_Date = 6;
const TypeNameEnum_Function = 7;

const TypeNameEnum_Object = 8;
const TypeNameEnum_JsArray = 9;
const TypeNameEnum_TypedArray = 10;

const TypeNameEnum_Unknown = 11;
const TypeNameEnum_Limit = 12;

////
//Useful cutoffs for TypeNameEnums
const TypeNameEnum_LastPrimitiveType = TypeNameEnum_Number;
const TypeNameEnum_LastSimpleType = TypeNameEnum_String;

const TypeNameToFlagEnum = {
    "[object Undefined]": TypeNameEnum_Undefined,
    "[object Null]": TypeNameEnum_Null,
    "[object Boolean]": TypeNameEnum_Boolean,
    "[object Number]": TypeNameEnum_Number,
    "[object String]": TypeNameEnum_String,
    "[object Date]": TypeNameEnum_Date,
    "[object Function]": TypeNameEnum_Function,
    "[object Object]": TypeNameEnum_Object,
    "[object Array]": TypeNameEnum_JsArray,
    "[object Float32Array]": TypeNameEnum_TypedArray,
    "[object Float64Array]": TypeNameEnum_TypedArray,
    "[object Int8Array]": TypeNameEnum_TypedArray,
    "[object Int16Array]": TypeNameEnum_TypedArray,
    "[object Int32Array]": TypeNameEnum_TypedArray,
    "[object Uint8Array]": TypeNameEnum_TypedArray,
    "[object Uint16Array]": TypeNameEnum_TypedArray,
    "[object Uint32Array]": TypeNameEnum_TypedArray
};

