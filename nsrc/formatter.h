#pragma once

//This class controls the formatting
class Formatter
{
private:
    std::ostringstream m_output;

public:
    std::string getOutputBuffer() const { return this->m_output.str(); }
    void reset()
    {
        this->m_output.clear();
        this->m_output.str("");
    }

    void emitLiteralChar(char c)
    {
        this->m_output << c;
    }

    void emitLiteralString(const char* str)
    {
        this->m_output << str;
    }

    void emitLiteralString(const std::string& str)
    {
        this->m_output << str;
    }

    void emitJsString(const std::string& str)
    {
        this->m_output << "\"";

        for (auto c = str.cbegin(); c != str.cend(); c++) {
            switch (*c) {
            case '"':
                this->m_output << "\\\"";
                break;
            case '\\':
                this->m_output << "\\\\";
                break;
            case '\b':
                this->m_output << "\\b";
                break;
            case '\f':
                this->m_output << "\\f";
                break;
            case '\n':
                this->m_output << "\\n";
                break;
            case '\r':
                this->m_output << "\\r";
                break;
            case '\t':
                this->m_output << "\\t";
                break;
            default:
                if ('\x00' <= *c && *c <= '\x1f')
                {
                    this->m_output << "\\u" << std::hex << std::setw(4) << std::setfill('0') << (int)*c;
                }
                else
                {
                    this->m_output << *c;
                }
            }
        }

        this->m_output << "\"";
    }

    void emitJsInt(int64_t val)
    {
        this->m_output << val;
    }

    void emitJsNumber(double val)
    {
        if (std::isnan(val))
        {
            this->emitLiteralString("null");
        }
        else if (val == std::numeric_limits<double>::infinity())
        {
            this->emitLiteralString("null");
        }
        else if (val == -std::numeric_limits<double>::infinity())
        {
            this->emitLiteralString("null");
        }
        else if (floor(val) == val)
        {
            this->m_output << (int64_t)val;
        }
        else
        {
            this->m_output << val;
        }
    }

    void emitJsDate(std::time_t dval, FormatStringEnum fmt, bool quotes)
    {
        if (quotes)
        {
            this->m_output << '"';
        }

        std::time_t tval = dval / 1000;
        uint32_t msval = dval % 1000;

        if (fmt == FormatStringEnum::DATEUTC)
        {
            auto utctime = std::gmtime(&tval);
            this->m_output << std::put_time(utctime, "%a, %d %b %Y %H:%M:%S GMT");
        }
        else if (fmt == FormatStringEnum::DATELOCAL)
        {
            auto localtime = std::localtime(&tval);
            this->m_output << std::put_time(localtime, "%a %b %d %Y %H:%M:%S GMT%z (%Z)");
        }
        else
        {
            //ISO
            auto utctime = std::gmtime(&tval);
            this->m_output << std::put_time(utctime, "%Y-%m-%dT%H:%M:%S") << "." << std::setw(4) << std::setfill('0') << msval << "Z";
        }

        if (quotes)
        {
            this->m_output << '"';
        }
    }

    void emitCallStack(const std::string& cstack)
    {
        this->emitJsString(cstack);
    }

    void emitSpecialTag(LogEntryTag tag)
    {
        switch (tag)
        {
        case LogEntryTag::JsBadFormatVar:
            this->emitLiteralString("\"<BadFormat>\"");
            break;
        case LogEntryTag::DepthBoundObject:
            this->emitLiteralString("\"{...}\"");
            break;
        case LogEntryTag::LengthBoundObject:
            this->emitLiteralString("\"$rest$\": \"...\"");
            break;
        case LogEntryTag::DepthBoundArray:
            this->emitLiteralString("\"[...]\"");
            break;
        case LogEntryTag::LengthBoundArray:
            this->emitLiteralString("\"...\"");
            break;
        case LogEntryTag::CycleValue:
            this->emitLiteralString("\"<Cycle>\"");
            break;
        default:
            this->emitLiteralString("\"<OpaqueValue>\"");
            break;
        }
    }
};
