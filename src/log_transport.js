"use strict";

const fs = require("fs");

///////////////////////////////////////////////

/**
 * Console transport constructor
 * @constructor
 * @param {Function} errorcb the callback to handle an error
 */
function ConsoleTransport(errorcb) {
    process.stdout.once("error", errorcb);
}
exports.ConsoleTransport = ConsoleTransport;

/**
 * @param {Buffer} chunk the data to write out to the transport
 * @returns true if ready to accept more data and false otherwise
 */
ConsoleTransport.prototype.writeData = function (chunk) {
    return process.stdout.write(chunk);
};

/**
 * @param {Buffer} chunk the data to write out to the transport
 */
ConsoleTransport.prototype.writeDataSync = function (chunk) {
    process.stdout.write(chunk);
    fs.fsyncSync(1);
};

/**
 * @param {Function} readycb set the callback for when more data is ready to be written
 */
ConsoleTransport.prototype.setReadyCallback = function (readycb) {
    process.stdout.once("drain", readycb);
};

///////////////////////////////////////////////

/**
 * String transport constructor
 * @constructor
 * @param {Function} errorcb the callback to handle an error
 */
function StringTransport(errorcb) {
    this.data = "";
}
exports.StringTransport = StringTransport;

/**
 * @param {Buffer} chunk the data to write out to the transport
 * @returns true if ready to accept more data and false otherwise
 */
ConsoleTransport.prototype.writeData = function (chunk) {
    this.data += chunk.toString();
    return true;
};

/**
 * @param {Buffer} chunk the data to write out to the transport
 */
ConsoleTransport.prototype.writeDataSync = function (chunk) {
    this.data += chunk.toString();
};

/**
 * @param {Function} readycb set the callback for when more data is ready to be written
 */
ConsoleTransport.prototype.setReadyCallback = function (readycb) {
    setImmediate(readycb);
};
