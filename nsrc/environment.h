#pragma once 

//forward decls
class MsgFormat;
class LogProcessingBlock;
class FormatWorker;

class LoggingEnvironment
{
private:
    //Keep track of which logging level is enabled
    LoggingLevel m_enabledLoggingLevel;
    std::map<LoggingLevel, std::string> m_loggingLevelToNames;

    //Keep track of which category names
    std::map<int64_t, std::string> m_categoryNames;

    std::string m_hostName;
    std::string m_appName;

    int64_t m_msgTimeLimit;
    size_t m_msgCountLimit;

    std::vector<std::shared_ptr<MsgFormat>> m_formats;

    std::vector<std::shared_ptr<LogProcessingBlock>> m_processing;
    char m_processingMode = 'n';

    FormatWorker* m_formatWorker;

public:
    LoggingEnvironment(const LoggingLevel level, const std::string& hostName, const std::string& appName) :
        m_enabledLoggingLevel(level), m_loggingLevelToNames(), m_categoryNames(),
        m_hostName(hostName), m_appName(appName),
        m_formats(),
        m_msgTimeLimit(DEFAULT_LOG_TIMELIMIT), m_msgCountLimit(DEFAULT_LOG_SLOTSUSED),
        m_processing(), m_processingMode('n'),
        m_formatWorker(nullptr)
    {
        this->m_categoryNames[1] = "$default"; //$default is defined by default
        this->m_categoryNames[2] = "$explicit"; //$explicit is defined by default

        this->m_loggingLevelToNames[LoggingLevel::LLOFF] = std::string("OFF");
        this->m_loggingLevelToNames[LoggingLevel::LLFATAL] = std::string("FATAL");
        this->m_loggingLevelToNames[LoggingLevel::LLERROR] = std::string("ERROR");
        this->m_loggingLevelToNames[LoggingLevel::LLWARN] = std::string("WARN");
        this->m_loggingLevelToNames[LoggingLevel::LLINFO] = std::string("INFO");
        this->m_loggingLevelToNames[LoggingLevel::LLDETAIL] = std::string("DETAIL");
        this->m_loggingLevelToNames[LoggingLevel::LLDEBUG] = std::string("DEBUG");
        this->m_loggingLevelToNames[LoggingLevel::LLTRACE] = std::string("TRACE");
        this->m_loggingLevelToNames[LoggingLevel::LLOFF] = std::string("OFF");
    }

    void InitializeEnvironmentData(const LoggingLevel level, const std::string& hostName, const std::string& appName)
    {
        this->m_enabledLoggingLevel = level;
        this->m_hostName = hostName;
        this->m_appName = appName;
    }

    void AddFormat(int64_t fmtId, std::shared_ptr<MsgFormat> fmt)
    {
        if (fmtId == this->m_formats.size())
        {
            this->m_formats.push_back(fmt);
        }
        else
        {
            //a previous format add failed so replace the index with the new one
            this->m_formats[fmtId] = fmt;
        }
    }

    std::shared_ptr<MsgFormat> GetFormat(int64_t idx) const
    {
        return this->m_formats[idx];
    }

    const std::string& GetHostName() const { return this->m_hostName; }
    const std::string& GetAppName() const { return this->m_appName; }

    void SetMsgTimeLimit(int64_t limit) { this->m_msgTimeLimit = limit; }
    int64_t GetMsgTimeLimit() const { return this->m_msgTimeLimit; }

    void SetMsgSlotsLimit(size_t limit) { this->m_msgCountLimit = limit; }
    size_t GetMsgSlotsLimit() const { return this->m_msgCountLimit; }

    void AddCategory(int64_t categoryId, const std::string& name) { this->m_categoryNames[categoryId] = name; }
    const std::string& GetCategoryName(int64_t categoryId) const { return this->m_categoryNames.at(categoryId); }

    void SetEnabledLoggingLevel(LoggingLevel level) { this->m_enabledLoggingLevel = level; }
    LoggingLevel GetEnabledLoggingLevel() const { return this->m_enabledLoggingLevel; }
    const std::string& GetLogLevelName(LoggingLevel level) const { return this->m_loggingLevelToNames.at(level); }

    void AddProcessingBlock(std::shared_ptr<LogProcessingBlock> block) { this->m_processing.push_back(block); }
    std::shared_ptr<LogProcessingBlock> GetActiveProcessingBlock() { return this->m_processing.back(); }

    void SetProcessingMode(char c) { this->m_processingMode = c; }
    char GetProcessingMode() const { return this->m_processingMode; }

    void DiscardProcesingBlock(std::shared_ptr<LogProcessingBlock> pb)
    {
        //should always be the last block
        this->m_processing.pop_back();
    }

    void AddBlockFromFormatterAbort(std::shared_ptr<LogProcessingBlock> pb)
    {
        this->m_processing.insert(this->m_processing.begin(), pb);
    }

    std::shared_ptr<LogProcessingBlock> GetNextFormatBlock()
    {
        if (this->m_processing.empty())
        {
            return nullptr;
        }
        else
        {
            std::shared_ptr<LogProcessingBlock> pb = this->m_processing.front();
            this->m_processing.erase(this->m_processing.begin());

            return pb;
        }
    }

    void SetAsyncFormatWorker(FormatWorker* formatWorker) { this->m_formatWorker = formatWorker; }
    FormatWorker* GetAsyncFormatWorker() { return this->m_formatWorker; }
    void ClearAsyncFormatWorker() { this->m_formatWorker = nullptr; }

    bool HasWorkPending() const
    {
        return !this->m_processing.empty();
    }
};
