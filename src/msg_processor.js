"use strict";

const core = require("./core");

/**
 * Tag values indicating the kind of each entry in the fast log buffer
 */
const LogEntryTags = {
    Clear: 0,
    MsgFormat: 1,
    MsgLevel: 2,
    MsgCategory: 3,
    MsgEndSentinal: 4,
    LParen: 5,
    RParen: 6,
    LBrack: 7,
    RBrack: 8,
    PropertyRecord: 9,
    JsBadFormatVar: 10,
    JsVarValue: 11,
    LengthBoundHit: 12,
    CycleValue: 13,
    OpaqueValue: 14
};
exports.LogEntryTags = LogEntryTags;

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
    this.head.tags.fill(LogEntryTags.Clear, this.head.count);
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

    block.tags[block.count] = LogEntryTags.JsVarValue;
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
    blockList.addTagOnlyEntry(LogEntryTags.OpaqueValue);
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
        this.addTagOnlyEntry(LogEntryTags.CycleValue);
        return;
    }

    if (depth === 0) {
        this.addTagOnlyEntry(LogEntryTags.OpaqueValue);
    }
    else {
        //Set processing as true for cycle detection
        this.jsonCycleMap.add(obj);
        this.addTagOnlyEntry(LogEntryTags.LParen);

        let allowedLengthRemain = length;
        for (const p in obj) {
            this.addEntry(LogEntryTags.PropertyRecord, p);

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
                this.addTagOnlyEntry(LogEntryTags.LengthBoundHit);
                break;
            }
        }

        //Set processing as false for cycle detection
        this.jsonCycleMap.delete(obj);
        this.addTagOnlyEntry(LogEntryTags.RParen);
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
        this.addTagOnlyEntry(LogEntryTags.CycleValue);
        return;
    }

    if (depth === 0) {
        this.addTagOnlyEntry(LogEntryTags.OpaqueValue);
    }
    else {
        //Set processing as true for cycle detection
        this.jsonCycleMap.add(obj);
        this.addTagOnlyEntry(LogEntryTags.LBrack);

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
                this.addTagOnlyEntry(LogEntryTags.LengthBoundHit);
                break;
            }
        }

        //Set processing as false for cycle detection
        this.jsonCycleMap.delete(obj);
        this.addTagOnlyEntry(LogEntryTags.RBrack);
    }
};

////////

/**
 * A table that maps from basic format type enums to the typeid that is permissible for that formatter
 */
const FormatTypeToArgTypeCheckArray = new Array(FormatStringEntrySingleton_EnumLimit);
FormatTypeToArgTypeCheckArray.fill(0);

FormatTypeToArgTypeCheckArray[FormatStringEntrySingletons.BOOL_VAL.enum] = TypeNameEnum_Boolean;
FormatTypeToArgTypeCheckArray[FormatStringEntrySingletons.NUMBER_VAL.enum] = TypeNameEnum_Number;
FormatTypeToArgTypeCheckArray[FormatStringEntrySingletons.STRING_VAL.enum] = TypeNameEnum_String;

const LogMessage_RemainingTypesCallTable = new Array(FormatStringEntrySingleton_EnumLimit);
LogMessage_RemainingTypesCallTable.fill(null);

LogMessage_RemainingTypesCallTable[FormatStringEntrySingletons.OBJECT_VAL.enum] = function (blockList, valueid, value, formatEntry) {
    if (valueid === TypeNameEnum_Object) {
        blockList.addExpandedObject(value, formatEntry.depth, formatEntry.length);
    }
    else {
        blockList.addTagOnlyEntry(LogEntryTags_JsBadFormatVar);
    }
};

LogMessage_RemainingTypesCallTable[FormatStringEntrySingletons.ARRAY_VAL.enum] = function (blockList, valueid, value, formatEntry) {
    if ((valueid === TypeNameEnum_JsArray) || (valueid === TypeNameEnum_TypedArray)) {
        blockList.addExpandedArray(value, formatEntry.depth, formatEntry.length);
    }
    else {
        blockList.addTagOnlyEntry(LogEntryTags_JsBadFormatVar);
    }
};

/**
 * Log a message into the logger
 * @method
 * @param {Object} macroInfo a record with the info for certain expando formatter entries
 * @param {Object} level the level the message is being logged at
 * @param {Object} fmt the format of the message
 * @param {Array} args the arguments for the format message
 */
BlockList.prototype.logMessage = function (macroInfo, level, fmt, args) {
    this.addEntry(LogEntryTags_MsgFormat, fmt);
    this.addEntry(LogEntryTags_MsgLevel, level);

    for (let i = 0; i < fmt.formatterArray.length; ++i) {
        const formatEntry = fmt.formatterArray[i];
        const formatSpec = formatEntry.format;

        if (formatSpec.kind === FormatStringEntryKind_Literal) {
            ; //don't need to do anything!
        }
        else if (formatSpec.kind === FormatStringEntryKind_Expando) {
            if (formatSpec.enum <= FormatStringEntrySingleton_LastMacroInfoExpandoEnum) {
                this.addJsVarValueEntry(macroInfo[formatSpec.name]);
            }
            else {
                if (formatSpec === FormatStringEntrySingletons.MSG_NAME) {
                    this.addJsVarValueEntry(fmt.name);
                }
                else {
                    //TODO: remove this later but useful for initial testing
                    assert(formatSpec === FormatStringEntrySingletons.WALLTIME, 'Should not be any other options');
                    this.addJsVarValueEntry(Date.now());
                }
            }
        }
        else {
            //TODO: remove this after we are done debugging a bit
            assert(formatSpec.kind === FormatStringEntryKind_Basic || formatSpec.kind === FormatStringEntryKind_Compound, 'No other options');

            if (formatEntry.argPosition >= args.length) {
                //We hit a bad format value so rather than let it propigate -- report and move on.
                this.addTagOnlyEntry(LogEntryTags_JsBadFormatVar);
            }
            else {
                const value = args[formatEntry.argPosition];
                const typeid = typeGetIdTag(value);

                if (formatSpec.enum <= FormatStringEntrySingleton_LastBasicFormatterEnum) {
                    if (FormatTypeToArgTypeCheckArray[formatSpec.enum] === typeid) {
                        this.addJsVarValueEntry(value);
                    }
                    else {
                        this.addTagOnlyEntry(LogEntryTags_JsBadFormatVar);
                    }
                }
                else if (formatSpec === FormatStringEntrySingletons.GENERAL_VAL) {
                    if (typeid <= TypeNameEnum_LastSimpleType) {
                        this.addJsVarValueEntry(value)
                    }
                    else {
                        (AddGeneralValue_RemainingTypesCallTable[typeid])(this, typeid, value, formatEntry.depth);
                    }
                }
                else {
                    (LogMessage_RemainingTypesCallTable[formatSpec.enum])(this, typeid, fmt, value)
                }
            }
        }
    }

    this.addTagOnlyEntry(LogEntryTags_MsgEndSentinal);
}
