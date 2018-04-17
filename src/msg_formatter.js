"use strict";

/**
 * JSON formatter constructor
 * @constructor
 */
function JSONFormatter() {
    this.block = Buffer.allocUnsafe(1024);
    this.pos = 0;
}
exports.JSONFormatter = JSONFormatter;

JSONFormatter.prototype.unlinkData = function () {
    const res = this.block;

    this.block = Buffer.allocUnsafe(1024);
    this.pos = 0;

    return res;
};

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

JSONFormatter.prototype.emitString = function (str) {
    const bytelen = Buffer.byteLength(str, "utf8");
    if ((this.pos + bytelen) >= this.block.length) {
        this.resize(this.pos + bytelen + 2);
    }

    this.pos += this.block.write(str, this.pos, bytelen, "utf8");
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

JSONFormatter.prototype.emitNumber = function (value) {
    const nstr = value.toString();
    if ((this.pos + nstr.length) >= this.block.length) {
        this.resize(this.pos + nstr.length);
    }

    this.pos += this.block.write(nstr, this.pos, nstr.length, "utf8");
};

JSONFormatter.prototype.emitIsoTime = function (tv) {
    const tvstr = (new Date(tv)).toISOString();
    if ((this.pos + tvstr.length) >= this.block.length) {
        this.resize(this.pos + tvstr.length);
    }

    this.pos += this.block.write(tvstr, this.pos, tvstr.length, "utf8");
};

JSONFormatter.prototype.emitCallStack = function (cstack) {
    const csstr = JSON.stringify(cstack);
    const bytelen = Buffer.byteLength(csstr, "utf8");
    if ((this.pos + bytelen) >= this.block.length) {
        this.resize(this.pos + bytelen);
    }

    this.pos += this.block.write(csstr, this.pos, bytelen, "utf8");
};

JSONFormatter.prototype.emitSimpleVar = function (value) {
    if (value === undefined) {
        this.emitLiteralString("undefined");
    }
    else if (value === null) {
        this.emitLiteralString("null");
    }
    else {
        this.emitString(value);
    }
};

JSONFormatter.prototype.emitSimpleVarAsJS = function (value) {
    if (value === undefined) {
        this.emitLiteralString("undefined");
    }
    else if (value === null) {
        this.emitLiteralString("null");
    }
    else if (typeof (value) === "string") {
        this.emitJsString(value);
    }
    else {
        this.emitString(value.toString());
    }
};

JSONFormatter.prototype.emitSpecialVar = function (tag) {
    switch (tag) {
        case /*LogEntryTags_JsBadFormatVar*/0xA:
            this.emitLiteralString("\"<BadFormat>\"");
            break;
        case /*LogEntryTags_LengthBoundHit*/0xC:
            this.emitLiteralString("\"<LengthBound>\"");
            break;
        case /*LogEntryTags_DepthBoundHit*/0x20:
            this.emitLiteralString("\"<DepthBound>\"");
            break;
        case /*LogEntryTags_CycleValue*/0xD:
            this.emitLiteralString("\"<Cycle>\"");
            break;
        default:
            this.emitLiteralString("\"<Value>\"");
            break;
    }
};
