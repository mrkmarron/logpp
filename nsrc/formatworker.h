#pragma once

class FormatWorker : public Napi::AsyncWorker
{
private:
    const std::string m_action;
    std::unique_ptr<Formatter> m_formatter;
    std::shared_ptr<LogProcessingBlock> m_block;
    LoggingEnvironment* m_lenv;
    const bool m_stdPrefix;

public:

    FormatWorker(Napi::Function& callback, const std::string& action, std::shared_ptr<LogProcessingBlock> block, LoggingEnvironment* lenv, bool stdPrefix) :
        Napi::AsyncWorker(callback), m_action(action), m_formatter(), m_block(block), m_lenv(lenv), m_stdPrefix(stdPrefix)
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
            this->m_formatter = std::make_unique<Formatter>();
        }

        this->m_block->emitAllFormatEntries(this->m_formatter.get(), this->m_lenv, this->m_stdPrefix);
    }

    virtual void OnOK() override
    {
        Napi::HandleScope scope(Env());

        this->m_lenv->ClearAsyncFormatWorker();

        if (this->m_action.compare("console") == 0)
        {
            fprintf(stdout, this->m_formatter->getOutputBuffer().c_str());
        }
        else
        {
            Callback().Call({ Env().Undefined(), Napi::String::New(Env(), this->m_formatter->getOutputBuffer()) });
        }
    }

    virtual void OnError(const Napi::Error& e) override
    {
        Napi::HandleScope scope(Env());

        this->m_lenv->AddBlockFromFormatterAbort(this->m_block);
        this->m_lenv->ClearAsyncFormatWorker();
    }
};