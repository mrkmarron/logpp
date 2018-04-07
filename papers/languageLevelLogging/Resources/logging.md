# Core Logger
This enhancement proposal is focused on adding core logging functionality to the 
Node runtime that will (1) expose basic high performance logging functionality for 
packages such as Bunyan, Winston etc. to build on and (2) expose 
commonly needed information for APM and other vendors to use.

## Design Goals
The major issues this proposal is intended to address are:
1. Lack of high performance logging primitives and fundamental logging challenges.
    1. Cost of writing data to the log -- particularly with data formatted via 
    `util.inspect` and info such as timestamps.
    2. Ongoing tension between log detail when triaging issues and cost of logging 
    large amounts of 'uninteresting' data.
    3. Difficulty in specifying uniform and appropriate logging levels across 
    multiple packages -- and quite possibly multiple logging frameworks.
    4. Parasitic costs of disabled logging statements which still execute code to 
    generate dead logging data (e.g., constructing unused strings).

2. Challenges integrating log data from different sources and difficulty in post processing.
    1. Challenges taking (ill specified logging formats) from multiple frameworks and 
    loading/processing this data in third-party tools.
    2. Difficulty in ensuring all logging data is written to a consistent location 
    across multiple packages -- and quite possibly multiple logging frameworks.

2. Multiple custom implementations of code to log/monitor core library events.
    1. Multiple vendors monkey-patch or ship custom Node runtimes to track 
    transaction ids, such as async context and HTTP requests, and to log relevant 
    events in the core libraries.
    2. Integration of logging messages with high performance tracing data or 
    http send/receive timestamps into a consistently ordered timeline -- 
    upcoming v8-tracing support into and microservice constellations.

Addressing these issues will (1) place Node as the runtime with the **most** advanced 
and useful set of logging tools, beyond either Java or C#, to further confirm its 
position as **the premier** runtime for cloud development and (2) provide a core set 
of fundamental operations that will allow the community to invest in building innovative 
tools on top of Node instead of spending time on custom/internal patches for the 
Node runtime.

## Candidate Implementation Highlights:
1. High performance -- 5x to 100x faster than existing loggers (w/ native support).
2. Dual level logging -- in-memory ring buffer level for triage/disk-write level for general analysis.
3. Uniform and centralized control of logging levels and merged output streams.
4. Reduced overhead from 'disabled' logging code.
5. Uniform and defined message formats for easy importing/processing by later analytic tools.
6. Elimination of need for common custom runtime hooks.

## Candidate Implementation
To address these issues we are proposing to extend the Node runtime with a core set 
of logging operations. A very early candidate design/implementation has been 
prototyped [here](https://github.com/mrkmarron/NativeLogger) with experimental 
native runtime support [here](https://github.com/mrkmarron/ChakraCore/tree/FastLog). 

For the purposes of this initial proposal we will focus on a conceptual example of 
how this design would work on a simple 
[program](https://github.com/mrkmarron/NativeLogger/tree/master/loggerConcept) which 
uses a helper module in a simple hello world server app. 

### Logging Module Instantiation and Configuration
We begin by looking at how a user would instantiate a module:
```
let logger = require('logging')({
    moduleName: 'foo', //Name we are giving to this logger (all requires that use same name get same logger object)
    srcFile: __filename, //Name of the source file this logger is being required in
    writeLevel: 'WARN', //The log-level that we write out at (to disk or console)
    logLevel: 'TRACE'  //The log-level that is saved into the memory buffer
});
```
In our conceptual prototype the logger module require provides a single function that 
will generate the logger object. Based on the `moduleName` provided by the user they 
can control if the returned module is a unique object or shared by code in a seperate 
file (but that conceptually implements the same module functionality). 

The configuration allows a user to specify **2** logging levels. The `logLevel` specifies 
at which level messages are written to **an in-memory ring buffer** while the `writeLevel` 
specifies at which level these messages are **written to disk**. This allows us to log at 
a higher detail level, which can be dumped for triaging if an error is encountered, 
while writing a much smaller amount of data to storage for longer term use. This serves 
to address both _1.2_ and help with _1.1_.

We distinguish between the **top-level logger**, which corresponds to the logger 
created by `main.filename` and has special functionality, and **sub-loggers** loaded 
by other modules. Outside of limited circumstances we are not as interested in the 
output of logging from modules we have required into our application so, by default, 
they have their `logLevel` and `writeLevel` set to `WARN`. These can overridden globally 
or on a per-module basis by the main logger. This functionality addresses _1.3_.

We currently do not have a comprehensive story around setting log sinks, console, file, 
network, cloud storage. But presumably there needs to be some support so we can merge 
logging data from all sources/frameworks into a single stream to address _2.2_.

### Log Message Formats
To simplify the task of parsing/loading log data into other systems we propose lifting 
the specification of message formats out of individual `log(...)` calls into format 
specification/configuration code and providing easy to use format string & format object options. 
```
logger.addMsgFormats({
    //A printf style format specifier that takes a string and auto expands the module_name and walltime macros
    argError: {format: "An call argument was missing or invalid in ${0:s} in #module_name at #walltime!"},

    //A printf style format specifier that takes two args formatting the first as a string ${0:s} and the second as a JSON style object
    callArgTrace: {format: "Calling function ${0:s} with ${1:g}"}
});
```
or
```
logger.addMsgFormats({
    //A json format specifier that logs the start of a http request -- uses auto traced macros for current request_id and time
    //also mixes literal json constructs and nested objects/arrays.
    requestBegin: {kind: 'begin', format: {reqid: '#request_id', time: '#walltime', info: {requrl: '${0:g}', srcIp: '${1:s}'}}},
    requestEnd: {kind: 'end', format: {reqid: '#request_id', time: '#walltime', status: '${0:s}'}}
});
```

We may also want to allow a developer to specify a common prefix for all messages on 
the logger:
```
logger.setPrefix("host_ip: #ip_addr timestamp: #walltime ");
```

By separating the format out we can (1) pre-process the format messages for faster 
processing at the `log(...)` calls, (2) encourage developers to provide a uniform format 
and, (3) implicitly provide a message schema that we can export for third-party log 
analysis tools to use as well. The ability so use a simple JSON format specifier is 
also likely to enhance the well-formedness of messages over simple format strings. Thus, 
addressing item _2.1_ and helping with _1.1_.

By setting up the message formats in a way that discourages the construction of explicit 
objects to pass to the logger, `logger.debug({kind: 'bad arg' function: 'foo', arg: arg1.toString()}); `, 
we can reduce the parasitic losses of computing dead logging data. Additionally, by providing 
format macros for commonly accessed data, `#walltime`, `#ip_addr`, etc. we can reduce the 
amount of explicit computation that needs to be done _before_ a call to the log function. 
These features reduce the parasitic costs of disabled logging code, item _1.4_, reduce overall 
logging costs to help with item _1.1_ and standardizing them opens the possibility of special 
optimization in v8/ChakraCore.

### Logging Calls
With the preceeding setup we can make calls to the logging functions as follows:
```
logger.trace(logger.callArgTrace, 'printDigits');
```
or
```
logger.trace(logger.requestBegin, req.url, req.connection.remoteAddress);
```
These logging messages will resolve the format information from the logger object, e.g., 
`logger.callArgTrace`, expand any macros, and use the arguments passed by the user to 
produce the log output. In our implementation we split the log operation into 2 phases:
1. Store enough data to the ring buffer to format the message as intended. Since many kinds 
of values in JavaScript are immutable, e.g., strings, we can simply save a reference to them 
into our ring buffer (instead of copying the full contents). 
2. When needed use the format string and the data we saved to format the actual message into 
the output buffer. Ideally this would have runtime support, such as v8 tracing, and potentially 
be done in a background thread.

These implementation choices lead to very low cost on the main thread to process the log call 
and address item _1.1_.

In addition to the standard suite of unconditional log statements we also propose a suite of 
predicated log functions to reduce the amount of logging specific conditional code that a 
developer must write. 
```
//Log the warning message with the format 'argError' if the condition is true -- help reduce branch logic clutter
logger.warnOn(typeof(arg) !== 'number', logger.argError, 'printDigits', arg);
```

### Core Library Logging
The final component of the core logging proposal is the integration into the core libraries 
and exposure of core information to users of the logging framework. We have not done an 
extensive investigation of where/what calls need to be put in place and there will need to 
be discussion about what the approprate locations are. To enable async context tracking we 
propose integrating with the async wrap code. Both of these issues will be explored via 
prototype implementations once the core API has had a more extensive review and is stabilizing. 
Implementing these features will address item _3.1_.

As an additional goal we would also like to investigate a standardized representation of a 
distributed timestamping scheme. One version for local & totally orderable events in other streams 
such as v8 tracing or ETW/DTrace and a second version for distributed partially orderable 
events that can be correlated via vector clocks. This will address item _3.2_ and can serve to 
establish a log interchange format for logging frameworks that span client-side code or logs 
from other languages/runtimes (such as Java or C#).
