#pragma once 

#include "common.h"

#include "format.h"

class LoggingEnvironment
{
private:
    //Keep track of which logging level is enabled
    LoggingLevel m_enabledLoggingLevel;
    std::map<LoggingLevel, std::string> m_loggingLevelToNames;

    //Keep track of which categories are enabled and their names
    std::vector<std::pair<bool, std::string>> m_enabledCategories;

    const std::string m_hostName;
    const std::string m_appName;

    int64_t m_msgTimeLimit;
    size_t m_msgCountLimit;

    std::vector<std::shared_ptr<MsgFormat>> m_formats;

public:
    LoggingEnvironment(const std::string& hostName, const std::string& appName) :
        m_enabledLoggingLevel(LoggingLevel::LLINFO), m_loggingLevelToNames(), m_enabledCategories(),
        m_hostName(hostName), m_appName(appName),
        m_formats(),
        m_msgTimeLimit(DEFAULT_LOG_TIMELIMIT), m_msgCountLimit(DEFAULT_LOG_SLOTSUSED)
    {
        ;
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
};
