#include "napi.h"

#include <time.h>
#include <numeric>

#include <sstream>
#include <iomanip>

#include <memory>
#include <vector>
#include <deque>
#include <map>

///////////////////////////////////////
//Constants

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
    MODULE = 0x4,
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
    DATEUTC = 0x16,
    DATELOCAL = 0x17,
    GENERAL = 0x18,
    OBJECT = 0x19,
    ARRAY = 0x1A
};

enum class LogEntryTag : uint8_t
{
    Clear = 0x0,
    MsgFormat = 0x1,
    MsgLevel = 0x2,
    MsgCategory = 0x3,
    MsgWallTime = 0x4,
    MsgEndSentinal = 0x5,
    LParen = 0x6,
    RParen = 0x7,
    LBrack = 0x8,
    RBrack = 0x9,

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

//Keep track of which logging level is enabled
static LoggingLevel s_enabledLoggingLevel = LoggingLevel::LLINFO;

//Keep track of which categories are enabled
static std::vector<bool> s_enabledCategories;

#define LOG_LEVEL_ENABLED(level) ((static_cast<uint32_t>(level) & static_cast<uint32_t>(s_enabledLoggingLevel)) == static_cast<uint32_t>(level))

///////////////////////////////////////
//Helpers

typedef std::string JSString;

class FormatEntry
{
public:
    const FormatStringEntryKind fkind;
    const FormatStringEnum fenum;
    JSString ffollow; //the string to put into the log after this content

    FormatEntry() :
        fkind(FormatStringEntryKind::Clear), fenum(FormatStringEnum::Clear), ffollow()
    {
        ;
    }

    FormatEntry(FormatStringEntryKind fkind, FormatStringEnum fenum, JSString&& ffollow) :
        fkind(fkind), fenum(fenum), ffollow(std::forward<JSString>(ffollow))
    {
        ;
    }

    FormatEntry(FormatEntry&& other) :
        fkind(other.fkind), fenum(other.fenum), ffollow(std::forward<JSString>(other.ffollow))
    {
        ;
    }
};

class MsgFormat
{
private:
    const int64_t m_formatId; //a unique identifier for the format
    std::vector<FormatEntry> m_fentries; //the array of FormatEntry objects
    JSString m_initialFormatStringSegment;
    JSString m_originalFormatString; //the origial raw format string

public:
    MsgFormat() :
        m_formatId(0), m_fentries(), m_initialFormatStringSegment(), m_originalFormatString()
    {
        ;
    }

    MsgFormat(int64_t formatId, size_t entryCount, JSString&& initialFormatStringSegment, JSString&& originalFormatString) :
        m_formatId(formatId), m_fentries(),
        m_initialFormatStringSegment(std::forward<JSString>(initialFormatStringSegment)),
        m_originalFormatString(std::forward<JSString>(originalFormatString))
    {
        this->m_fentries.reserve(entryCount);
    }

    void AddFormat(FormatEntry&& entry)
    {
        this->m_fentries.emplace_back(std::forward<FormatEntry>(entry));
    }
};

static std::vector<std::shared_ptr<MsgFormat>> s_formats;

Napi::Value RegisterFormat(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();

    if (info.Length() != 6)
    {
        Napi::TypeError::New(env, "Wrong arguments").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    if (!info[0].IsNumber() || !info[1].IsTypedArray() || !info[2].IsTypedArray() || !info[3].IsString() || !info[4].IsArray() || !info[5].IsString())
    {
        Napi::TypeError::New(env, "Wrong arguments").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    //fmtId, kindArray, enumArray, initialFormatSegment, tailingFormatSegmentArray, fmtString
    int64_t fmtId = info[0].As<Napi::Number>().Int64Value();
    Napi::String initialFormatSegment = info[3].As<Napi::String>();
    Napi::String fmtString = info[5].As<Napi::String>();

    Napi::Uint8Array kindArray = info[1].As<Napi::Uint8Array>();
    Napi::Uint8Array enumArray = info[2].As<Napi::Uint8Array>();
    Napi::Array tailingFormatSegmentArray = info[4].As<Napi::Array>();

    size_t expectedLength = tailingFormatSegmentArray.Length();
    if (enumArray.ElementLength() != expectedLength || kindArray.ElementLength() != expectedLength)
    {
        Napi::TypeError::New(env, "Wrong arguments").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    std::shared_ptr<MsgFormat> msgf = std::make_shared<MsgFormat>(fmtId, expectedLength, initialFormatSegment.Utf8Value(), fmtString.Utf8Value());

    const uint8_t* kindArrayData = kindArray.Data();
    const uint8_t* enumArrayData = enumArray.Data();

    for (size_t i = 0; i < expectedLength; ++i)
    {
        Napi::Value argv = tailingFormatSegmentArray[i];
        if (!argv.IsString())
        {
            Napi::TypeError::New(env, "Wrong arguments").ThrowAsJavaScriptException();
            return env.Undefined();
        }

        FormatStringEntryKind fkind = static_cast<FormatStringEntryKind>(kindArrayData[i]);
        FormatStringEnum fenum = static_cast<FormatStringEnum>(enumArrayData[i]);
        Napi::String tailingSegment = argv.As<Napi::String>();

        msgf->AddFormat(FormatEntry(fkind, fenum, tailingSegment.Utf8Value()));
    }

    s_formats.push_back(msgf);

    return env.Undefined();
}

//This class controls the formatting
class Formatter
{
private:
    std::ostringstream m_output;

public:
    std::string getOutputBuffer() const { return this->m_output.str(); }
    void reset() { this->m_output.clear(); }

    void emitLiteralChar(char c)
    {
        this->m_output << c;
    }

    void emitLiteralString(const char* str)
    {
        this->m_output << str;
    }

    void emitJsString(const std::string& str)
    {
        for (auto c = str.cbegin(); c != str.cend(); c++) {
            switch (*c) {
            case '"':
                this->m_output << "\\\"";
                break;
            case '\\':
                this->m_output << "\\\\";
                break;
            case '\b':
                this->m_output << "\\b";
                break;
            case '\f':
                this->m_output << "\\f";
                break;
            case '\n':
                this->m_output << "\\n";
                break;
            case '\r':
                this->m_output << "\\r";
                break;
            case '\t':
                this->m_output << "\\t";
                break;
            default:
                if ('\x00' <= *c && *c <= '\x1f')
                {
                    this->m_output << "\\u" << std::hex << std::setw(4) << std::setfill('0') << (int)*c;
                }
                else
                {
                    this->m_output << *c;
                }
            }
        }
    }

    void emitJsNumber(double val)
    {
        if (std::isnan(val))
        {
            this->emitLiteralString("null");
        }
        else if (val == std::numeric_limits<double>::infinity())
        {
            this->emitLiteralString("null");
        }
        else if (val == -std::numeric_limits<double>::infinity())
        {
            this->emitLiteralString("null");
        }
        else if (floor(val) == val)
        {
            this->m_output << static_cast<int64_t>(val);
        }
        else
        {
            this->m_output << val;
        }
    }

    void emitJsDate(uint64_t dval, FormatStringEnum fmt)
    {
        if (fmt == FormatStringEnum::DATEUTC)
        {
            asdf;
        }
        else if (fmt == FormatStringEnum::DATELOCAL)
        {
            asdf;
        }
        else
        {
            //ISO
            asdf;
        }
    }

    void emitCallStack(const std::string& cstack)
    {
        this->emitJsString(cstack);
    }

    void emitSpecialTag(LogEntryTag tag)
    {
        switch (tag)
        {
        case LogEntryTag::JsBadFormatVar:
            this->emitLiteralString("\"<BadFormat>\"");
            break;
        case LogEntryTag::DepthBoundObject:
            this->emitLiteralString("\"{...}\"");
            break;
        case LogEntryTag::LengthBoundObject:
            this->emitLiteralString("\"$rest$\": \"...\"");
            break;
        case LogEntryTag::DepthBoundArray:
            this->emitLiteralString("\"[...]\"");
            break;
        case LogEntryTag::LengthBoundArray:
            this->emitLiteralString("\"...\"");
            break;
        case LogEntryTag::CycleValue:
            this->emitLiteralString("\"<Cycle>\"");
            break;
        default:
            this->emitLiteralString("\"<OpaqueValue>\"");
            break;
        }
    }
};

#define INIT_LOG_BLOCK_SIZE 64

//We load the JS data into this for later processing
class LogProcessingBlock
{
private:
    size_t m_cpos;
    std::deque<LogEntryTag> m_tags;
    std::deque<double> m_data;
    std::map<uint64_t, std::string> m_stringData;

public:
    LogProcessingBlock() :
        m_cpos(0), m_tags(), m_data(), m_stringData()
    {
        ;
    }

    void AddDataEntry(LogEntryTag tag, double data)
    {
        this->m_tags.push_back(tag);
        this->m_data.push_back(data);
    }

    void AddStringDataEntry(LogEntryTag tag, double data, Napi::String string)
    {
        this->m_tags.push_back(tag);
        this->m_data.push_back(data);

        uint64_t key = static_cast<uint64_t>(data);
        auto iter = this->m_stringData.lower_bound(key);

        if (iter == this->m_stringData.end() || iter->first != key)
        {
            this->m_stringData.emplace_hint(iter, std::forward<JSString>(string.Utf8Value()));
        }
    }
};

bool MsgTimeExpired(size_t cpos, const double* data)
{
    uint64_t now = time(nullptr); //depnds on system time being uint64 convertable
    
    return static_cast<uint64_t>(data[cpos + 3]) + s_msgTimeLimit < now;
}

bool MsgOverSizeLimit(size_t msgCount)
{
    return msgCount > s_msgCountLimit;
}

bool ShouldDiscard(size_t cpos, const double* data)
{
    const LoggingLevel level = static_cast<LoggingLevel>(data[cpos + 1]);
    if (!LOG_LEVEL_ENABLED(level))
    {
        return true;
    }

    const size_t category = static_cast<size_t>(data[cpos + 2]);
    if (category >= s_enabledCategories.size() || !s_enabledCategories[category])
    {
        return true;
    }

    return false;
}

bool ProcessDiscardEntry(size_t& cpos, size_t epos, const uint8_t* tags)
{
    while (cpos < epos && tags[cpos] != static_cast<uint8_t>(LogEntryTag::MsgEndSentinal))
    {
        cpos++;
    }

    if (cpos == epos)
    {
        return false;
    }
    else
    {
        cpos++;

        return true;
    }
}

bool ProcessSaveEntry(LogProcessingBlock& into, size_t& cpos, size_t epos, const uint8_t* tags, const double* data, const Napi::Array stringData)
{
    while (cpos < epos && tags[cpos] != static_cast<uint8_t>(LogEntryTag::MsgEndSentinal))
    {
        const LogEntryTag ttag = static_cast<LogEntryTag>(tags[cpos]);
        if (ttag != LogEntryTag::JsVarValue_StringIdx && ttag != LogEntryTag::PropertyRecord)
        {
            into.AddDataEntry(ttag, data[cpos]);
        }
        else
        {
            Napi::Value sval = stringData[static_cast<uint64_t>(data[cpos])];
            into.AddStringDataEntry(ttag, data[cpos], sval.As<Napi::String>());
        }

        cpos++;
    }

    if (cpos == epos)
    {
        return false;
    }
    else
    {
        cpos++;
        into.AddDataEntry(LogEntryTag::MsgEndSentinal, 0.0);

        return true;
    }
}

static size_t s_msgTimeLimit = 1000;
static size_t s_msgCountLimit = 4096;
static std::vector<LogProcessingBlock> s_processing;

bool ProcessMsgs(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    if (info.Length() != 4 || !info[0].IsObject() || !info[1].IsBoolean() || !info[2].IsNumber() || !info[3].IsBoolean())
    {
        Napi::TypeError::New(env, "Wrong arguments").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    int32_t msgCount = info[2].As<Napi::Number>().Int32Value();
    bool forceall = info[3].As<Napi::Boolean>().Value();

    Napi::Object inmemblock = info[0].As<Napi::Object>();
    const size_t epos = inmemblock.Get("epos").As<Napi::Number>().Int64Value(); 
    size_t cpos = inmemblock.Get("spos").As<Napi::Number>().Int64Value();

    Napi::Uint8Array tagArray = inmemblock.Get("tags").As<Napi::Uint8Array>();
    Napi::Float64Array dataArray = inmemblock.Get("fata").As<Napi::Float64Array>();
    if (tagArray.ElementLength() < epos || dataArray.ElementLength() < epos || epos < cpos)
    {
        Napi::TypeError::New(env, "Bad lengths for block segment").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    
    const uint8_t* tags = tagArray.Data();
    const double* data = dataArray.Data();

    const Napi::Array stringData = inmemblock.Get("stringData").As<Napi::Array>();

    if (!info[1].As<Napi::Boolean>().Value())
    {
        s_processing.push_back(LogProcessingBlock());
    }

    LogProcessingBlock& into = s_processing.back(); 

    while (cpos < epos)
    {
        //check time and # of slots in use
        if (!forceall && !MsgTimeExpired(cpos, data) && !MsgOverSizeLimit(msgCount))
        {
            inmemblock.Set("spos", Napi::Number::New(env, cpos));
            return Napi::Boolean::New(env, false);
        }

        size_t oldcpos = cpos;
        bool msgcomplete = true;
        if (ShouldDiscard(cpos, data))
        {
            msgcomplete = ProcessDiscardEntry(cpos, epos, tags);
        }
        else
        {
            msgcomplete = ProcessSaveEntry(into, cpos, epos, tags, data, stringData);
        }
        msgCount -= static_cast<int32_t>(epos - cpos);

        if (!msgcomplete)
        {
            inmemblock.Set("spos", Napi::Number::New(env, cpos));
            return Napi::Boolean::New(env, true);
        }
    }

    inmemblock.Set("spos", Napi::Number::New(env, cpos));
    return Napi::Boolean::New(env, false);
}


Napi::Object Init(Napi::Env env, Napi::Object exports) {
    s_enabledCategories.push_back(false); //0 is not usable since we do -i indexing
    s_enabledCategories.push_back(true); //$default is enabled by default

    //
    //TODO: set level, enable/disable categories
    //

    exports.Set(Napi::String::New(env, "registerFormat"), Napi::Function::New(env, RegisterFormat));

    exports.Set(Napi::String::New(env, "processMsgsForEmit"), Napi::Function::New(env, ProcessMsgs));

    return exports;
}

NODE_API_MODULE(nlogger, Init)
