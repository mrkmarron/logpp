"use strict";

//const core = require("./core");

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
        previous: previousBlock
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
    this.head.tags.fill(/*LogEntryTags_Clear*/ 0x0, this.head.count);
    this.head.data.fill(undefined, this.head.count);
    this.head.count = 0;
    this.head.next = null;

    this.tail = this.head;
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

    block.tags[block.count] = /*LogEntryTags_JsVarValue*/ 0xB;
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
const AddGeneralValue_RemainingTypesCallTable = new Array(core.TypeNameEnum.TypeCount);
AddGeneralValue_RemainingTypesCallTable.fill(null);

AddGeneralValue_RemainingTypesCallTable[core.TypeNameEnum.TDate] = function (blockList, value, depth) {
    blockList.addJsVarValueEntry(new Date(value));
};
AddGeneralValue_RemainingTypesCallTable[core.TypeNameEnum.TFunction] = function (blockList, value, depth) {
    blockList.addJsVarValueEntry("[ #Function# " + value.name + " ]");
};

AddGeneralValue_RemainingTypesCallTable[core.TypeNameEnum.TObject] = function (blockList, value, depth) {
    blockList.addExpandedObject(value, depth, core.ExpandDefaults.ObjectLength);
};
AddGeneralValue_RemainingTypesCallTable[core.TypeNameEnum.TJsArray] = function (blockList, value, depth) {
    blockList.addExpandedArray(value, depth, core.ExpandDefaults.ArrayLength);
};
AddGeneralValue_RemainingTypesCallTable[core.TypeNameEnum.TTypedArray] = function (blockList, value, depth) {
    blockList.addExpandedArray(value, depth, core.ExpandDefaults.ArrayLength);
};

AddGeneralValue_RemainingTypesCallTable[core.TypeNameEnum.TUnknown] = function (blockList, value, depth) {
    blockList.addTagOnlyEntry(/*LogEntryTags_OpaqueValue*/ 0xF);
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
        this.addTagOnlyEntry(/*LogEntryTags_CycleValue*/ 0xD);
        return;
    }

    if (depth === 0) {
        this.addTagOnlyEntry(/*LogEntryTags_OpaqueValue*/ 0xF);
    }
    else {
        //Set processing as true for cycle detection
        this.jsonCycleMap.add(obj);
        this.addTagOnlyEntry(/*LogEntryTags_LParen*/ 0x5);

        let allowedLengthRemain = length;
        for (const p in obj) {
            this.addEntry(/*LogEntryTags_PropertyRecord*/ 0x9, p);

            const value = obj[p];
            const typeid = core.getTypeNameEnum(value);
            if (typeid <= core.TypeNameEnum.LastImmutableType) {
                this.addJsVarValueEntry(value);
            }
            else {
                (AddGeneralValue_RemainingTypesCallTable[typeid])(this, value, depth);
            }

            allowedLengthRemain--;
            if (allowedLengthRemain <= 0) {
                this.addTagOnlyEntry(/*LogEntryTags_LengthBoundHit*/ 0xC);
                break;
            }
        }

        //Set processing as false for cycle detection
        this.jsonCycleMap.delete(obj);
        this.addTagOnlyEntry(/*LogEntryTags_RParen*/ 0x6);
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
        this.addTagOnlyEntry(/*LogEntryTags_CycleValue*/ 0xD);
        return;
    }

    if (depth === 0) {
        this.addTagOnlyEntry(/*LogEntryTags_OpaqueValue*/ 0xF);
    }
    else {
        //Set processing as true for cycle detection
        this.jsonCycleMap.add(obj);
        this.addTagOnlyEntry(/*LogEntryTags_LBrack*/ 0x7);

        for (let i = 0; i < obj.length; ++i) {
            const value = obj[i];
            const typeid = core.getTypeNameEnum(value);
            if (typeid <= core.TypeNameEnum.LastImmutableType) {
                this.addJsVarValueEntry(value);
            }
            else {
                (AddGeneralValue_RemainingTypesCallTable[typeid])(this, value, depth);
            }

            if (i >= length) {
                this.addTagOnlyEntry(/*LogEntryTags_LengthBoundHit*/ 0xC);
                break;
            }
        }

        //Set processing as false for cycle detection
        this.jsonCycleMap.delete(obj);
        this.addTagOnlyEntry(/*LogEntryTags_RBrack*/ 0x8);
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
        .filter((frame) => !frame.includes(env.logger_path));

    return errstk;
}

//Explicitly get these values here to avoid repeated lookup in logMessage loop

const CORE_TBOOL_ENUM = core.TypeNameEnum.TBoolean;
const CORE_TNUMBER_ENUM = core.TypeNameEnum.TNumber;
const CORE_TSTRING_ENUM = core.TypeNameEnum.TString;
const CORE_LAST_IMMUTABLE = core.TypeNameEnum.LastImmutableType;

const CORE_TDATE_ENUM = core.TypeNameEnum.TDate;

const CORE_TOBJECT_ENUM = core.TypeNameEnum.TObject;
const CORE_TARRAY_ENUM = core.TypeNameEnum.TJsArray;

BlockList.prototype.processImmutableHelper = function (valueok, value) {
    if (valueok) {
        this.addJsVarValueEntry(value);
    }
    else {
        this.addTagOnlyEntry(/*LogEntryTags_JsBadFormatVar*/ 0xA);
    }
};

BlockList.prototype.processDateHelper = function (vtype, value) {
    if (vtype === CORE_TDATE_ENUM) {
        this.addJsVarValueEntry(value);
    }
    else {
        this.addTagOnlyEntry(/*LogEntryTags_JsBadFormatVar*/ 0xA);
    }
};

/**
 * Log a message into the logger
 * @method
 * @param {Object} env a record with the info for certain environment/expando formatter entries
 * @param {string} level the level the message is being logged at
 * @param {string} category the category the message is being logged at
 * @param {Object} fmt the format of the message
 * @param {Array} args the arguments for the format message
 */
BlockList.prototype.logMessage = function (env, level, category, fmt, args) {
    this.addEntry(/*LogEntryTags_MsgFormat*/ 0x1, fmt);
    this.addEntry(/*LogEntryTags_MsgLevel*/ 0x2, level);
    this.addEntry(/*LogEntryTags_MsgCategory*/ 0x3, category);

    for (let i = 0; i < fmt.formatterArray.length; ++i) {
        const formatEntry = fmt.formatterArray[i];
        const formatSpec = formatEntry.format;

        if (formatSpec.kind === /*FormatStringEntryKind_Literal*/ 0x1) {
            //don't need to do anything!
        }
        else if (formatSpec.kind === /*FormatStringEntryKind_Expando*/ 0x2) {
            const specEnum = formatSpec.enum;
            if (specEnum === /*SingletonFormatStringEntry_SOURCE*/ 0x15) {
                this.addJsVarValueEntry(getCallerLineInfo(env));
            }
            else if (specEnum === /*SingletonFormatStringEntry_WALLCLOCK*/ 0x16) {
                this.addJsVarValueEntry(Date.now());
            }
            else if (specEnum === /*SingletonFormatStringEntry_TIMESTAMP*/ 0x17) {
                this.addJsVarValueEntry(env.TIMESTAMP++);
            }
            else {
                this.addJsVarValueEntry(env[formatSpec.name]);
            }
        }
        else {
            if (formatEntry.argPosition >= args.length) {
                //We hit a bad format value so rather than let it propigate -- report and move on.
                this.addTagOnlyEntry(/*LogEntryTags_JsBadFormatVar*/ 0xA);
            }
            else {
                const value = args[formatEntry.argPosition];
                const vtype = core.getTypeNameEnum(value);

                switch (formatSpec.enum) {
                    case /*SingletonFormatStringEntry_BOOL*/ 0x22:
                        this.processImmutableHelper(vtype === CORE_TBOOL_ENUM, value);
                        break;
                    case /*SingletonFormatStringEntry_NUMBER*/ 0x23:
                        this.processImmutableHelper(vtype === CORE_TNUMBER_ENUM, value);
                        break;
                    case /*SingletonFormatStringEntry_STRING*/ 0x24:
                        this.processImmutableHelper(vtype === CORE_TSTRING_ENUM, value);
                        break;
                    case /*SingletonFormatStringEntry_DATEISO*/ 0x25:
                    case /*SingletonFormatStringEntry_DATEUTC*/ 0x26:
                    case /*SingletonFormatStringEntry_DATELOCAL*/ 0x27:
                        this.processDateHelper(vtype, value);
                        break;
                    case /*SingletonFormatStringEntry_OBJECT*/ 0x29:
                        if (vtype === CORE_TOBJECT_ENUM) {
                            this.addExpandedObject(value, formatEntry.depth, formatEntry.length);
                        }
                        else {
                            this.addTagOnlyEntry(/*LogEntryTags_JsBadFormatVar*/ 0xA);
                        }
                        break;
                    case /*SingletonFormatStringEntry_ARRAY*/ 0x2A:
                        if (vtype === CORE_TARRAY_ENUM) {
                            this.addExpandedObject(value, formatEntry.depth, formatEntry.length);
                        }
                        else {
                            this.addTagOnlyEntry(/*LogEntryTags_JsBadFormatVar*/ 0xA);
                        }
                        break;
                    default:
                        if (vtype <= CORE_LAST_IMMUTABLE) {
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

    this.addTagOnlyEntry(/*LogEntryTags_MsgEndSentinal*/ 0x4);
};
