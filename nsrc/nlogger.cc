#include "napi.h"

#include <memory>
#include <vector>
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

enum class LogEntryTags : uint8_t
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

#define INIT_LOG_BLOCK_SIZE 64
#define LOAD_INT64_DATA(THIS, i) static_cast<uint64_t>((THIS)->m_data[i])
#define LOAD_STRINGIDX_DATA(THIS, i) static_cast<uint64_t>((THIS)->m_data[i])
#define LOAD_DOUBLE_DATA(THIS, i) ((THIS)->m_data[i])

//We load the JS data into this for later processing
class LogProcessingBlock
{
private:
    size_t m_cpos;
    std::vector<LogEntryTags> m_tags;
    std::vector<double> m_data;
    std::map<uint64_t, std::string> m_stringData;

public:
    LogProcessingBlock() :
        m_cpos(0), m_tags(), m_data(), m_stringData()
    {
        this->m_tags.reserve(INIT_LOG_BLOCK_SIZE);
        this->m_data.reserve(INIT_LOG_BLOCK_SIZE);
    }

    void AddDataEntry(uint8_t tag, double data)
    {
        this->m_tags.push_back(static_cast<LogEntryTags>(tag));
        this->m_data.push_back(data);
    }

    void AddStringDataEntry(uint8_t tag, double data, Napi::String string)
    {
        this->m_tags.push_back(static_cast<LogEntryTags>(tag));
        this->m_data.push_back(data);

        uint64_t key = static_cast<uint64_t>(data);
        auto iter = this->m_stringData.lower_bound(key);

        if (iter == this->m_stringData.end() || iter->first != key)
        {
            this->m_stringData.emplace_hint(iter, std::forward<JSString>(string.Utf8Value()));
        }
    }
};

bool ProcessDiscardEntry(size_t& cpos, size_t epos, const uint8_t* tags)
{
    while (cpos < epos && tags[cpos] != static_cast<uint8_t>(LogEntryTags::MsgEndSentinal))
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
    while (cpos < epos && tags[cpos] != static_cast<uint8_t>(LogEntryTags::MsgEndSentinal))
    {
        asdf;

        cpos++;
    }

    if (cpos == epos)
    {
        return false;
    }
    else
    {
        cpos++;
        into.AddDataEntry(static_cast<uint8_t>(LogEntryTags::MsgEndSentinal), 0.0);

        return true;
    }
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "registerFormat"), Napi::Function::New(env, RegisterFormat));

    printf("Init!!!\n");

    return exports;
}

NODE_API_MODULE(nlogger, Init)
