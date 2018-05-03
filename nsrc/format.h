#pragma once

#include "common.h"

class FormatEntry
{
public:
    const FormatStringEntryKind fkind;
    const FormatStringEnum fenum;
    std::string ffollow; //the string to put into the log after this content

    FormatEntry() :
        fkind(FormatStringEntryKind::Clear), fenum(FormatStringEnum::Clear), ffollow()
    {
        ;
    }

    FormatEntry(FormatStringEntryKind fkind, FormatStringEnum fenum, std::string&& ffollow) :
        fkind(fkind), fenum(fenum), ffollow(std::forward<std::string>(ffollow))
    {
        ;
    }

    FormatEntry(FormatEntry&& other) :
        fkind(other.fkind), fenum(other.fenum), ffollow(std::forward<std::string>(other.ffollow))
    {
        ;
    }
};

class MsgFormat
{
private:
    const int64_t m_formatId; //a unique identifier for the format
    std::vector<FormatEntry> m_fentries; //the array of FormatEntry objects
    std::string m_initialFormatStringSegment;
    std::string m_originalFormatString; //the origial raw format string

public:
    MsgFormat() :
        m_formatId(0), m_fentries(), m_initialFormatStringSegment(), m_originalFormatString()
    {
        ;
    }

    MsgFormat(int64_t formatId, size_t entryCount, std::string&& initialFormatStringSegment, std::string&& originalFormatString) :
        m_formatId(formatId), m_fentries(),
        m_initialFormatStringSegment(std::forward<std::string>(initialFormatStringSegment)),
        m_originalFormatString(std::forward<std::string>(originalFormatString))
    {
        this->m_fentries.reserve(entryCount);
    }

    void AddFormat(FormatEntry&& entry)
    {
        this->m_fentries.emplace_back(std::forward<FormatEntry>(entry));
    }

    const std::vector<FormatEntry>& getEntries() const { return this->m_fentries; }
    const std::string& getInitialFormatStringSegment() const { return this->m_initialFormatStringSegment; }
};
