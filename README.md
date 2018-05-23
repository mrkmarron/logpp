# Log++ -- A Logging Framework for Modern Development

Log++ is a logging framework designed to support modern development needs. The 
goal is to provide:
1. Very low main-thead cost to log a message (under 1&#x00B5;s per message) 
with high cost formatting operations done as a background tasking using a 
[N-API](https://nodejs.org/api/n-api.html) module.
2. Simultaneous support for high fidelity diagnostics/debugging logging and 
lower frequency informational logging. All message data is initially stored in 
a high performance in-memory buffer and, later, a filtered set of messages 
identified as useful are written to stable storage.
   * Detailed logging data is processed chaply into the high performance 
     in-memory buffer and can be emitted on errors for detailed debugging.
   * Informational messages are saved out to a stable storage channel for 
     analytics and monitoring applications.
3. The logging output provides structured and machine parsable formats (even 
with `printf` style logging). These formats can be explicitly provided/managed 
via external JSON specifications. Common prefix data and macros for embedding 
useful system information are also available.
4. Unified control of logging levels & output across modules is possible by a 
support for both `child` loggers and logic for controlling the output from 
`subloggers` created by other modules that your application uses.

## Basic Usage
Log++ is designed to be simple to use and provides a nearly drop in replacement for existing logging frameworks.
```js
//Import the logpp module and create a logger (named "myapp") 
const log = require("logpp")("myapp");

//Add a format for better structured log output and provide it on the logger (prefixed with a "$")
log.addFormat("Hello", "Hello %s!!!");

//Emit the message specified by the format -- Hello "World"!!!
log.info(log.$Hello, "World");

//Or emit message given by a printf style format -- Hello "printf"!!!
log.info("Hello %s!!!", "printf");
```

## Performance
Log++ is designed to minimize logging overhead on your application so you can 
use it to provide rich/useful information about your application without 
impacting your users. As a very rough benchmark we have a comparison with 
three other popular loggers -- [Bunyan](https://github.com/trentm/node-bunyan), 
[Debug](https://github.com/visionmedia/debug), and 
[Pino (Extreme)](https://github.com/pinojs/pino). The first 3 benchmarks are 
taken from [Pino](https://github.com/pinojs/pino) and the last one is from us. 
Each message is written 100k times and these timings are from an Intel 
Core i7-5600 running Node-V8 10.0.

* Basic: `info('hello world -- logger')`
* String: `info('hello %s', 'world')`
* Multi: `info('hello %s %j %d', 'world', { obj: true }, 4)`
* Complex: `info('hello at %j from %s with %j %n -- %s', new Date(), app, ['iter', { f: i, g: i.toString() }], i - 5, (i % 2 === 0 ? 'ok' : 'skip'))`

The results in the table below show a representative timing taken for each 
logger framework on each benchmark and the speedup of Log++ over the next 
best performing framework.

 | Logger  | Basic  | String | Multi   | Complex |
 | ------  | ------ | ------ | ------  | ------  |
 | Bunyan  | 690 ms | 779 ms | 1106 ms | 1578 ms |
 | Debug   | 266 ms | 385 ms | 515 ms  | 842 ms  |
 | Pino    | 141 ms | 211 ms | 378 ms  | 887 ms  |
 | Log++   | 71 ms  | 109 ms | 253 ms  | 438 ms  |
 | Speedup | 1.98x  | 1.93x  | 1.49x   | 1.92x   |

As seen in our results Log++ is consistently the lowest overhead logger, in 
most cases spending nearly 2x less time blocking the main event thread, than 
any of the others.

## Logging Levels and Categories
Log++ supports 8 logging levels. At each level only messages at the given level 
and higher will be processed, any messages at lower levels will be nop'd or 
filtered (see _multi-level logging_ below). For each level the logger exports a 
function with the corresponding name. Thus to log a message at the `INFO` level 
you would call `log.info(...)` and to log at the `DEBUG` level you can call 
`log.debug(...)`. The available levels and order is:  

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
```js
//Define and enable the "performance" category
log.enableCategory("Performance", true);

//Emit the message specified by the format under the given category-- "Hello World!!!"
log.info(log.$$Performance, log.$Hello);

//Disable the "performance" category
logpp.enableCategory("Performance", false);

//NOP since Performance category is disabled now
log.info(log.$$Performance, logpp.$Hello);
```
Thus categories provide a simple way to selectively turn off/on related streams 
of logging data and (like logging levels) can be dynamically adjusted during 
execution.

Log++ also provides simple conditional logging with `If` versions of all 
the unconditional logging functions. These functions take a boolean as the 
first argument and only perform the logging work if the value is true.
```js
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
either discarded or copied to a format & emit buffer. The decision to 
copy/discard is governed by the level the message was logged at and the `emit` 
level the loggers are running at. 
3. In a native module, running on a background thread, the messages to be 
emitted are formatted into specified wire format (currently JSON and Binary -- 
see Formatters below). When this is complete the results can be written 
directly to `stdout`  or a user provided `writable stream` (see Emit Channels 
below). 

With this design the only blocking cost on the main thread for a log operation 
is an enabled check, an immediate check/copy of the message data, and a bulk 
filter copy. This time is much smaller than the format and emit time which then 
happens on an asynchronous background thread -- resulting in a 5x or more 
reduction in performance overhead when compared to `console.log` style logging.

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
2. While this high fidelity logging data is desireable when analyzing an error 
or performance issue for normal execution it is simply clutter that 
unnecessarily takes up and space and complicates other informational log 
analysis tasks. The ability to discard messages as they move to the `emit` 
buffer allows us to eliminate this clutter and only save messages that are 
generally useful and worth longer term storage (say `INFO` or just `WARN`).

### Full Log Write Hooks
To maximize the value of the `in-memory` log ability we support the hooking of 
common failure events and will perform an explicit flush of the full in-memory 
log. The auto-hooked events are:
* Unhandled exception
* Exit with a non-zero exit code

In other cases you may want to programatically (and synchronously) produce a 
full dump of the `in-memory` log. This can be done with the `emitLogSync(FULL, DETAIL)` 
API which synchronously returns the formatted log data as a string (where the 
log can be _fully_ flushed and can include _details_ from all the log messages 
without any filtering). 

### Multi-Level Log Layer Management
Log++ provides a range of settings to control how data is stored and flows 
between the levels in the log and is ultimately emitted.

**Sync vs. Async:** Log++ supports asynchronous logging, for best 
performance and other benefits of multi-level logging, as well as fully 
synchronous logging for simpler debugging and testing scenarios. The mode 
can be set with the `flushMode` option -- either `'ASYNC'` | `'SYNC'` | `'NOP'`. 

The default mode is `'ASYNC'` which enables formatting in the background of 
messages that have been added to the emit worklist. This option provides the 
best performance. The `'SYNC'` mode does synchronous processing of the 
messages in the emit worklist, resulting in higher overhead than the 
`'ASYNC'` mode but, if used in combination with a small `flushCount` and 
time/space constraints on the in-memory buffer provides a fast and consistent 
logging setup. Finally, the `'NOP'` option prevents any implicit processing of 
messages in the `emit` list and let's the user control when they are written 
(e.g., using `emitLogSync`).

**Flush Heuristics:** Log++ provides several parameters to control how much 
data is stored in the in-memory log and how aggressively it is flushed to 
the emit worklist. 

To control how much space the in-memory list consumes Log++ provides two 
parameters:
* Age -- since we want to keep details available in the event of an error or 
other diagnostic need. Any message older 
than the limit is filtered/processed as needed. 
* Size -- since there may be unusual bursts of logging, and we don't want log 
data to excessively displace user info, we also support a maximum number of 
entires (values) in the in-memory log as a failstop. Log++ works to keep the 
number of slots used under this amount.

By default Log++ writes the final formatted results directly into `stdout`. 
However, for applications may also want to send the data to a file or a 
remote server. This can be done by setting the `flushTarget` option as 
`stream` and providing the writable stream as the `stream` option value. 

<!-- 
For the most general case Log++ also supports a callback that is invoked whenever 
a block of data is processed from the `emit` log. This allows the application 
to process this data in whatever manner is appropriate. This is accomplished by 
setting the `flushTarget` as `callback` and providing the desired callback as 
the `flushCallback` option.
-->

## Message Formats and Formatters
The primary mechanism for writing messages in Log++ is to use structured 
formatters. By separating the definition of formats from their use we are able 
to (1) optimize a format which will be repeatedly used and (2) generate a more 
uniform log structure that can be automatically parsed by later analysis tools.

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
* `#logger`    -- name of the logger
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
* `%b`  -- a boolean value
* `%n`  -- a number
* `%s`  -- a string
* `%di` -- a date formatted as iso time format
* `%dl` -- a date formatted as local time format
* `%j`  -- a JavaScript value where objects/arrays are expanded up to 2 levels and 32 items in any level
* `%j<d,l>` -- a JavaScript value where objects/arrays are expanded up to `d` levels (default is 2 and '*' is unlimited) and `l` items in any level (default is 32 and '*' is unlimited)
* `%%` -- a literal %

For objects and arrays the format allows for depth and length limits on the 
expansion. So, a specifier could be `%j` (default expansion), `%j<1,>` (max 
depth of 1 default length), or `%j<2,10>` (max depth 2 max length 10). 
Cycle detection is done by default and noted with a special `"<Cycle>"` token 
in the output. For variables that are not naturally formattable are printed as 
`"<OpaqueValue>"`. 

Some example uses of these in format messages include:
```js
log.addFormat("Number", "A number %n");
log.addFormat("DateLocal", "A date %dl");
log.addFormat("Object", "An object %j");
log.addFormat("ObjectWDepth", "A shallow object %j<1,>");

log.info(log.$Number, 2); // A number 2
log.info(log.$DateLocal, new Date()); // A date "Mon May 07 2018 22:29:55 GMT-0700 (Pacific Daylight Time)"
log.info(log.$Object, {f: 3, g: [1, 2]}); // An object {"f": 3, "g": [1, 2]}
log.info(log.$ObjectWDepth, {f: 3, g: [1, 2]}); // A shallow object {"f": 3, "g": "..."}
```

The general (`j`) format is a catchall that will format a value using the 
default options for whatever the type of the value is.
```js
log.addFormat("General", "Value is %j");

log.info(log.$General, 2); // Value is 2
log.info(log.$General, "ok"); // Value is "ok"
log.info(log.$General, {f: 3}); // Value is {"f": 3}
```

**JSON Message Formats:** 
In addition to classic printf style formats Log++ also supports hybrid JSON 
message formats. In these formats you can place a format specifier in any 
value position. For example:
```js
log.addFormat("Json", {kind: "start", time: "#wallclock", value: "%j"});
log.info(log.$Json, [1, 2]); // {"kind": "start", "time": "2018-05-08T05:29:55.0512Z", "value": [1, 2]}
```

**Standard Prefixs:**
To simplify logging Log++ provides a simple standard `prefix` option that is 
prepended to every message during formatting of the following form:

`LEVEL#CATEGORY @ TIME from HOST::LOGGER_NAME | ` 

This metadata is frequently useful, can be efficiently provided automatically, 
and the builtin support simplifies the job of the logging format specification.

**Format registration:**
Formats can be registered in a number of ways:
* Single programatic registration using the `addFormat` method.
* Bulk registration using the `addFormats` method which takes a JSON object where each property is a format name and value is a format specifier or a string which refers to a JSON file to load the format object from.
* As the `formats` configuration option -- provided as a JSON object or file name to load from. 

### Emit Formats
A common representation for logging data is JSON or newline separated messages. 
By default Log++ uses newline separated UTF8 text with and optional prefix 
followed by the payload contents as specified by the formatter.

[In Progress] Log++ also supports an efficient and compact binary format which 
is faster to process and more space efficient to transport/store. This format 
can be post-processed into human readable text using via the provided command 
line utility `--humanify`.

## Managing Loggers
A key challenge in logging in an ecosystem such as Node.js is the heavy use of 
modules and components. Ideally all of the logging in these frameworks should 
coordinate the levels of active logging, the sink of these logs, and merging 
the message streams. Additionally, the "master" application should be able to 
disable or reduce rates of logging from submodules that are not of interest. 
To support this we introduce the concept of a _root logger_ which is able to 
control all the _sublogger_ actions (and subloggers cannot override these 
settings). Log++ also supports the frequently useful _child logger_ scenario.

### Root Logger and SubLoggers
The _root logger_ is the logger created in the `require.main.file` module 
(i.e., the first loaded file). Each logger is created with a _module name_ and 
all loggers created with the same name share the same logger. The _root logger_ 
can set the emit level, sink, etc. and enable/disable or set levels of 
subloggers explicitly. If not explicitly set subloggers are restricted to 
emitting at the `WARN` level. All messages are merged and managed automatically 
according to the settings of the _root logger_. Consider the following example:
```js
/*app.js*/
const log = require("logpp")("main");
log.addFormat("Hello", "Hello World!!!");

const helper = require("./helper");
helper.doit(); //Emit "Msg2" from sublogger

log.info(log.$Hello); //Emit "Hello World!!!" since we are root logger
```

```js
/*helper.js*/
const log = require("logpp")("sub");

log.addFormat("Msg1", "Msg1");
log.addFormat("Msg2", "Msg2");

function doit() {
    log.setLoggingLevel(log.Levels.DETAIL); //NOP -- not root logger
    log.info(log.$Msg1); //NOP -- subloggers are set to WARN level by default

    log.warn(log.$Msg2); //Processed
}

module.exports.doit = doit;
```

In general the default, of allowing subloggers to emit WARN or higher, 
provides a balance where critical information is logged but (likely) 
irrelevant logging output is suppressed. However, in cases where the logging 
output from a module is of interest, you can explicitly set a sublogger 
configuration from the root logger using the `setSubLoggerLevel` API:
```js
/*app2.js*/
const log = require("logpp")("main");
log.setSubLoggerLevel("sub", log.Levels.INFO); //configure sublogger

const helper = require("./helper");
helper.doit(); //Emit "Msg1" and "Msg2" from sublogger
```

In cases where there is a module with a sublogger that is completely 
uninteresting or that is very noisy you can completely diable the sublogger 
using the `disableSubLogger` API as well.

### Child Loggers
Child loggers provide a simple way to specialize a logger for a particular section 
of an application with a default block of information that is output with each 
log message. For exmaple:
```js
const log = require("logpp")("main");
log.addFormat("Hello", "Hello %s!!!");

function doit(v) {
  const childlog = log.childLogger({arg: v});
  childlog.info(childlog.$Hello, v);
}

doit("Ok"); //Emit {arg:"Ok"} -- "Hello Ok!!!" from child logger 
```

Finally, child loggers can stack -- a child logger may create another child logger. 
In this case we will extend the child logger value with the newly provided info.

## API Specification

### `require("logpp")(NAME, [OPTIONS])`  
  _NAME_ - string that is the name of the logger. If the same name is used in multiple invocations the same logger will be returned. \
  _OPTIONS_ - an object where each property is a configuration option for the created logger.
  * `memoryLevel` - string name of enabled level for in-memory buffer (default `"DETAIL"`).
  * `emitLevel` - string name of enabled level for formatting and emitting (default `"INFO"`).
  * `defaultSubloggerLevel` - string name of level that loggers in submodules memoryLevels are forced to (default `"WARN"`).
  * `flushCount` - number of log messages are added to the in-memory log before attempting to process them (default 64).
  * `flushTarget` - the target output of the processed emit log data `"console"`|`"stream"` (default `"console"`).
  * `flushMode` - how messages are processed for emit `"SYNC"`|`"ASYNC"`|`"NOP"` (default `"ASYNC"`).
  * `flushCallback` - NOT SUPPORTED YET
  * `prefix` - boolean specifying if default prefix is included in all emitted messages (default `true`).
  * `bufferSizeLimit` -- in-memory buffer _size_ threshold for processing, messages may not be flushed if under this limit (default 1024 ~ 16kb).
  * `bufferTimeLimit` -- in-memory _age_ threshold for processing, messages may not be flushed if younger than this limit (default 500ms).
  * `formats` -- JSON object or file name to load formats from (default empty).
  * `categories` -- provided as a JSON object or file name to load category definitions from (default empty).
  * `subloggers` -- provided as a JSON object or file name to load sublogger configurations from (default empty).

The first logger created in the file that matches `require.main.filename` will 
be the _root logger_. Loggers created in modules before the root logger is 
defined are _OFF_ and will be set to their defaults if/when the root logger is 
defined. Loggers created after the root logger is defined will have their 
levels/behavior set according to the root logger configurations and/or defaults.

As buffered/delayed logging output can be confusing during interactive debugging Log++ checks for 
launch with `--inspect` and if detected sets the default `flushCount = 0` and `flushMode = "SYNC"` 
so that all log messages are immediately processed and output.

### `this.setLoggingLevel(LEVEL)`
  _LEVEL_ - the desired level to set for in-memory processing. 
  
Each logger has these values accessible on `this.Levels.LEVEL` (e.g., `log.Levels.INFO`).

### `this.setEmitLevel(LEVEL)`
  _LEVEL_ - the desired level to set for formatting and emit. 
  
Each logger has these values accessible on `this.Levels.LEVEL` (e.g., `log.Levels.INFO`).

### `this.enableCategory(NAME, ENABLED)`
 _NAME_ - the string name of the category to configure.
 _ENABLED_ - the boolean enabled value for the category.

Each logger has these values accessible on `this.$$NAME` (e.g., `log.$$Performance`).

### `this.enableCategories(ARG)`
_ARG_ a JSON object or string filename with JSON object where each property is a category name 
and each value is the enabled value. 

### `this.addFormat(NAME, FORMAT)`
_NAME_ the string name of the format.
_FORMAT_ string sprintf format or JSON Object/Array format object.

Each logger has the formats accessible on `this.$NAME` (e.g., `log.$Hello`).

### `this.addFormats(ARG)`
_ARG_ a JSON object or string filename with JSON object where each property is a format name 
and each value is the format value. 

### `this.setMsgTimeLimit(LIMIT)`
_LIMIT_ the age limit in _ms_ that governs when messages are removed from, and processed if needed, 
the in-memory log.

### `this.setMsgSpaceLimit(LIMIT)`
_LIMIT_ the space limit in slots (1 slot ~16bytes) that governs when messages are removed from, 
and processed if needed, the in-memory log.

### `LOG_FUNCTION(FORMAT, ...ARGS)` and `LOG_FUNCTION(CATEGORY, FORMAT, ...ARGS)`
_LOG_FUNCTION_ - a log level function `fatal` | `error` | `warn` | `info` | `detail` | `debug` | `trace` \
_CATEGORY_ - (optional) the desired category to process this log call with. Each logger has these values accessible as names prefixed with `$$` (e.g., `log.$$CATEGORY`). \
_FORMAT_ - the format to use in generating this message. Multiple format specifications are possible:

* Pre-Defined: Using a format name added previously -- e.g. `log.info(log.$Hello, "World")`
* Explicit String: Creating and using an ad-hoc format string -- e.g. `log.info("Hello %s", "World")`
* Explicit Object or Array: Simple JSON formatting of an _Object_ or _Array_ (other values not supported) -- 
e.g. `log.info({f: 3, ok: true})`

_ARGS_ - the rest of the arguments that are needed by the format specifier.

### `LOG_FUNCTION_COND(COND, FORMAT, ...ARGS)` and `LOG_FUNCTION_COND(COND, CATEGORY, FORMAT, ...ARGS)`
_LOG_FUNCTION_COND_ - a conditional log level function `fatalIf` | `errorIf` | `warnIf` | `infoIf` | `detailIf` | `debugIf` | `traceIf` \
_COND_ a boolean that, if `true`, the message will be processed and, if `false`, is a nop. \

The other args are the same as for the unconditional log method.

### `this.emitLogSync(FULL, DETAIL)`
_FULL_ - true if all messages should be flushed and false if only those over the age/size 
limit are eligible for processing \
_DETAIL_ - true if all messages should be processed regardless of level and false if filtering 
should be applied as usual.

Common uses include:
* `this.emitLogSync(true, true)` all messages are flushed -- good for panic output
* `this.emitLogSync(true, false)` all messages are flushed but filtered -- good for action completed want to drain log
* `this.emitLogSync(true, true)` partial flush with filter -- maybe useful to keep memory use down from buffering?

### `this.setSubLoggerLevel(SUBLOGGER_NAME, LEVEL)`
_SUBLOGGER_NAME_ string name of the sublogger to change the emit level on.
_LEVEL_ the new emit level for the sublogger.

### `this.disableSubLogger(SUBLOGGER_NAME)`
_SUBLOGGER_NAME_ string name of the sublogger to disable -- no output will be generated.

### `this.configureSubloggers(ARG)`
_ARG_ a JSON object or string filename with JSON object with 2 properties -- `enabled` which is a 
JSON object where each property is a sublogger name and each value is the enabled value _and_ 
`disabled` which is a JSON array of names of diabled subloggers. 

### `this.childLogger(PREFIX_DATA)`
_PREFIX_DATA_ a JSON Object that is the prefix data to be associated with all messages emitted 
from the child logger. If there was a previous prefix value this extends it.
