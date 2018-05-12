#pragma once

class FormatWorker : public Napi::AsyncWorker
{
private:
    std::shared_ptr<Formatter> m_formatter;
    std::shared_ptr<LogProcessingBlock> m_block;
    LoggingEnvironment* m_lenv;
    const bool m_stdPrefix;

public:

    FormatWorker(Napi::Function& callback, std::shared_ptr<LogProcessingBlock> block, LoggingEnvironment* lenv, bool stdPrefix) :
        Napi::AsyncWorker(callback), m_formatter(nullptr), m_block(block), m_lenv(lenv), m_stdPrefix(stdPrefix)
    {
        ;
    }

    virtual ~FormatWorker()
    {
        ;
    }

    std::shared_ptr<LogProcessingBlock> GetProcessingBlock() { return this->m_block; }

    virtual void Execute() override
    {
        if (this->m_formatter == nullptr)
        {
            this->m_formatter = std::make_shared<Formatter>();
        }

        this->m_block->emitAllFormatEntries(this->m_formatter.get(), this->m_lenv, this->m_stdPrefix);
    }

    virtual void OnOK() override
    {
        Napi::HandleScope scope(Env());
        this->m_lenv->ClearAsyncFormatWorker();

        Callback().Call({ Env().Undefined(), Napi::String::New(Env(), this->m_formatter->getOutputBuffer(), this->m_formatter->getOutputBufferSize()) });
    }

    virtual void OnError(const Napi::Error& e) override
    {
        Napi::HandleScope scope(Env());
        this->m_lenv->ClearAsyncFormatWorker();

        Callback().Call({ e.Value(), Env().Undefined() });
    }
};