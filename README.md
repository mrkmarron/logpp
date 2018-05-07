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

## Logging Levels and Categories
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
* INFO  &nbsp;&nbsp;&nbsp;&nbsp; // `info` and higher -- default for `emit` (see _multi-level logging_)
* DETAIL &nbsp; // `detail` and higher -- default for `in-memory` (see _multi-level logging_)
* DEBUG &nbsp; // `debug` and higher
* TRACE &nbsp;&nbsp; // `trace` and higher
* ALL &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; // all messages are enabled

In addition to adjusting the level at which log messages are processed Log++ 
also supports message categories to organize log messages and to selectively 
enable/disable them at a fine grain level. Categories can be defined using any 
name desired and enabled/disabled on a per logger basis.

Setting up and using a logging category can be done as follows:
```
//Define and enable the "performance" category
logpp.defineCategory("Performance", true);

//Emit the message specified by the format -- "Hello World!!!"
logpp.info(logpp.c$Performance, logpp.f$Hello);

//Disable the "performance" category
logpp.defineCategory("Performance", false);

//NOP
logpp.info(logpp.c$Performance, logpp.f$Hello);
```
Thus categories provide a simple way to selectively turn off/on related streams 
of logging data and (like logging levels) can be dynamically adjusted during 
execution.

## Multi-Level Logging
In the default mode Log++ operates with a novel _multi-level logging_ system 
that consists of two layers and three phases. 
1. An in memory buffer where all enabled messages are synchronously copied into 
during the logger call (`info`/`debug`/etc.). In this step the formatter info + 
information on the arguments is copied but no formatting or emitting is done.
2. Asynchronously messages + data from the in memory buffer that are over time 
or memory limits (see Multi-Level Log Layer Management below) are checked and 
either discarded or copied to an format & emit buffer. The decision to 
copy/discard is governed by the level the message was logged at and the `emit` 
level the loggers are running at. 
3. In a native module, running on a background thread, the messages to be 
emitted are formatted into specified wire format (currently JSON and Binary -- 
see Formatters below). When this is complete the results can be written 
directly to `stdout`, a file, or http target **or** a user-defined callback 
can be registered and invoked (see Emit Channels below). 

With this design the only blocking cost on the main thread for a log operation 
is an enabled check, an immediate check/copy of the message data, and a bulk 
filter copy. This time is much smaller than the format and emit time which then 
happens on an asynchronous background thread -- resulting in a 10x reduction in 
performance overhead when compared to `console.log` style logging.

In addition to this default asynchronous mode Log++ also supports completely 
synchronous processing (at lower performance) as an option and as the default 
when the debugger is attached vs. high performance async when running in 
production (see Sync vs. Async below). 

Beyond the performance implications of splitting the logging into 2 layers 
there are two other substantial benefits:
1. Since the initial logging of a message is cheap (~1&#x00B5;s) it is feasible 
to log at a much higher rate than previously possible, say `DETAIL` or `DEBUG` 
instead of `INFO` or just `WARN`. Then, when an error occurs this invaluable 
information is present in the in-memory buffer and can be included with the 
rest of the error dump.
2. While this high fidelity logging data is desireable when analyzing and error 
or performance issue for normal execution it is simply clutter that 
unnecessarily takes up and space and complicates other informational log 
analysis tasks. The ability to discard messages as they move to the `emit` 
buffer allows us to eliminate this clutter and only save messages that are 
generally useful and worth longer term storage (say `INFO` or only just `WARN`).

### Full Log Write Hooks
To maximize the value of the `in-memory` log ability we support the hooking of 
common failure events and allow explicit emit of the full in-memory log. The 
auto-hooked events are:
* Unhandled exception
* Exit with a non-zero exit code
* Log writes to `error` or `fatal`

These hooks are controlled with the `dumpHooks` option which can be a single 
string `'exception'` | `'exit'` | `'log'` or an array of these string flags. 
The output of this dump can be directed to `stdout` or a file specified by the 
`dumpTarget` option. 

In other cases you may want to programatically (and synchronously) produce a 
full dump of the `in-memory` log. This can be done with the `emitFullLogSync` 
API which returns the fully formatted log data as a string. 

### Multi-Level Log Layer Management
Log++ provides a range of settings to control how data is stored and flows 
between the levels in the log and is ultimately emitted.

**Sync vs. Async:** Log++ supports asynchronous logging, for best 
performance and other benefits of multi-level logging, as well as fully 
synchronous logging for simpler debugging and testing scenarios. The mode 
can be set with the `flushMode` option -- either `'Async'` | `'Sync'` | 
`'Nop'`. The asdf....

**Flush Heuristics:** Log++ provides several parameters to control how much 
data is stored in the `in-memory` log and how aggressively it is flushed to  
//time/space, write count 

//emit channels

## Message Formats and Formatters
//format language

//registering formats

//JSON
//Binary

## Managing Loggers

## API Specification