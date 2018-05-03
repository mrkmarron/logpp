#include "napi.h"

#include "common.h"

#include "environment.h"
#include "format.h"
#include "formatter.h"

static std::unique_ptr<LoggingEnvironment> s_environment = nullptr;

Napi::Value RegisterFormat(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();

    if (s_environment == nullptr)
    {
        Napi::TypeError::New(env, "Logging Environment is not initialized").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    if (info.Length() != 6)
    {
        Napi::TypeError::New(env, "Wrong argument count (expected 6)").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    if (!info[0].IsNumber() || !info[1].IsTypedArray() || !info[2].IsTypedArray() || !info[3].IsString() || !info[4].IsArray() || !info[5].IsString())
    {
        Napi::TypeError::New(env, "Wrong argument types").ThrowAsJavaScriptException();
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
        Napi::TypeError::New(env, "Error in format entry lengths").ThrowAsJavaScriptException();
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
            Napi::TypeError::New(env, "Error in format entry types").ThrowAsJavaScriptException();
            return env.Undefined();
        }

        FormatStringEntryKind fkind = static_cast<FormatStringEntryKind>(kindArrayData[i]);
        FormatStringEnum fenum = static_cast<FormatStringEnum>(enumArrayData[i]);
        Napi::String tailingSegment = argv.As<Napi::String>();

        msgf->AddFormat(FormatEntry(fkind, fenum, tailingSegment.Utf8Value()));
    }

    s_environment->AddFormat(fmtId, msgf);

    return env.Undefined();
}

//We load the JS data into this for later processing
class LogProcessingBlock
{
private:
    std::vector<LogEntryTag> m_tags;
    std::vector<double> m_data;
    std::map<int32_t, std::string> m_stringData;

    std::vector<LogEntryTag>::const_iterator m_cposTag;
    std::vector<double>::const_iterator m_cposData;

    LogEntryTag getCurrentTag() const { return *this->m_cposTag; }

    bool getCurrentDataAsBool() const { return static_cast<bool>(*this->m_cposData); }
    int64_t getCurrentDataAsInt() const { return static_cast<int64_t>(*this->m_cposData); }
    double getCurrentDataAsFloat() const { return *this->m_cposData; }

    LoggingLevel getCurrentDataAsLoggingLevel() const { return static_cast<LoggingLevel>(static_cast<uint32_t>(*this->m_cposData)); }
    time_t getCurrentDataAsTime() const { return static_cast<time_t>(*this->m_cposData); }

    const std::string& getCurrentDataAsString() const 
    {
        int32_t sidx = static_cast<int32_t>(*this->m_cposData);
        return this->m_stringData.at(sidx); 
    }

    void advancePos()
    {
        this->m_cposTag++; 
        this->m_cposData++;
    }

    bool hasMoreEntries() const
    {
        return this->m_cposTag != this->m_tags.end();
    }

    void emitVarTagEntry(Formatter& formatter, LogEntryTag tag)
    {
        switch (tag)
        {
        case LogEntryTag::JsVarValue_Undefined:
            formatter.emitLiteralString("undefined");
            break;
        case LogEntryTag::JsVarValue_Null:
            formatter.emitLiteralString("null");
            break;
        case LogEntryTag::JsVarValue_Bool:
            formatter.emitLiteralString(this->getCurrentDataAsBool() ? "true" : "false");
            break;
        case LogEntryTag::JsVarValue_Number:
            formatter.emitJsNumber(this->getCurrentDataAsFloat());
            break;
        case LogEntryTag::JsVarValue_StringIdx:
            formatter.emitJsString(this->getCurrentDataAsString());
            break;
        case LogEntryTag::JsVarValue_Date:
            formatter.emitJsDate(this->getCurrentDataAsTime(), FormatStringEnum::DATEISO, true);
            break;
        default:
            formatter.emitSpecialTag(tag);
            break;
        }
    }

    void emitStructuredEntry(Formatter& formatter)
    {
        std::stack<std::pair<char, bool>> processingStack;
        processingStack.push(std::make_pair<char, bool>(this->getCurrentTag() == LogEntryTag::LParen ? '{' : '[', true));

        formatter.emitLiteralChar(processingStack.top().first);
        this->advancePos();

        while (!processingStack.empty())
        {
            std::pair<char, bool>& cs = processingStack.top();
            LogEntryTag tag = this->getCurrentTag();

            if (cs.second)
            {
                cs.second = false;
            }
            else
            {
                if (tag != LogEntryTag::RParen && tag != LogEntryTag::RBrack)
                {
                    formatter.emitLiteralString(", ");
                }
            }

            if (tag == LogEntryTag::PropertyRecord)
            {
                formatter.emitJsString(this->getCurrentDataAsString());
                formatter.emitLiteralString(": ");
                this->advancePos();

                cs.second = true;
            }
            else if (tag == LogEntryTag::LParen || tag == LogEntryTag::LBrack)
            {
                this->emitStructuredEntry(formatter);
                //pos advanced in call
            }
            else if (tag == LogEntryTag::RParen || tag == LogEntryTag::RBrack)
            {
                formatter.emitLiteralChar(tag == LogEntryTag::RParen ? '}' : ']');
                this->advancePos();
                processingStack.pop();
            }
            else
            {
                this->emitVarTagEntry(formatter, tag);
                this->advancePos();
            }
        }
    }

public:
    LogProcessingBlock(size_t sizehint) :
        m_tags(), m_data(), m_stringData()
    {
        this->m_tags.reserve(sizehint);
        this->m_data.reserve(sizehint);
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

        int32_t key = static_cast<int32_t>(data);
        auto iter = this->m_stringData.lower_bound(key);

        if (iter == this->m_stringData.end() || iter->first != key)
        {
            this->m_stringData.emplace_hint(iter, key, std::forward<std::string>(string.Utf8Value()));
        }
    }

    void emitFormatEntry(Formatter& formatter, bool emitstdprefix)
    {
        const std::shared_ptr<MsgFormat> fmt = s_formats[this->getCurrentDataAsInt()];
        this->advancePos();

        if (!emitstdprefix)
        {
            this->advancePos();
            this->advancePos();
            this->advancePos();
        }
        else
        {
            formatter.emitLiteralString(s_loggingLevelToNames.at(this->getCurrentDataAsLoggingLevel()));
            this->advancePos();
            formatter.emitLiteralChar('#');

            formatter.emitLiteralString(s_enabledCategories[this->getCurrentDataAsInt()].second);
            this->advancePos();

            formatter.emitLiteralString(" @ ");
            formatter.emitJsDate(this->getCurrentDataAsTime(), FormatStringEnum::DATEISO, false);
            this->advancePos();

            formatter.emitLiteralString(" -- ");
        }

        formatter.emitLiteralString(fmt->getInitialFormatStringSegment());

        const std::vector<FormatEntry>& formatArray = fmt->getEntries();
        for (size_t formatIndex = 0; formatIndex < formatArray.size(); formatIndex++)
        {
            const FormatEntry& fentry = formatArray[formatIndex];
            
            if (fentry.fkind == FormatStringEntryKind::Literal)
            {
                formatter.emitLiteralChar(fentry.fenum == FormatStringEnum::HASH ? '#' : '%');
            }
            else if (fentry.fkind == FormatStringEntryKind::Expando) {
                bool advanceData = true;

                switch (fentry.fenum)
                {
                case FormatStringEnum::HOST:
                    advanceData = false;
                    formatter.emitJsString(s_hostName);
                    break;
                case FormatStringEnum::APP:
                    advanceData = false;
                    formatter.emitJsString(s_appName);
                    break;
                case FormatStringEnum::MODULE:
                    formatter.emitJsString(this->getCurrentDataAsString());
                    break;
                case FormatStringEnum::SOURCE:
                    formatter.emitCallStack(this->getCurrentDataAsString());
                    break;
                case FormatStringEnum::WALLCLOCK:
                    formatter.emitJsDate(this->getCurrentDataAsTime(), FormatStringEnum::DATEISO, true);
                    break;
                case FormatStringEnum::TIMESTAMP:
                case FormatStringEnum::CALLBACK:
                case FormatStringEnum::REQUEST:
                    formatter.emitJsInt(this->getCurrentDataAsInt());
                    break;
                default:
                    formatter.emitSpecialTag(LogEntryTag::JsBadFormatVar);
                    break;
                }

                if (advanceData)
                {
                    this->advancePos();
                }
            }
            else
            {
                const LogEntryTag tag = this->getCurrentTag();

                if (tag == LogEntryTag::JsBadFormatVar)
                {
                    formatter.emitSpecialTag(tag);
                    this->advancePos();
                }
                else if (tag == LogEntryTag::LParen || tag == LogEntryTag::LBrack)
                {
                    this->emitStructuredEntry(formatter);
                    //position is advanced in call
                }
                else
                {
                    switch (fentry.fenum) {
                    case FormatStringEnum::BOOL:
                        formatter.emitLiteralString(this->getCurrentDataAsBool() ? "true" : "false");
                        break;
                    case FormatStringEnum::NUMBER:
                        formatter.emitJsNumber(this->getCurrentDataAsFloat());
                        break;
                    case FormatStringEnum::STRING:
                        formatter.emitJsString(this->getCurrentDataAsString());
                        break;
                    case FormatStringEnum::DATEISO:
                    case FormatStringEnum::DATEUTC:
                    case FormatStringEnum::DATELOCAL:
                        formatter.emitJsDate(this->getCurrentDataAsTime(), fentry.fenum, true);
                        break;
                    default:
                        this->emitVarTagEntry(formatter, tag);
                        break;
                    }

                    this->advancePos();
                }
            }

            formatter.emitLiteralString(fentry.ffollow);
        }
        formatter.emitLiteralChar('\n');

        this->advancePos();
    }

    void emitAllFormatEntries(Formatter& formatter, bool emitstdprefix)
    {
        this->m_cposTag = this->m_tags.cbegin();
        this->m_cposData = this->m_data.cbegin();

        while (this->hasMoreEntries())
        {
            this->emitFormatEntry(formatter, emitstdprefix);
        }
    }
};

bool MsgTimeExpired(size_t cpos, const double* data)
{
    std::time_t now = std::time(nullptr); //depnds on system time being uint64 convertable

    return static_cast<int64_t>(data[cpos + 3]) + s_msgTimeLimit < now;
}

bool MsgOverSizeLimit(size_t msgCount)
{
    return msgCount > s_msgCountLimit;
}

bool ShouldDiscard(size_t cpos, const double* data)
{
    const LoggingLevel level = static_cast<LoggingLevel>(static_cast<uint32_t>(data[cpos + 1]));
    if (!LOG_LEVEL_ENABLED(level))
    {
        return true;
    }

    const size_t category = static_cast<size_t>(data[cpos + 2]);
    if (category >= s_enabledCategories.size() || !s_enabledCategories[category].first)
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
            Napi::Value sval = stringData[static_cast<size_t>(data[cpos])];
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

static std::vector<LogProcessingBlock> s_processing;
static char s_processPending = 'n';

Napi::Value ProcessMsgs(const Napi::CallbackInfo& info)
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
    Napi::Float64Array dataArray = inmemblock.Get("data").As<Napi::Float64Array>();
    if (tagArray.ElementLength() < epos || dataArray.ElementLength() < epos || epos < cpos)
    {
        Napi::TypeError::New(env, "Bad lengths for block segment").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    
    const uint8_t* tags = tagArray.Data();
    const double* data = dataArray.Data();

    const Napi::Array stringData = inmemblock.Get("stringData").As<Napi::Array>();

    if (info[1].As<Napi::Boolean>().Value())
    {
        size_t sizehint = std::max(static_cast<int32_t>(((epos - cpos) * 3) / 2), INIT_LOG_BLOCK_SIZE);
        s_processing.push_back(LogProcessingBlock(sizehint));
    }
    LogProcessingBlock& into = s_processing.back(); 

    while (cpos < epos)
    {
        //check time and # of slots in use
        if (!forceall && !MsgTimeExpired(cpos, data) && !MsgOverSizeLimit(msgCount))
        {
            inmemblock.Set("spos", Napi::Number::New(env, static_cast<double>(cpos)));
            return Napi::Boolean::New(env, false);
        }

        size_t oldcpos = cpos;
        bool msgcomplete = true;
        if ((s_processPending == 'n' && ShouldDiscard(cpos, data)) || s_processPending == 'd')
        {
            s_processPending = 'd';
            msgcomplete = ProcessDiscardEntry(cpos, epos, tags);
        }
        else
        {
            s_processPending = 's';
            msgcomplete = ProcessSaveEntry(into, cpos, epos, tags, data, stringData);
        }
        msgCount -= static_cast<int32_t>(epos - cpos);

        if (msgcomplete)
        {
            s_processPending = 'n';
        }
        else
        {
            inmemblock.Set("spos", Napi::Number::New(env, static_cast<double>(cpos)));
            return Napi::Boolean::New(env, true);
        }
    }

    inmemblock.Set("spos", Napi::Number::New(env, static_cast<double>(cpos)));
    return Napi::Boolean::New(env, false);
}

Napi::Value FormatMsgsSync(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    if (info.Length() != 1 || !info[0].IsBoolean())
    {
        Napi::TypeError::New(env, "Wrong arguments").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    bool emitstdprefix = info[0].As<Napi::Boolean>().Value();

    Formatter formatter;
    for (auto iter = s_processing.begin(); iter != s_processing.end(); iter++)
    {
        iter->emitAllFormatEntries(formatter, emitstdprefix);
    }
    s_processing.clear();

    return Napi::String::New(env, formatter.getOutputBuffer());
}

class FormatWorker : public Napi::AsyncWorker
{
private:

public:

    FormatWorker(Napi::Function& callback) :
        Napi::AsyncWorker(callback)
    {
        ;
    }

    virtual ~FormatWorker() 
    {
        ;
    }


    void Execute()
    {
        // Executed inside the worker-thread.
        // It is not safe to access JS engine data structure
        // here, so everything we need for input and output
        // should go on `this`.
    }

    void OnOK()
    {
        /*
        // Executed when the async work is complete
        // this function will be run inside the main event loop
        // so it is safe to use JS engine data again

        Napi::HandleScope scope(Env());
        Callback().Call({ Env().Undefined(), Napi::Number::New(Env(), estimate) });
        */
    }
};

Napi::Value FormatMsgsAsync(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    /*
    Napi::Function callback = info[1].As<Napi::Function>();

    PiWorker* piWorker = new PiWorker(callback, points);

    piWorker->Queue();

    return info.Env().Undefined();
    */
    return env.Undefined();
}

Napi::Value SetEnvironmentInfo(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    if (info.Length() != 2 || !info[0].IsString() || !info[1].IsString())
    {
        return env.Undefined();
    }

    s_hostName = info[0].As<Napi::String>().Utf8Value();
    s_appName = info[1].As<Napi::String>().Utf8Value();

    return env.Undefined();
}

static bool s_firstLoad = true;
Napi::Object Init(Napi::Env env, Napi::Object exports) {
    if (s_firstLoad)
    {
        s_firstLoad = false;

        s_enabledCategories.push_back(std::make_pair(false, "_invalid_")); //0 is not usable since we do -i indexing
        s_enabledCategories.push_back(std::make_pair(true, "$default")); //$default is enabled by default

        //
        //TODO: set level, enable/disable categories
        //

        s_hostName = "localhost";
        s_appName = "[not-set]";

        //setup logging levels names
        s_loggingLevelToNames[LoggingLevel::LLOFF] = std::string("OFF");
        s_loggingLevelToNames[LoggingLevel::LLFATAL] = std::string("FATAL");
        s_loggingLevelToNames[LoggingLevel::LLERROR] = std::string("ERROR");
        s_loggingLevelToNames[LoggingLevel::LLWARN] = std::string("WARN");
        s_loggingLevelToNames[LoggingLevel::LLINFO] = std::string("INFO");
        s_loggingLevelToNames[LoggingLevel::LLDETAIL] = std::string("DETAIL");
        s_loggingLevelToNames[LoggingLevel::LLDEBUG] = std::string("DEBUG");
        s_loggingLevelToNames[LoggingLevel::LLTRACE] = std::string("TRACE");
        s_loggingLevelToNames[LoggingLevel::LLOFF] = std::string("OFF");
    }

    exports.Set(Napi::String::New(env, "registerFormat"), Napi::Function::New(env, RegisterFormat));

    exports.Set(Napi::String::New(env, "processMsgsForEmit"), Napi::Function::New(env, ProcessMsgs));

    exports.Set(Napi::String::New(env, "formatMsgsSync"), Napi::Function::New(env, FormatMsgsSync));

    exports.Set(Napi::String::New(env, "setEnvironmentInfo"), Napi::Function::New(env, SetEnvironmentInfo));

    return exports;
}

NODE_API_MODULE(nlogger, Init)
