"use strict";

const chalk = require("chalk");

function generalRunnerTemplate(runSingleTest, printTestInfo, testList) {
    return (completecb) => {
        let testsRun = 0;
        let testsFailed = 0;

        function runSingleTestCB() {
            const test = testList[testsRun++];
            try {
                process.stdout.write(printTestInfo(test));
                const res = runSingleTest(test);
                process.stdout.write(res + " ->");
                if (test.oktest(res)) {
                    process.stdout.write(chalk.green(" passed\n"));
                }
                else {
                    testsFailed = testsFailed + 1;

                    process.stdout.write(chalk.red(` failed with "${res}"\n`));
                }
            }
            catch (ex) {
                testsFailed = testsFailed + 1;

                process.stdout.write(chalk.red(` failed with exception: ${ex}\n`));
            }

            if (testsRun !== testList.length) {
                setImmediate(runSingleTestCB);
            }
            else {
                process.stdout.write("----\n");
                if (testsFailed !== 0) {
                    process.stdout.write(chalk.red.bold(`${testsFailed} failures out of ${testsRun} tests!!!\n`));
                }
                else {
                    process.stdout.write(chalk.green.bold(`All ${testsRun} tests passed!\n`));
                }

                setImmediate(completecb);
            }
        }

        process.stdout.write("Running tests...\n");
        setImmediate(runSingleTestCB);
    };
}

exports.generalSyncRunner = generalRunnerTemplate;
