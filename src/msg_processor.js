"use strict";

const assert = require("assert");
const core = require("./core");

/**
 * The number of entries we have in a msg block.
 */
const s_msgBlockSize = 1024;

//internal function for allocating a block
function createMsgBlock(previousBlock) {
    const nblock = {
        count: 0,
        tags: new Uint8Array(s_msgBlockSize),
        data: new Array(s_msgBlockSize),
        next: null,
        previous: previousBlock,
        partialPos: 0,
        dataSize: -1
    };

    if (previousBlock) {
        previousBlock.next = nblock;
    }

    return nblock;
}

/**
 * BlockList constructor
 * @constructor
 */
function BlockList() {
    this.head = createMsgBlock(null);
    this.tail = this.head;
    this.jsonCycleMap = new Set();
}

/**
 * Clear the contents of the block list
 * @method
 */
BlockList.prototype.clear = function () {
    this.head.tags.fill(/*LogEntryTags_Clear*/0x0, this.head.count);
    this.head.data.fill(undefined, this.head.count);
    this.head.count = 0;
    this.head.next = null;

    this.tail = this.head;
};

/**
 * Remove the head block data from this list
 * @method
 */
BlockList.prototype.removeHeadBlock = function () {
    if (this.head.next == null) {
        this.clear();
    }
    else {
        this.head = this.head.next;
        this.head.previous = null;
    }
};

/**
 * Add an entry to the message block
 * @method
 * @param {number} tag the tag for the entry
 * @param {*} data the data value for the entry
 */
BlockList.prototype.addEntry = function (tag, data) {
    let block = this.tail;
    if (block.count === s_msgBlockSize) {
        block = createMsgBlock(block);
        this.tail = block;
    }

    block.tags[block.count] = tag;
    block.data[block.count] = data;
    block.count++;
};

/**
 * Add an entry to the message block that has the common JsVarValue tag
 * @method
 * @param {*} data the data value for the entry
 */
BlockList.prototype.addJsVarValueEntry = function (data) {
    let block = this.tail;
    if (block.count === s_msgBlockSize) {
        block = createMsgBlock(block);
        this.tail = block;
    }

    block.tags[block.count] = /*LogEntryTags_JsVarValue*/0xB;
    block.data[block.count] = data;
    block.count++;
};

/**
 * Add an entry to the message block that has no extra data
 * @method
 * @param {number} tag the tag value for the entry
 */
BlockList.prototype.addTagOnlyEntry = function (tag) {
    let block = this.tail;
    if (block.count === s_msgBlockSize) {
        block = createMsgBlock(block);
        this.tail = block;
    }

    block.tags[block.count] = tag;
    block.count++;
};

/**
 * Add functions to process general values via lookup on typeid number in prototype array
 */
const AddGeneralValue_RemainingTypesCallTable = new Array(/*TypeNameEnum_TypeLimit*/0x3C);
AddGeneralValue_RemainingTypesCallTable.fill(null);

AddGeneralValue_RemainingTypesCallTable[/*TypeNameEnum_TDate*/0x36] = function (blockList, value, depth) {
    blockList.addJsVarValueEntry(new Date(value));
};
AddGeneralValue_RemainingTypesCallTable[/*TypeNameEnum_TFunction*/0x37] = function (blockList, value, depth) {
    blockList.addJsVarValueEntry("[ #Function# " + value.name + " ]");
};

AddGeneralValue_RemainingTypesCallTable[/*TypeNameEnum_TObject*/0x38] = function (blockList, value, depth) {
    blockList.addExpandedObject(value, depth, /*ExpandDefaults_ObjectLength*/1024);
};
AddGeneralValue_RemainingTypesCallTable[/*TypeNameEnum_TJsArray*/0x39] = function (blockList, value, depth) {
    blockList.addExpandedArray(value, depth, /*ExpandDefaults_ArrayLength*/128);
};
AddGeneralValue_RemainingTypesCallTable[/*TypeNameEnum_TTypedArray*/0x3A] = function (blockList, value, depth) {
    blockList.addExpandedArray(value, depth, /*ExpandDefaults_ArrayLength*/128);
};

AddGeneralValue_RemainingTypesCallTable[/*TypeNameEnum_TUnknown*/0x3B] = function (blockList, value, depth) {
    blockList.addTagOnlyEntry(/*LogEntryTags_OpaqueValue*/0xF);
};

/**
 * Add an expanded object value to the log
 * @method
 * @param {Object} obj the object to expand into the log
 * @param {number} depth the max depth to recursively expand the object
 * @param {number} length the max number of properties to expand
 */
BlockList.prototype.addExpandedObject = function (obj, depth, length) {
    //if the value is in the set and is currently processing
    if (this.jsonCycleMap.has(obj)) {
        this.addTagOnlyEntry(/*LogEntryTags_CycleValue*/0xD);
        return;
    }

    if (depth === 0) {
        this.addTagOnlyEntry(/*LogEntryTags_OpaqueValue*/0xF);
    }
    else {
        //Set processing as true for cycle detection
        this.jsonCycleMap.add(obj);
        this.addTagOnlyEntry(/*LogEntryTags_LParen*/0x5);

        let allowedLengthRemain = length;
        for (const p in obj) {
            this.addEntry(/*LogEntryTags_PropertyRecord*/0x9, p);

            const value = obj[p];
            const typeid = core.getTypeNameEnum(value);
            if (typeid <= /*TypeNameEnum_LastImmutableType*/0x35) {
                this.addJsVarValueEntry(value);
            }
            else {
                (AddGeneralValue_RemainingTypesCallTable[typeid])(this, value, depth);
            }

            allowedLengthRemain--;
            if (allowedLengthRemain <= 0) {
                this.addTagOnlyEntry(/*LogEntryTags_LengthBoundHit*/0xC);
                break;
            }
        }

        //Set processing as false for cycle detection
        this.jsonCycleMap.delete(obj);
        this.addTagOnlyEntry(/*LogEntryTags_RParen*/0x6);
    }
};

/**
 * Add an expanded array value to the log
 * @method
 * @param {Array} obj the array to expand into the log
 * @param {number} depth the max depth to recursively expand the array
 * @param {number} length the max number of index entries to expand
 */
BlockList.prototype.addExpandedArray = function (obj, depth, length) {
    //if the value is in the set and is currently processing
    if (this.jsonCycleMap.has(obj)) {
        this.addTagOnlyEntry(/*LogEntryTags_CycleValue*/0xD);
        return;
    }

    if (depth === 0) {
        this.addTagOnlyEntry(/*LogEntryTags_OpaqueValue*/0xF);
    }
    else {
        //Set processing as true for cycle detection
        this.jsonCycleMap.add(obj);
        this.addTagOnlyEntry(/*LogEntryTags_LBrack*/0x7);

        for (let i = 0; i < obj.length; ++i) {
            const value = obj[i];
            const typeid = core.getTypeNameEnum(value);
            if (typeid <= /*TypeNameEnum_LastImmutableType*/0x35) {
                this.addJsVarValueEntry(value);
            }
            else {
                (AddGeneralValue_RemainingTypesCallTable[typeid])(this, value, depth);
            }

            if (i >= length) {
                this.addTagOnlyEntry(/*LogEntryTags_LengthBoundHit*/0xC);
                break;
            }
        }

        //Set processing as false for cycle detection
        this.jsonCycleMap.delete(obj);
        this.addTagOnlyEntry(/*LogEntryTags_RBrack*/0x8);
    }
};

/**
 * Get the caller info for this call to logMsg -- where the caller is k callframes up.
 */
function getCallerLineInfo(env) {
    const errstk = new Error()
        .stack
        .split("\n")
        .slice(2)
        .map((frame) => frame.substring(frame.indexOf("(") + 1, frame.lastIndexOf(")")))
        .filter((frame) => !frame.includes(env.logger_path) && !frame.includes(env.msg_path));

    return errstk;
}

//Explicitly get these values here to avoid repeated lookup in logMessage loop

BlockList.prototype.processImmutableHelper = function (valueok, value) {
    if (valueok) {
        this.addJsVarValueEntry(value);
    }
    else {
        this.addTagOnlyEntry(/*LogEntryTags_JsBadFormatVar*/0xA);
    }
};

BlockList.prototype.processDateHelper = function (vtype, value) {
    if (vtype === /*TypeNameEnum_TDate*/0x36) {
        this.addJsVarValueEntry(value);
    }
    else {
        this.addTagOnlyEntry(/*LogEntryTags_JsBadFormatVar*/0xA);
    }
};

/**
 * Log a message into the logger
 * @method
 * @param {Object} env a record with the info for certain environment/expando formatter entries
 * @param {number} level the level the message is being logged at
 * @param {string} category the category the message is being logged at
 * @param {bool} doTimestamp if we want to include an internal timestamp in the log
 * @param {Object} fmt the format of the message
 * @param {Array} args the arguments for the format message
 */
BlockList.prototype.logMessage = function (env, level, category, doTimestamp, fmt, args) {
    this.addEntry(/*LogEntryTags_MsgFormat*/0x1, fmt);
    this.addEntry(/*LogEntryTags_MsgLevel*/0x2, level);
    this.addEntry(/*LogEntryTags_MsgCategory*/0x3, category);

    if (doTimestamp) {
        this.addEntry(/*LogEntryTags_MsgWallTime*/0x10, Date.now());
    }

    let incTimeStamp = false;
    for (let i = 0; i < fmt.formatterArray.length; ++i) {
        const formatEntry = fmt.formatterArray[i];
        const formatSpec = formatEntry.format;

        if (formatSpec.kind === /*FormatStringEntryKind_Literal*/0x1) {
            //don't need to do anything!
        }
        else if (formatSpec.kind === /*FormatStringEntryKind_Expando*/0x2) {
            const specEnum = formatSpec.enum;
            if (specEnum === /*SingletonFormatStringEntry_SOURCE*/0x15) {
                this.addJsVarValueEntry(getCallerLineInfo(env));
            }
            else if (specEnum === /*SingletonFormatStringEntry_WALLCLOCK*/0x16) {
                this.addJsVarValueEntry(Date.now());
            }
            else if (specEnum === /*SingletonFormatStringEntry_TIMESTAMP*/0x17) {
                this.addJsVarValueEntry(env.TIMESTAMP);
                incTimeStamp = true;
            }
            else {
                this.addJsVarValueEntry(env[formatSpec.name]);
            }
        }
        else {
            if (formatEntry.argPosition >= args.length) {
                //We hit a bad format value so rather than let it propigate -- report and move on.
                this.addTagOnlyEntry(/*LogEntryTags_JsBadFormatVar*/0xA);
            }
            else {
                const value = args[formatEntry.argPosition];
                const vtype = core.getTypeNameEnum(value);

                switch (formatSpec.enum) {
                    case /*SingletonFormatStringEntry_BOOL*/0x22:
                        this.processImmutableHelper(vtype === /*TypeNameEnum_TBoolean*/0x33, value);
                        break;
                    case /*SingletonFormatStringEntry_NUMBER*/0x23:
                        this.processImmutableHelper(vtype === /*TypeNameEnum_TNumber*/0x34, value);
                        break;
                    case /*SingletonFormatStringEntry_STRING*/0x24:
                        this.processImmutableHelper(vtype === /*TypeNameEnum_TString*/0x35, value);
                        break;
                    case /*SingletonFormatStringEntry_DATEISO*/0x25:
                    case /*SingletonFormatStringEntry_DATEUTC*/0x26:
                    case /*SingletonFormatStringEntry_DATELOCAL*/0x27:
                        this.processDateHelper(vtype, value);
                        break;
                    case /*SingletonFormatStringEntry_OBJECT*/0x29:
                        if (vtype === /*TypeNameEnum_TObject*/0x38) {
                            this.addExpandedObject(value, formatEntry.depth, formatEntry.length);
                        }
                        else {
                            this.addTagOnlyEntry(/*LogEntryTags_JsBadFormatVar*/0xA);
                        }
                        break;
                    case /*SingletonFormatStringEntry_ARRAY*/0x2A:
                        if (vtype === /*TypeNameEnum_TJsArray*/0x39 || vtype === /*TypeNameEnum_TTypedArray*/0x3A) {
                            this.addExpandedArray(value, formatEntry.depth, formatEntry.length);
                        }
                        else {
                            this.addTagOnlyEntry(/*LogEntryTags_JsBadFormatVar*/0xA);
                        }
                        break;
                    default:
                        if (vtype <= /*TypeNameEnum_LastImmutableType*/0x35) {
                            this.addJsVarValueEntry(value);
                        }
                        else {
                            (AddGeneralValue_RemainingTypesCallTable[vtype])(this, vtype, value, formatEntry.depth);
                        }
                        break;
                }
            }
        }
    }

    if (incTimeStamp) {
        env.TIMESTAMP++;
    }

    this.addTagOnlyEntry(/*LogEntryTags_MsgEndSentinal*/0x4);
};

/**
 * Check if the message (starting at this[cpos]) is enabled for writing at the given level
 * @function
 * @param {Object} cblock the current block we are processing
 * @param {number} enabledLevel the logging level we want to retain
 * @param {Object} enabledCategories the logging category we want to see if is enabled
 * @returns {bool}
 */
function isEnabledForWrite(cblock, enabledLevel, enabledCategories) {
    let levelblock = cblock;
    let levelpos = cblock.partialPos + 1;
    if (levelpos === levelblock.count) {
        levelblock = levelblock.next;
        levelpos = 0;
    }

    const loglevel = levelblock.data[levelpos];
    if ((loglevel & enabledLevel) !== loglevel) {
        return false;
    }

    let categoryblock = levelblock;
    let categorypos = levelpos + 1;
    if (categorypos === categoryblock.count) {
        categoryblock = categoryblock.next;
        categorypos = 0;
    }

    return enabledCategories[categoryblock.data[categorypos]];
}

/**
 * Update the size information in a blocklist
 */
function updateBlocklistSizeInfo(iblock) {
    let total = 0;

    for (let cblock = iblock; cblock !== null; cblock = cblock.next) {
        if (cblock.count === s_msgBlockSize && cblock.dataSize === -1) {
            let size = s_msgBlockSize * 6; //backbone size
            for (let pos = 0; pos < s_msgBlockSize; ++pos) {
                const data = cblock.data[pos];
                if (data === undefined || data === null) {
                    //no extra size
                }
                else {
                    const jstype = typeof (data);
                    if (jstype === "string") {
                        size += data.length;
                    }
                }
            }
            cblock.dataSize = size;
        }

        if (cblock.dataSize !== -1) {
            total += cblock.dataSize;
        }
    }

    return total;
}

function processSingleMessageForWrite_Helper(iblock, pendingWriteBlockList) {
    let cblock = iblock;
    while (cblock.tags[cblock.partialPos] !== /*LogEntryTags_MsgEndSentinal*/0x4) {
        if (cblock.partialPos < cblock.count) {
            pendingWriteBlockList.addEntry(cblock.tags[cblock.partialPos], cblock.data[cblock.partialPos]);
            cblock.partialPos++;
        }
        else {
            assert(cblock.next !== null, "We failed to complete formatting this message?");
            cblock = cblock.next;
        }
    }
    pendingWriteBlockList.addEntry(cblock.tags[cblock.partialPos], cblock.data[cblock.partialPos]);
    cblock.partialPos++;

    return cblock;
}

function processSingleMessageForDiscard_Helper(iblock) {
    let cblock = iblock;
    while (cblock.tags[cblock.partialPos] !== /*LogEntryTags_MsgEndSentinal*/0x4) {
        if (cblock.partialPos < cblock.count) {
            cblock.partialPos++;
        }
        else {
            assert(cblock.next !== null, "We failed to complete formatting this message?");
            cblock = cblock.next;
        }
    }
    cblock.partialPos++;

    return cblock;
}

function isSizeBoundOk(iblock, sizeLimit) {
    return updateBlocklistSizeInfo(iblock) < sizeLimit;
}

function isTimeBoundOk(iblock, timeLimit, now) {
    const tpos = iblock.partialPos + 3;
    if (tpos < iblock.count) {
        assert(iblock.tags[tpos] === /*LogEntryTags_MsgWallTime*/0x10, "Missing timestamp?");
        return (now - iblock.data[tpos]) < timeLimit;
    }
    else {
        const nblock = iblock.next;
        const npos = tpos % iblock.count;

        assert(nblock.tags[tpos] === /*LogEntryTags_MsgWallTime*/0x10, "Missing timestamp?");
        return (now - nblock.data[npos]) < timeLimit;
    }
}

/**
 * Filter out all the msgs that we want to drop when writing to disk and copy them to the pending write list -- use sizeLimit to manage data processing rolling buffer.
 * @method
 * @param {Object} retainLevel the logging level to retain at
 * @param {Object} retainCategories the logging category we want to retain
 * @param {Object} pendingWriteBlockList the block list to add into
 * @param {number} sizeLimit is the amount of in-memory logging we are ok with
 */
BlockList.prototype.processMessagesForWrite_SizeRing = function (retainLevel, retainCategories, pendingWriteBlockList, sizeLimit) {
    let cblock = this.head;
    let keepProcessing = true;
    while (keepProcessing) {
        const nblock = isEnabledForWrite(cblock, retainLevel, retainCategories) ? processSingleMessageForWrite_Helper(cblock, pendingWriteBlockList) : processSingleMessageForDiscard_Helper(cblock, pendingWriteBlockList);
        if (nblock !== cblock) {
            //We can go under on memory usage so do this check per block written
            keepProcessing = isSizeBoundOk(nblock, sizeLimit);
            cblock = nblock;
        }
    }

    while (this.head !== cblock) {
        this.removeHeadBlock();
    }
};

/**
 * Filter out all the msgs that we want to drop when writing to disk and copy them to the pending write list -- use timeLimit to manage data processing rolling buffer.
 * @method
 * @param {Object} retainLevel the logging level to retain at
 * @param {Object} retainCategories the logging category we want to retain
 * @param {Object} pendingWriteBlockList the block list to add into
 * @param {number} timeLimit is the amount of in-memory time we are ok with
 */
BlockList.prototype.processMessagesForWrite_TimeRing = function (retainLevel, retainCategories, pendingWriteBlockList, timeLimit) {
    const now = Date.now();

    let cblock = this.head;
    let keepProcessing = true;
    while (keepProcessing) {
        const nblock = isEnabledForWrite(cblock, retainLevel, retainCategories) ? processSingleMessageForWrite_Helper(cblock, pendingWriteBlockList) : processSingleMessageForDiscard_Helper(cblock, pendingWriteBlockList);

        //We want to keep close to time bound in memory -- so check this per entry write instead of per block (as for memory)
        keepProcessing = isTimeBoundOk(nblock, timeLimit, now);
        if (nblock !== cblock) {
            cblock = nblock;
        }
    }

    while (this.head !== cblock) {
        this.removeHeadBlock();
    }
};

/**
 * Filter out all the msgs that we want to drop when writing to disk and copy them to the pending write list -- process all records.
 * @method
 * @param {Object} retainLevel the logging level to retain at
 * @param {Object} retainCategories the logging category we want to retain
 * @param {Object} pendingWriteBlockList the block list to add into
 */
BlockList.prototype.processMessagesForWrite_HardFlush = function (retainLevel, retainCategories, pendingWriteBlockList) {
    let cblock = this.head;
    while (cblock !== null) {
        if (isEnabledForWrite(cblock, retainLevel, retainCategories)) {
            cblock = processSingleMessageForWrite_Helper(cblock, pendingWriteBlockList);
        }
        else {
            cblock = processSingleMessageForDiscard_Helper(cblock, pendingWriteBlockList);
        }
    }

    this.clear();
};





/**
 * Constructor for a blockList emitter (creates string per entry at a time -- use with writters later)
 * @constructor
 * @param {Object} writer for the data
 */
function Emitter(writer) {
    this.blockList = null;
    this.output = "";
}

Emitter.prototype.emitJsString = function (str) {
    this.output += "\"" + str + "\"";
};

/**
 * Emit a simple var (JsVarValue tag)
 * @method
 * @param {Object} value
 */
Emitter.prototype.emitSimpleVar = function (value) {
    if (value === undefined) {
        this.output += "undefined";
    }
    else if (value === null) {
        this.output += "null";
    }
    else {
        this.output += value.toString();
    }
};

/**
 * Emit a special var as indicated by the tag
 * @method
 * @param {number} tag
 */
Emitter.prototype.emitSpecialVar = function (tag) {
    switch (tag) {
        case LogEntryTags_JsBadFormatVar:
            this.output += "\"<BadFormat>\"";
            break;
        case LogEntryTags_LengthBoundHit:
            this.output += "\"<LengthBoundHit>\"";
            break;
        case LogEntryTags_CycleValue:
            this.output += "\"<Cycle>\"";
            break;
        default:
            this.output += "\"<Value>\"";
            break;
    }
};

/**
 * Append a new blocklist into the current one in this emitter
 * @method
 * @param {BlockList} blockList the data to add to the emitter worklist
 */
Emitter.prototype.appendBlockList = function (blockList) {
    if (this.blockList === null) {
        if (blockList.head.count !== 0) {
            this.blockList = blockList;
            this.block = blockList.head;
            this.pos = 0;
        }
    }
    else {
        assert(false, 'Need to add append code here!!!');
    }
}

/**
 * Emit a single formatted message.
 * @method
 * @param {Object} fmt the format entry we want to output
 */
Emitter.prototype.emitFormatEntry = function (fmt) {
    const formatArray = fmt.formatterArray;
    const tailingFormatSegmentArray = fmt.tailingFormatStringSegmentArray;
    let formatIndex = 0;

    while (this.block.tags[this.pos] !== LogEntryTags_MsgEndSentinal) {
        const tag = this.block.tags[this.pos];

        if (tag === LogEntryTags_MsgLevel) {
            const data = this.block.data[this.pos];
            this.writer.emitMsgStart(fmt.formatName);

            this.writer.emitFullString('level: ');
            this.writer.emitFullString(data.label);

            this.writer.emitFullString(', msg: ')
            this.writer.emitFullString(fmt.initialFormatStringSegment);

            this.advancePosition();
        }
        else {
            if (tag === LogEntryTags_LParen) {
                this.emitObjectEntry();
                //position is advanced in call
            }
            else if (tag === LogEntryTags_LBrack) {
                this.emitArrayEntry();
                //position is advanced in call
            }
            else {
                const data = this.block.data[this.pos];
                const formatEntry = formatArray[formatIndex];
                const formatSpec = formatEntry.format;

                if (formatSpec.kind === FormatStringEntryKind_Literal) {
                    this.writer.emitChar(formatEntry === FormatStringEntrySingletons.LITERAL_HASH ? '#' : '$');
                }
                else if (formatSpec.kind === FormatStringEntryKind_Expando) {
                    if (formatSpec.enum <= FormatStringEntrySingleton_LastMacroInfoExpandoEnum) {
                        this.writer.emitFullString(data.toString());
                    }
                    else {
                        if (formatSpec === FormatStringEntrySingletons.MSG_NAME) {
                            this.writer.emitFullString(data.toString());
                        }
                        else {
                            this.writer.emitFullString(new Date(data).toISOString());
                        }
                    }
                }
                else {
                    if (tag === LogEntryTags_JsVarValue) {
                        this.emitSimpleVar(data);
                    }
                    else {
                        this.emitSpecialVar(tag);
                    }
                }

                this.advancePosition();
            }

            this.writer.emitFullString(tailingFormatSegmentArray[formatIndex]);
            formatIndex++;
        }
    }

    this.writer.emitMsgEnd();
    this.advancePosition();
}

/**
 * Emit an object entry
 * @method
 */
Emitter.prototype.emitObjectEntry = function () {
    this.writer.emitChar('{');
    this.advancePosition();

    let skipComma = true;
    while (this.block.tags[this.pos] !== LogEntryTags_RParen) {
        assert(this.block.tags[this.pos] === LogEntryTags_PropertyRecord, 'In an object entry but no property name???');

        if (skipComma) {
            skipComma = false;
        }
        else {
            this.writer.emitFullString(', ');
        }
        this.emitJsString(this.block.data[this.pos]);
        this.writer.emitFullString(': ');

        this.advancePosition();

        const tag = this.block.tags[this.pos];
        if (tag === LogEntryTags_LParen) {
            this.emitObjectEntry();
        }
        else if (tag === LogEntryTags_LBrack) {
            this.emitArrayEntry();
        }
        else {
            if (tag === LogEntryTags_JsVarValue) {
                this.emitSimpleVar(this.block.data[this.pos]);
            }
            else {
                this.emitSpecialVar(tag);
            }

            this.advancePosition();
        }
    }

    this.writer.emitChar('}');
    this.advancePosition();
}

/**
 * Emit an array entry
 * @method
 */
Emitter.prototype.emitArrayEntry = function () {
    this.writer.emitChar('[');
    this.advancePosition();

    let skipComma = true;
    while (this.block.tags[this.pos] !== LogEntryTags_RParen) {
        if (skipComma) {
            skipComma = false;
        }
        else {
            this.writer.emitFullString(', ');
        }

        const tag = this.block.tags[this.pos];
        if (tag === LogEntryTags_LParen) {
            this.emitObjectEntry();
        }
        else if (tag === LogEntryTags_LBrack) {
            this.emitArrayEntry();
        }
        else {
            if (tag === LogEntryTags_JsVarValue) {
                this.emitSimpleVar(this.block.data[this.pos]);
            }
            else {
                this.emitSpecialVar(tag);
            }

            this.advancePosition();
        }
    }

    this.writer.emitChar(']');
    this.advancePosition();
};
