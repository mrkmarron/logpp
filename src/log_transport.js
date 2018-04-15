"use strict";

const fs = require("fs");

/**
 * console transport constructor
 * @constructor
 * @param {Function} draincb the callback to handle the drain
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
    return process.stdout.once("drain", readycb);
};
