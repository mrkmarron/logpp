#pragma once

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

    void emitVarTagEntry(Formatter* formatter, LogEntryTag tag)
    {
        switch (tag)
        {
        case LogEntryTag::JsVarValue_Undefined:
            formatter->emitLiteralString("undefined");
            break;
        case LogEntryTag::JsVarValue_Null:
            formatter->emitLiteralString("null");
            break;
        case LogEntryTag::JsVarValue_Bool:
            formatter->emitLiteralString(this->getCurrentDataAsBool() ? "true" : "false");
            break;
        case LogEntryTag::JsVarValue_Number:
            formatter->emitJsNumber(this->getCurrentDataAsFloat());
            break;
        case LogEntryTag::JsVarValue_StringIdx:
            formatter->emitJsString(this->getCurrentDataAsString());
            break;
        case LogEntryTag::JsVarValue_Date:
            formatter->emitJsDate(this->getCurrentDataAsTime(), FormatStringEnum::DATEISO, true);
            break;
        default:
            formatter->emitSpecialTag(tag);
            break;
        }
    }

    void emitStructuredEntry(Formatter* formatter)
    {
        std::stack<std::pair<char, bool>> processingStack;
        processingStack.push(std::make_pair<char, bool>(this->getCurrentTag() == LogEntryTag::LParen ? '{' : '[', true));

        formatter->emitLiteralChar(processingStack.top().first);
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
                    formatter->emitLiteralString(", ");
                }
            }

            if (tag == LogEntryTag::PropertyRecord)
            {
                formatter->emitJsString(this->getCurrentDataAsString());
                formatter->emitLiteralString(": ");
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
                formatter->emitLiteralChar(tag == LogEntryTag::RParen ? '}' : ']');
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

    void emitFormatEntry(Formatter* formatter, const LoggingEnvironment* lenv, bool emitstdprefix)
    {
        const std::shared_ptr<MsgFormat> fmt = lenv->GetFormat(this->getCurrentDataAsInt());
        this->advancePos();

        if (!emitstdprefix)
        {
            this->advancePos();
            this->advancePos();
            this->advancePos();
        }
        else
        {
            formatter->emitLiteralString(lenv->GetLogLevelName(this->getCurrentDataAsLoggingLevel()));
            this->advancePos();
            formatter->emitLiteralChar('#');

            formatter->emitLiteralString(lenv->GetCategoryName(this->getCurrentDataAsInt()));
            this->advancePos();

            formatter->emitLiteralString(" @ ");
            formatter->emitJsDate(this->getCurrentDataAsTime(), FormatStringEnum::DATEISO, false);
            this->advancePos();

            formatter->emitLiteralString(" -- ");
        }

        formatter->emitLiteralString(fmt->GetInitialFormatStringSegment());

        const std::vector<FormatEntry>& formatArray = fmt->GetEntries();
        for (size_t formatIndex = 0; formatIndex < formatArray.size(); formatIndex++)
        {
            const FormatEntry& fentry = formatArray[formatIndex];

            if (fentry.fkind == FormatStringEntryKind::Literal)
            {
                formatter->emitLiteralChar(fentry.fenum == FormatStringEnum::HASH ? '#' : '%');
            }
            else if (fentry.fkind == FormatStringEntryKind::Expando) {
                bool advanceData = true;

                switch (fentry.fenum)
                {
                case FormatStringEnum::HOST:
                    advanceData = false;
                    formatter->emitJsString(lenv->GetHostName());
                    break;
                case FormatStringEnum::APP:
                    advanceData = false;
                    formatter->emitJsString(lenv->GetAppName());
                    break;
                case FormatStringEnum::MODULE:
                    formatter->emitJsString(this->getCurrentDataAsString());
                    break;
                case FormatStringEnum::SOURCE:
                    formatter->emitCallStack(this->getCurrentDataAsString());
                    break;
                case FormatStringEnum::WALLCLOCK:
                    formatter->emitJsDate(this->getCurrentDataAsTime(), FormatStringEnum::DATEISO, true);
                    break;
                case FormatStringEnum::TIMESTAMP:
                case FormatStringEnum::CALLBACK:
                case FormatStringEnum::REQUEST:
                    formatter->emitJsInt(this->getCurrentDataAsInt());
                    break;
                default:
                    formatter->emitSpecialTag(LogEntryTag::JsBadFormatVar);
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
                    formatter->emitSpecialTag(tag);
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
                        formatter->emitLiteralString(this->getCurrentDataAsBool() ? "true" : "false");
                        break;
                    case FormatStringEnum::NUMBER:
                        formatter->emitJsNumber(this->getCurrentDataAsFloat());
                        break;
                    case FormatStringEnum::STRING:
                        formatter->emitJsString(this->getCurrentDataAsString());
                        break;
                    case FormatStringEnum::DATEISO:
                    case FormatStringEnum::DATEUTC:
                    case FormatStringEnum::DATELOCAL:
                        formatter->emitJsDate(this->getCurrentDataAsTime(), fentry.fenum, true);
                        break;
                    default:
                        this->emitVarTagEntry(formatter, tag);
                        break;
                    }

                    this->advancePos();
                }
            }

            formatter->emitLiteralString(fentry.ffollow);
        }
        formatter->emitLiteralChar('\n');

        this->advancePos();
    }

    void emitAllFormatEntries(Formatter* formatter, const LoggingEnvironment* lenv, bool emitstdprefix)
    {
        this->m_cposTag = this->m_tags.cbegin();
        this->m_cposData = this->m_data.cbegin();

        while (this->hasMoreEntries())
        {
            this->emitFormatEntry(formatter, lenv, emitstdprefix);
        }
    }

    static bool MsgTimeExpired(size_t cpos, const double* data, const LoggingEnvironment* lenv)
    {
        std::time_t now = std::time(nullptr); //depnds on system time being uint64 convertable

        return static_cast<int64_t>(data[cpos + 3]) + lenv->GetMsgTimeLimit() < now;
    }

    static bool MsgOverSizeLimit(size_t msgCount, const LoggingEnvironment* lenv)
    {
        return msgCount > lenv->GetMsgSlotsLimit();
    }

    static bool ShouldDiscard(size_t cpos, const double* data, const LoggingEnvironment* lenv)
    {
        const LoggingLevel level = static_cast<LoggingLevel>(static_cast<uint32_t>(data[cpos + 1]));
        return !LOG_LEVEL_ENABLED(level, lenv->GetEnabledLoggingLevel());
    }

    static bool ProcessDiscardEntry(size_t& cpos, size_t epos, const uint8_t* tags)
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

    bool ProcessSaveEntry(size_t& cpos, size_t epos, const uint8_t* tags, const double* data, const Napi::Array stringData)
    {
        while (cpos < epos && tags[cpos] != static_cast<uint8_t>(LogEntryTag::MsgEndSentinal))
        {
            const LogEntryTag ttag = static_cast<LogEntryTag>(tags[cpos]);
            if (ttag != LogEntryTag::JsVarValue_StringIdx && ttag != LogEntryTag::PropertyRecord)
            {
                this->AddDataEntry(ttag, data[cpos]);
            }
            else
            {
                Napi::Value sval = stringData[static_cast<size_t>(data[cpos])];
                this->AddStringDataEntry(ttag, data[cpos], sval.As<Napi::String>());
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
            this->AddDataEntry(LogEntryTag::MsgEndSentinal, 0.0);

            return true;
        }
    }
};

