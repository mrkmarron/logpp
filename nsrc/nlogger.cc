#include "napi.h"

#include <memory>
#include <vector>
#include <map>

///////////////////////////////////////
//Constants and globals

static bool s_utf8JSEngine = true;
static std::map<int64_t, std::shared_ptr<MsgFormat>> s_formatMap;

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

///////////////////////////////////////
//Helpers

typedef std::string JSString;

class FormatEntry
{
public:
    const FormatStringEntryKind fkind;
    const FormatStringEnum fenum;
    const JSString ffollow; //the string to put into the log after this content

    FormatEntry() :
        fkind(FormatStringEntryKind::Clear), fenum(FormatStringEnum::Clear), ffollow()
    {
        ;
    }

    FormatEntry(FormatStringEntryKind fkind, FormatStringEnum fenum, JSString&& ffollow) :
        fkind(fkind), fenum(fenum), ffollow(ffollow)
    {
        ;
    }

    FormatEntry(FormatEntry&& other) :
        fkind(other.fkind), fenum(other.fenum), ffollow(other.ffollow)
    {
        ;
    }
};

class MsgFormat
{
private:
    const int64_t m_formatId; //a unique identifier for the format
    std::vector<FormatEntry> m_fentries; //the array of FormatEntry objects
    const JSString m_initialFormatStringSegment;
    const JSString m_originalFormatString; //the origial raw format string

public:
    MsgFormat() :
        m_formatId(0), m_fentries(), m_initialFormatStringSegment(), m_originalFormatString()
    {
        ;
    }

    MsgFormat(int64_t formatId, JSString&& initialFormatStringSegment, JSString&& originalFormatString) :
        m_formatId(formatId), m_fentries(), m_initialFormatStringSegment(initialFormatStringSegment), m_originalFormatString(originalFormatString)
    {
        asdf; // move constructor;
    }
};

Napi::Value RegisterFormat(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();

    if (info.Length() != 6)
    {
        return Napi::Boolean::New(env, false);
    }

    if (!info[0].IsNumber() || !info[1].IsTypedArray() || !info[2].IsTypedArray() || !info[3].IsString() || !info[4].IsArray() || !info[5].IsString())
    {
        return Napi::Boolean::New(env, false);
    }

    //fmtId, kindArray, enumArray, initialFormatSegment, tailingFormatSegmentArray, fmtString
    int64_t fmtId = info[0].As<Napi::Number>().Int64Value();

    Napi::Uint8Array kindArray = info[1].As<Napi::Uint8Array>();
    Napi::Uint8Array enumArray = info[2].As<Napi::Uint8Array>();
    Napi::Array tailingFormatSegmentArray = info[4].As<Napi::Array>();

    size_t expectedLength = tailingFormatSegmentArray.Length();
    if (enumArray.ElementLength() != expectedLength || kindArray.ElementLength() != expectedLength)
    {
        return Napi::Boolean::New(env, false);
    }

    const uint8_t* kindArrayData = kindArray.Data();
    const uint8_t* enumArrayData = enumArray.Data();

    asdf;

    Napi::String initialFormatSegment = info[3].As<Napi::String>();
    Napi::String fmtString = info[5].As<Napi::String>();
    double arg0 = info[0].As<Napi::Number>().DoubleValue();

    double arg1 = info[1].As<Napi::Number>().DoubleValue();

    Napi::Number num = Napi::Number::New(env, arg0 + arg1);

    printf("Register Format\n");

    return env.Undefined();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    s_utf8JSEngine = true;

    exports.Set(Napi::String::New(env, "registerFormat"), Napi::Function::New(env, RegisterFormat));

    printf("Init!!!\n");

    return exports;
}


NODE_API_MODULE(nlogger, Init)
