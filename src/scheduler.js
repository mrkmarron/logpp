"use strict";

//We are going to implement a simple controller to manage the rate at which logging data is written out

const minBlockingTime = 25;

/**
 * Create a controller with limits on time spent blocking and fraction of compute time
 * @param {number} maxBlockingTime the limit on time we want to block before getting back to user code
 * @param {number} minInterval the fraction of time we want to allow for writting vs. user actions
 */
function Scheduler(maxBlockingTime, maxFraction) {
    this.maxBlockingTime = maxBlockingTime;
    this.maxFraction = maxFraction;

    this.isWorkScheduled = false;

    this.currentBlocking = minBlockingTime;
    this.currentWait = 0;
}

/**
 * If there is no work to do we wait -- update the time parameters based on the fact we finished all our work.
 */
Scheduler.prototype.wait = function () {
    this.isWorkScheduled = false;

    //simple backoff of work time -- reset wait
    this.currentBlocking = Math.max(minBlockingTime, this.currentBlocking * 0.9);
    this.currentWait = 0;
};

/**
 * If there is work to do but we hit the limit on the IO stream -- update the time parameters based on the fact we are IO bound.
 */
Scheduler.prototype.waitOnIO = function () {
    this.isWorkScheduled = true;

    //simple backoff of work time -- leave wait unchanged -- reset wait
    this.currentBlocking = Math.max(minBlockingTime, this.currentBlocking * 0.7);
    this.currentWait = 0;
};

/**
 * If there is work to do but we hit the limit on the processing timeslice -- update the time parameters based on the fact we are compute bound.
 */
Scheduler.prototype.waitOnProcessing = function () {
    this.isWorkScheduled = true;

    //simple backoff of work time -- leave wait unchanged -- reset wait
    this.currentBlocking = Math.min(this.maxBlockingTime, this.currentBlocking * 1.2);

    const updatedFraction = Math.min(this.maxFraction, this.currentBlocking * (1000 / (this.currentWait * 0.9)));
    this.currentWait = (this.currentBlocking * 1000) / updatedFraction;
};

/**
 * Let the scheduler know there is now work.
 * @returns true if we need to schedule a timeout
 */
Scheduler.prototype.notify = function () {
    const needsSchedule = !this.isWorkScheduled;
    if (needsSchedule) {
        this.isWorkScheduled = true;
    }

    return needsSchedule;
};

/**
 * Return the limit on the time we will allow in blocking processing
 */
Scheduler.prototype.getMaxProcessingTime = function () {
    return this.currentBlocking;
};

/**
 * Return the time to wait on timeout scheduling.
 */
Scheduler.prototype.getCurrentSchedulingWait = function () {
    return this.currentWait;
};

/**
 * Create a scheduler with limits on time spent blocking and fraction of compute time
 * @param {number} maxBlockingTime the limit on time we want to block before getting back to user code
 * @param {number} maxFraction the fraction of time we want to allow for writting vs. user actions
 * @returns {Scheduler}
 */
function createScheduler(maxBlockingTime, maxFraction) {
    return new Scheduler(maxBlockingTime, maxFraction);
}
exports.createScheduler = createScheduler;
