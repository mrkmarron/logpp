# Log++ -- A Logging Framework for Modern Development

Log++ is a logging framework designed to support modern development needs. The goal is to provide:
1. Very low main-thead cost to log a message (under 1&#x00B5;s per message).
2. Simultaneous support for high fidelity diagnostics logging and lower frequency informational logging.
   * High detail debug messages are stored in a high performance in    memory buffer and can be emitted on errors 
     for detailed debugging.
   * Informational messages are written out to the stable storage      channel for analytics and monitoring applications.
3. Structured and machine parsable log output for easy analytics.
4. Unified control of logging levels & output across modules.

## Basic Usage
Log++ is designed to be simple to use and provides a nearly drop in replacement for existing logging.
```
//Import the logpp module and create a logger for your app  
const logpp = require("logpp")("myapp");

//Add a format for better structured log output 
logpp.addFormat("Hello", "Hello World!!!");

//Emit the message specified by the format -- "Hello World!!!"
logpp.info(logpp.Formats.$Hello);

//Write the message given by the printf style formatter -- "Hello printf!!!"
logpp.info("Hello printf!!!");
```

## Logging Levels
Log++ supports 8 logging levels. At each level only messages at the given level 
and higher will be processed, any messages at lower levels will be nop'd or 
filtered (see _multi-level logging_ below). For each level the logger exports a 
function with the corresponding name. Thus to log a message at the `INFO` level 
you would call `logpp.info(...)` and to log at the `DEBUG` level you can call 
`logpp.debug(...)`. The available levels and order is as follows:  

* OFF   &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; // all messages are disabled
* FATAL &nbsp;&nbsp;&nbsp; // `fatal` messages only
* ERROR &nbsp; // `error` and higher
* WARN  &nbsp;&nbsp; // `warn` and higher
* INFO  &nbsp;&nbsp;&nbsp;&nbsp; // `info` and higher -- default for emit (see _multi-level logging_)
* DETAIL &nbsp; // `detail` and higher -- default for in-memory (see _multi-level logging_)
* DEBUG &nbsp; // `debug` and higher
* TRACE &nbsp;&nbsp; // `trace` and higher
* ALL &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; // all messages are enabled

//categories

### Multi-Level Logging
Log++ operates with a novel _multi-level logging_ system that consists of two 
layers. The first is a high-performance in-memory buffer 

### Full Log Write Hooks
//hooks to write detail trace on issues

## Multi-Level Log Layer Management
//flush heuristics
//sync vs async

## Message Formats and Formatters
//format language

//registering formats

//JSON
//Binary