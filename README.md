# Log++ -- A Logging Framework for Modern Development

Log++ is a logging framework designed to support modern development needs. The goal is to provide:
1. Very low main-thead cost to log a message (under 1&#x00B5;s per message) with high cost formatting operations done as a background tasking using Napi.
2. Simultaneous support for high fidelity diagnostics logging and lower frequency informational logging.
   * High detail debug messages are stored in a high performance in memory buffer and can be emitted on errors 
     for detailed debugging.
   * Informational messages are written out to the stable storage channel for analytics and monitoring applications.
3. Structured and machine parsable log output for easy analytics.
4. Unified control of logging levels & output across modules.

## Basic Usage
Log++ is designed to be simple to use and provides a nearly drop in replacement for existing logging.
```
//Import the logpp module and create a logger for your app  
const log = require("logpp")("myapp");

//Add a format for better structured log output 
log.addFormat("Hello", "Hello World!!!");

//Emit the message specified by the format -- "Hello World!!!"
log.info(log.$Hello);

//Write the message given by the printf style formatter -- "Hello printf!!!"
log.info("Hello printf!!!");
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
log.defineCategory("Performance", true);

//Emit the message specified by the format -- "Hello World!!!"
log.info(log.$$Performance, log.$Hello);

//Disable the "performance" category
logpp.defineCategory("Performance", false);

//NOP since Performance category is disabled now
log.info(log.$$Performance, logpp.$Hello);
```
Thus categories provide a simple way to selectively turn off/on related streams 
of logging data and (like logging levels) can be dynamically adjusted during 
execution.

Log++ also provides simple conditional logging with `If` versions of all 
the unconditional logging functions. These functions take a boolean as the 
first argument and only perform the logging work if the value is true.
```
log.info(log.$Hello); //"Hello World!!!"

let x = 1;
log.infoIf(x === 1, log.$Hello); //"Hello World!!!"
log.infoIf(x === 0, log.$Hello); //NOP
```

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
full dump of the `in-memory` log. This can be done with the `emitLogSync(true)` 
API which returns the fully formatted log data as a string. 

### Multi-Level Log Layer Management
Log++ provides a range of settings to control how data is stored and flows 
between the levels in the log and is ultimately emitted.

**Sync vs. Async:** Log++ supports asynchronous logging, for best 
performance and other benefits of multi-level logging, as well as fully 
synchronous logging for simpler debugging and testing scenarios. The mode 
can be set with the `flushMode` option -- either `'ASYNC'` | `'SYNC'` | 
`'NOP'`. 

The default mode is `'ASYNC'` which enables formatting in the background of 
messages that have been added to the `emit` worklist. This option provides the 
best performance. The `'SYNC'` mode does synchronous processing of the 
messages in the `emit` worklist, resulting in higher overhead than the 
`'ASYNC'` mode but, if used in combination with a small `flushCount` and 
time/space constraints on the `in-memory` buffer provides a fast and consistent 
logging setup. Finally, the `'NOP'` option prevents any implicit processing of 
messages in the `emit` list and let's the user control when they are written 
(e.g., using `emitLogSync`).

**Flush Heuristics:** Log++ provides several parameters to control how much 
data is stored in the `in-memory` log and how aggressively it is flushed to 
the `emit` worklist. 

To control how much memory the `in-memory` list consumes Log++ provides two 
parameters:
* Age -- since we want to keep details available in the event of an error or 
other diagnostic need we support a `msgTimeLimit` parameter. Any message older 
than the limit is filtered/processed as needed. 
* Size -- since there may be unusual bursts of logging, and we don't want log 
data to excessively displace user info, we also support a maximum number of 
entires (values) in the `in-memory` log as a failstop. Log++ works to keep the 
number of slots used under this amount.

By default Log++ writes the final formatted results directly into `stdout`. 
However, for applications may also want to send the data to a file or a 
remote server. This can be done by setting the `flushTarget` option as 
`file` or `network` and providing the file/url as the `logSink` option value. 
In these configurations the logging data is written directly to the sink without 
any extra callbacks in the JavaScript layer.

For the most general case Log++ also supports a callback that is invoked whenever 
a block of data is processed from the `emit` log. This allows the application 
to process this data in whatever manner is appropriate. This is accomplished by 
setting the `flushTarget` as `callback` and providing the desired callback as 
the `flushCallback` option.

## Message Formats and Formatters
The primary mechanism for writing messages in Log++ is to use structured 
formatters. By seperating the definition of formats from their use we are able 
to (1) optimize a format which will be repeatedly used and (2) generate a more 
uniform log structure that can be automatically parsed by later anaylsis tools.

### Message Format Structure
The message formats can use either classic printf style format strings or 
special JSON style messages. There are 2 classes of format specifiers that are 
permitted in these message formats -- _expando_ macros for common 
environmental data, like timestamps, source lines, or request ids and 
traditional _value formats_ for numbers/strings as well as _object formats_ 
for JSON style object/array value formatting.

**Expando Macros:**
* `#host`      -- name of the host
* `#app`       -- name of the root app
* `#module`    -- name of the module
* `#source`    -- source location of log statment (file, line)
* `#wallclock` -- wallclock timestamp (iso format)
* `#timestamp` -- logical timestamp -- incremented on each use and on explicit advances
* `#callback`  -- the current callback id
* `#request`   -- the current request id (for http requests)
* `##`         -- a literal #
Some example uses of these macros in format messages include:
```
log.addFormat("Clock", "current time is #wallclock");
log.addFormat("CallbackId", "current callback is #callback");
log.addFormat("Timestamp", "timestamp #timestamp");

log.info(log.$Clock); //current time is "2018-05-08T05:29:55.0512Z"
log.info(log.$CallbackId); //current callback is 1

log.info(log.$Timestamp); //timestamp 0
log.info(log.$Timestamp); //timestamp 1
```

**Value & Object Formats:**
* `%{p:b}` -- a boolean value
* `%{p:n}` -- a number
* `%{p:s}` -- a string
* `%{p:dx}` -- a date formatted as iso (`di`), utc (`du`), or local (`du`)
* `%{p:o<d,l>}` -- an object expanded up to d levels (default is 2) at most l items in any level (default is * for objects 128 for arrays)
* `%{p:a<d,l>}` -- an array expanded up to d levels (default is 2) at most l items in any level (default is * for objects 128 for arrays)
* `%{p:g}` -- general value (general format applied -- no array expansion, object depth of 2)
* `%%` -- a literal %

The value formats consist of an argument position `p` followed by a format 
specifier. For simple formats this is a simple specifier, `b` for boolean, 
`s` for string, `dl` for a date in the local timezone, etc. For objects and 
arrays the format allows for depth and length limits on the expansion. So, 
an object specifier could be `%{1:o}` (default expansion), `%{1:o<1,>}` (max 
depth of 1 default length), or `%{1:o<2,10>}` (max depth 2 max length 10). 
Cycle detection is done by default and noted with a special `"<Cycle>"` token 
in the output. For variables that are not naturally formattable are printed as 
`"<OpaqueValue>"`. 

Some example uses of these in format messages include:
```
log.addFormat("Number", "A number %{0:n}");
log.addFormat("DateLocal", "A date %{0:dl}");
log.addFormat("Object", "An object %{0:o}");
log.addFormat("ObjectWDepth", "A shallow object %{0:o<1,>}");

log.info(log.$Number, 2); // A number 2
log.info(log.$DateLocal, new Date()); // A date "Mon May 07 2018 22:29:55 GMT-0700 (Pacific Daylight Time)"
log.info(log.$Object, {f: 3, g: [1, 2]}); // An object {"f": 3, "g": [1, 2]}
log.info(log.$ObjectWDepth, {f: 3, g: [1, 2]}); // A shallow object {"f": 3, "g": "..."}
```

The general (`g`) format is a catchall that will format a value using the 
default options for whatever the type of the value is.
```
log.addFormat("General", "Value is %{0:g}");

log.info(log.$General, 2); // Value is 2
log.info(log.$General, "ok"); // Value is "ok"
log.info(log.$General, {f: 3}); // Value is {"f": 3}
```

**JSON Messgae Formats:** 
In addition to classic printf style formats Log++ also supports hybrid JSON 
message formats. In these formats you can place a format specifier in any 
value position. For example:
```
log.addFormat("Json", {kind: "start", time: "#wallclock", value: "%{0:a}"});
log.info(log.$Json, [1, 2]); // {"kind": "start", "time": "2018-05-08T05:29:55.0512Z", "value": [1, 2]}
```

**Format registration:**
//registering formats -- single and json

### Emit Formats
//JSON
//Binary

## Managing Loggers
A key challenge in logging in an ecosystem such as Node.js is the heavy use of 
modules and components. Ideally all of the logging in these frameworks should 
coordinate the levels of active logging, the sink of these logs, and merging 
the message streams. Additionally, the "master" application should be able to 
disable or reduce rates of logging from submodules that are not of interest. 
To support this we introduce the concept of a _root logger_ which is able to 
control all the sublogger actions (and subloggers cannot override these 
settings).

The _root logger_ is the logger created by the `require.main.file` (first 
loaded file). Each logger is created with a _module name_ and all loggers 
created with the same name share the same logger. The _root logger_ can set 
the emit level, sink, etc. and enable/disable or set levels of subloggers 
explicitly. If not explicitly set subloggers are restricted to emitting at 
the `WARN` level. All messages are merged and managed automatically according 
to the settings of the _root logger_.

## API Specification
