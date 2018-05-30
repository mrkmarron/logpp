#pragma once 

#include "napi.h"

#include <cstdint>

#include <time.h>
#include <cmath>
#include <numeric>

#include <sstream>
#include <iomanip>

#include <algorithm>

#include <memory>
#include <vector>
#include <stack>
#include <map>

enum class FormatStringEntryKind : uint8_t
{
    Clear = 0x0,
    Literal = 0x1,
    Expando = 0x2,
    Basic = 0x3,
    Compound = 0x4
};

enum class FormatStringEnum : uint8_t
{
    Clear = 0x0,
    HASH = 0x1,
    HOST = 0x2,
    APP = 0x3,
    LOGGER = 0x4,
    SOURCE = 0x5,
    WALLCLOCK = 0x6,
    TIMESTAMP = 0x7,
    CALLBACK = 0x8,
    REQUEST = 0x9,

    PERCENT = 0x11,
    BOOL = 0x12,
    NUMBER = 0x13,
    STRING = 0x14,
    DATEISO = 0x15,
    DATELOCAL = 0x16,
    GENERAL = 0x17
};

enum class LogEntryTag : uint8_t
{
    Clear = 0x0,
    MsgFormat = 0x1,
    MsgLevel = 0x2,
    MsgCategory = 0x3,
    MsgWallTime = 0x4,
    MSGLogger = 0x5,
    MSGChildInfo = 0x6,
    MsgEndSentinal = 0x7,
    LParen = 0x8,
    RParen = 0x9,
    LBrack = 0xA,
    RBrack = 0xB,

    JsVarValue_Undefined = 0x11,
    JsVarValue_Null = 0x12,
    JsVarValue_Bool = 0x13,
    JsVarValue_Number = 0x14,
    JsVarValue_StringIdx = 0x15,
    JsVarValue_Date = 0x16,

    PropertyRecord = 0x21,
    JsBadFormatVar = 0x22,
    JsVarValue = 0x23,
    CycleValue = 0x24,
    OpaqueValue = 0x25,
    DepthBoundObject = 0x26,
    LengthBoundObject = 0x27,
    DepthBoundArray = 0x28,
    LengthBoundArray = 0x29
};

enum class LoggingLevel :uint32_t
{
    LLOFF = 0x0,
    LLFATAL = 0x1,
    LLERROR = 0x3,
    LLWARN = 0x7,
    LLINFO = 0xF,
    LLDETAIL = 0x1F,
    LLDEBUG = 0x3F,
    LLTRACE = 0x7F,
    LLALL = 0xFF
};
#define LOG_LEVEL_ENABLED(level, enabledLevel) ((static_cast<uint32_t>(level) & static_cast<uint32_t>(enabledLevel)) == static_cast<uint32_t>(level))

//Defaults for block flushing are over 0.5s or more than 4096 entries used
#define DEFAULT_LOG_TIMELIMIT 500
#define DEFAULT_LOG_SLOTSUSED 4096

#define INIT_LOG_BLOCK_SIZE 64
