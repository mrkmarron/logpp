
#include "common.h"

#include "environment.h"
#include "format.h"
#include "formatter.h"
#include "processingblock.h"
#include "formatworker.h"

static LoggingEnvironment s_environment(LoggingLevel::LLOFF, "[undefined]", "[undefined]");

Napi::Value RegisterFormat(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();

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

    s_environment.AddFormat(fmtId, msgf);

    return env.Undefined();
}

Napi::Value AddCategory(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    if (info.Length() != 2 || !info[0].IsNumber() || !info[1].IsString() || info[0].As<Napi::Number>().Int64Value() < 0)
    {
        return env.Undefined();
    }

    s_environment.AddCategory(info[0].As<Napi::Number>().Int64Value(), info[1].As<Napi::String>().Utf8Value());
    return env.Undefined();
}

Napi::Value GetEmitLevel(const Napi::CallbackInfo& info)
{
    return Napi::Number::New(info.Env(), static_cast<uint32_t>(s_environment.GetEnabledLoggingLevel()));
}

Napi::Value SetEmitLevel(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    if (info.Length() != 1 || !info[0].IsNumber() || info[0].As<Napi::Number>().Int32Value() < 0)
    {
        return env.Undefined();
    }

    s_environment.SetEnabledLoggingLevel(static_cast<LoggingLevel>(info[0].As<Napi::Number>().Int32Value()));
    return env.Undefined();
}

Napi::Value SetMsgTimeLimit(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    if (info.Length() != 1 || !info[0].IsNumber() || info[0].As<Napi::Number>().Int64Value() < 0)
    {
        return env.Undefined();
    }

    s_environment.SetMsgSlotsLimit(info[0].As<Napi::Number>().Int64Value());
    return env.Undefined();
}

Napi::Value SetMsgSlotLimit(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    if (info.Length() != 1 || !info[0].IsNumber() || info[0].As<Napi::Number>().Int64Value() < 0)
    {
        return env.Undefined();
    }

    s_environment.SetMsgSlotsLimit(info[0].As<Napi::Number>().Int64Value());
    return env.Undefined();
}

Napi::Value ProcessMsgs(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    if (info.Length() != 5 || !info[0].IsObject() || !info[1].IsBoolean() || !info[2].IsNumber() || !info[3].IsNumber() || !info[4].IsBoolean())
    {
        Napi::TypeError::New(env, "Wrong arguments").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    int32_t msgCount = info[2].As<Napi::Number>().Int32Value();
    std::time_t now = info[3].As<Napi::Number>().Int64Value();
    bool forceall = info[4].As<Napi::Boolean>().Value();

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

    LoggingEnvironment* lenv = &s_environment;

    if (cpos == epos) {
        return Napi::Boolean::New(env, true);
    }

    if (info[1].As<Napi::Boolean>().Value())
    {
        size_t sizehint = std::max(static_cast<int32_t>(((epos - cpos) * 3) / 2), INIT_LOG_BLOCK_SIZE);
        lenv->AddProcessingBlock(std::make_shared<LogProcessingBlock>(sizehint));
    }

    std::shared_ptr<LogProcessingBlock> into = lenv->GetActiveProcessingBlock();

    while (cpos < epos)
    {
        //check time and # of slots in use
        if (!forceall && !(LogProcessingBlock::MsgTimeExpired(cpos, data, lenv, now) || LogProcessingBlock::MsgOverSizeLimit(msgCount, lenv)))
        {
            if (into->IsEmptyBlock()) {
                lenv->DiscardProcesingBlock(into);
            }

            inmemblock.Set("spos", Napi::Number::New(env, static_cast<double>(cpos)));
            return Napi::Boolean::New(env, true);
        }

        size_t oldcpos = cpos;
        bool msgcomplete = true;
        if ((lenv->GetProcessingMode() == 'n' && LogProcessingBlock::ShouldDiscard(cpos, data, lenv)) || lenv->GetProcessingMode() == 'd')
        {
            lenv->SetProcessingMode('d');
            msgcomplete = LogProcessingBlock::ProcessDiscardEntry(cpos, epos, tags);
        }
        else
        {
            lenv->SetProcessingMode('s');
            msgcomplete = into->ProcessSaveEntry(cpos, epos, tags, data, stringData);
        }
        msgCount -= static_cast<int32_t>(epos - cpos);

        if (msgcomplete)
        {
            lenv->SetProcessingMode('n');
        }
    }

    if (into->IsEmptyBlock()) {
        lenv->DiscardProcesingBlock(into);
    }

    inmemblock.Set("spos", Napi::Number::New(env, static_cast<double>(cpos)));
    return Napi::Boolean::New(env, false);
}

Napi::Value AbortAsyncWork(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();

    if (s_environment.GetAsyncFormatWorker() != nullptr)
    {
        s_environment.AddBlockFromFormatterAbort(s_environment.GetAsyncFormatWorker()->GetProcessingBlock());
        s_environment.GetAsyncFormatWorker()->Cancel();
        s_environment.ClearAsyncFormatWorker();
    }

    return env.Undefined();
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
    std::shared_ptr<LogProcessingBlock> block = s_environment.GetNextFormatBlock();
    while (block != nullptr)
    {
        block->emitAllFormatEntries(&formatter, &s_environment, emitstdprefix);
        block = s_environment.GetNextFormatBlock();
    }

    return Napi::String::New(env, formatter.getOutputBuffer());
}

Napi::Value FormatMsgsAsync(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    if (info.Length() != 2 || !info[0].IsFunction() || !info[1].IsBoolean())
    {
        Napi::TypeError::New(env, "Wrong arguments").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    Napi::Function callback = info[0].As<Napi::Function>();
    bool stdPrefix = info[1].As<Napi::Boolean>().Value();

    std::shared_ptr<LogProcessingBlock> block = s_environment.GetNextFormatBlock();
    if (block == nullptr)
    {
        callback.Call({ env.Undefined(), env.Undefined() });
    }
    else
    {
        s_environment.SetAsyncFormatWorker(new FormatWorker(callback, block, &s_environment, stdPrefix));
        s_environment.GetAsyncFormatWorker()->Queue();
    }

    return env.Undefined();
}

Napi::Value HasWorkPending(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    return Napi::Boolean::New(env, s_environment.HasWorkPending());
}

Napi::Value InitializeLogger(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    if (info.Length() != 3 || !info[0].IsNumber() || !info[1].IsString() || !info[2].IsString())
    {
        return env.Undefined();
    }

    LoggingLevel level = static_cast<LoggingLevel>(info[0].As<Napi::Number>().Int32Value());
    std::string host = info[1].As<Napi::String>().Utf8Value();
    std::string app = info[2].As<Napi::String>().Utf8Value();

    s_environment.InitializeEnvironmentData(level, host, app);

    return env.Undefined();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "initializeLogger"), Napi::Function::New(env, InitializeLogger));

    exports.Set(Napi::String::New(env, "registerFormat"), Napi::Function::New(env, RegisterFormat));
    exports.Set(Napi::String::New(env, "addCategory"), Napi::Function::New(env, AddCategory));

    exports.Set(Napi::String::New(env, "getEmitLevel"), Napi::Function::New(env, GetEmitLevel));
    exports.Set(Napi::String::New(env, "setEmitLevel"), Napi::Function::New(env, SetEmitLevel));

    exports.Set(Napi::String::New(env, "setMsgTimeLimit"), Napi::Function::New(env, SetMsgTimeLimit));
    exports.Set(Napi::String::New(env, "setMsgSlotLimit"), Napi::Function::New(env, SetMsgSlotLimit));

    exports.Set(Napi::String::New(env, "processMsgsForEmit"), Napi::Function::New(env, ProcessMsgs));

    exports.Set(Napi::String::New(env, "abortAsyncWork"), Napi::Function::New(env, AbortAsyncWork));
    exports.Set(Napi::String::New(env, "formatMsgsSync"), Napi::Function::New(env, FormatMsgsSync));
    exports.Set(Napi::String::New(env, "formatMsgsAsync"), Napi::Function::New(env, FormatMsgsAsync));

    exports.Set(Napi::String::New(env, "hasWorkPending"), Napi::Function::New(env, HasWorkPending));

    return exports;
}

NODE_API_MODULE(nlogger, Init)
