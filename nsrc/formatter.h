#pragma once

#define INITIAL_FORMAT_BUFFER_SIZE 1024

//This class controls the formatting
class Formatter
{
private:
    char* m_buff;
    size_t m_max;
    size_t m_curr;

    template<size_t N>
    void ensure_fixed()
    {
        if (this->m_curr + N >= this->m_max)
        {
            this->m_max *= 2;
            this->m_buff = (char*)realloc(this->m_buff, this->m_max);
        }
    }

    void ensure(size_t extra)
    {
        if (this->m_curr + extra >= this->m_max)
        {
            this->m_max *= 2;
            this->m_buff = (char*)realloc(this->m_buff, this->m_max);
        }
    }

public:
    Formatter() :
        m_buff((char*)malloc(INITIAL_FORMAT_BUFFER_SIZE)), m_max(INITIAL_FORMAT_BUFFER_SIZE), m_curr(0)
    {
        ;
    }

    size_t getOutputBufferSize() const { return this->m_curr; }
    char* getOutputBuffer() const { return this->m_buff; }

    void reset()
    {
        this->m_buff = (char*)malloc(INITIAL_FORMAT_BUFFER_SIZE);
        this->m_max = INITIAL_FORMAT_BUFFER_SIZE;
        this->m_curr = 0;
    }

    void emitLiteralChar(char c)
    {
        this->ensure(1);
        this->m_buff[this->m_curr++] = c;
    }

    template<size_t N>
    void emitLiteralString(const char(&str)[N])
    {
        this->ensure(N);
        memcpy(this->m_buff + this->m_curr, &str, N);

        this->m_curr += N - 1;
    }

    void emitLiteralString(const std::string& str)
    {
        this->ensure(str.length());
        memcpy(this->m_buff + this->m_curr, str.c_str(), str.length());

        this->m_curr += str.length();
    }

    void emitJsString(const std::string& str)
    {
        this->emitLiteralChar('"');

        for (auto c = str.cbegin(); c != str.cend(); c++) {
            this->ensure_fixed<6>();

            switch (*c) {
            case '"':
                this->m_buff[this->m_curr] ='\\';
                this->m_buff[this->m_curr++] = '"';
                break;
            case '\\':
                this->m_buff[this->m_curr++] = '\\';
                this->m_buff[this->m_curr++] = '\\';
                break;
            case '\b':
                this->m_buff[this->m_curr++] = '\\';
                this->m_buff[this->m_curr++] = 'b';
                break;
            case '\f':
                this->m_buff[this->m_curr++] = '\\';
                this->m_buff[this->m_curr++] = 'f';
                break;
            case '\n':
                this->m_buff[this->m_curr++] = '\\';
                this->m_buff[this->m_curr++] = 'n';
                break;
            case '\r':
                this->m_buff[this->m_curr++] = '\\';
                this->m_buff[this->m_curr++] = 'r';
                break;
            case '\t':
                this->m_buff[this->m_curr++] = '\\';
                this->m_buff[this->m_curr++] = 't';
                break;
            default:
                if (*c <= 127)
                {
                    this->m_buff[this->m_curr++] = *c;
                }
                else
                {
                    //
                    //TODO: this encoding
                    //
                    this->m_buff[this->m_curr++] = '\\';
                    this->m_buff[this->m_curr++] = 'u';
                    this->m_buff[this->m_curr++] = '0';
                    this->m_buff[this->m_curr++] = '0';
                    this->m_buff[this->m_curr++] = '0';
                    this->m_buff[this->m_curr++] = '0';
                }
            }
        }

        this->emitLiteralChar('"');
    }

    void emitJsInt(int64_t val)
    {
        this->ensure(32);
        this->m_curr += snprintf(this->m_buff + this->m_curr, 32, "%I64i", val);
    }

    void emitJsNumber(double val)
    {
        if (isnan(val))
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
            this->ensure(32);
            this->m_curr += snprintf(this->m_buff + this->m_curr, 32, "%I64i", static_cast<int64_t>(val));
        }
        else
        {
            this->ensure(32);
            this->m_curr += snprintf(this->m_buff + this->m_curr, 32, "%f", val);
            while (this->m_buff[this->m_curr - 1] == '0')
            {
                this->m_curr--;
            }
        }
    }

    void emitJsDate(std::time_t dval, FormatStringEnum fmt, bool quotes)
    {
        if (quotes)
        {
            this->emitLiteralChar('"');
        }

        std::time_t tval = dval / 1000;
        uint32_t msval = dval % 1000;

        this->ensure(128);
        if (fmt == FormatStringEnum::DATELOCAL)
        {
            auto localtime = std::localtime(&tval);
            this->m_curr += strftime(this->m_buff + this->m_curr, 128, "%a %b %d %Y %H:%M:%S GMT%z (%Z)", localtime);
        }
        else
        {
            //ISO
            auto utctime = std::gmtime(&tval);
            this->m_curr += strftime(this->m_buff + this->m_curr, 96, "%Y-%m-%dT%H:%M:%S", utctime);
            this->m_curr += snprintf(this->m_buff + this->m_curr, 32, ".%03dZ", msval);
        }

        if (quotes)
        {
            this->emitLiteralChar('"');
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
