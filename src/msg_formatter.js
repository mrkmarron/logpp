"use strict";

/**
 * JSON formatter constructor
 * @constructor
 */
function JSONFormatter() {
    this.block = Buffer.allocUnsafe(1024);
    this.pos = 0;
}

JSONFormatter.prototype.resize = function (reqsize) {
    const oldblock = this.block;
    const oldlength = this.block.length;

    this.block = Buffer.allocUnsafe(Math.max(reqsize, oldlength * 2));
    oldblock.copy(this.block, 0, 0, oldlength);
};

JSONFormatter.prototype.emitLiteralChar = function (c) {
    if (this.pos >= this.block.length) {
        this.resize(this.pos + 1);
    }

    this.pos += this.block.write(c, this.pos, 1, "utf8");
};

JSONFormatter.prototype.emitLiteralString = function (str) {
    if ((this.pos + str.length) >= this.block.length) {
        this.resize(this.pos + str.length);
    }

    this.pos += this.block.write(str, this.pos, str.length, "utf8");
};

JSONFormatter.prototype.emitJsString = function (str) {
    const bytelen = Buffer.byteLength(str, "utf8");
    if ((this.pos + bytelen + 2) >= this.block.length) {
        this.resize(this.pos + bytelen + 2);
    }

    this.pos += this.block.write("\"", this.pos, 1, "utf8");
    this.pos += this.block.write(str, this.pos, bytelen, "utf8");
    this.pos += this.block.write("\"", this.pos, 1, "utf8");
};

JSONFormatter.prototype.emitSimpleVar = function (value) {
    if (value === undefined) {
        this.emitLiteralString("undefined");
    }
    else if (value === null) {
        this.emitLiteralString("null");
    }
    else {
        this.emitLiteralString(value.toString());
    }
};

JSONFormatter.prototype.emitSpecialVar = function (tag) {
    switch (tag) {
        case /*LogEntryTags_JsBadFormatVar*/0xA:
            this.output += "\"<BadFormat>\"";
            break;
        case /*LogEntryTags_LengthBoundHit*/0xC:
            this.output += "\"<LengthBound>\"";
            break;
        case /*LogEntryTags_DepthBoundHit*/0x20:
            this.output += "\"<DepthBound>\"";
            break;
        case /*LogEntryTags_CycleValue*/0xD:
            this.output += "\"<Cycle>\"";
            break;
        default:
            this.output += "\"<Value>\"";
            break;
    }
};

