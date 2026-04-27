"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.describe = describe;
exports.it = it;
exports.runCollectedTests = runCollectedTests;
const tests = [];
const suiteStack = [];
function describe(name, fn) {
    suiteStack.push(name);
    try {
        fn();
    }
    finally {
        suiteStack.pop();
    }
}
function it(name, fn) {
    tests.push({
        name: [...suiteStack, name].join(' > '),
        fn
    });
}
async function runCollectedTests() {
    let failures = 0;
    for (const test of tests) {
        try {
            await test.fn();
            console.log(`PASS ${test.name}`);
        }
        catch (error) {
            failures += 1;
            console.error(`FAIL ${test.name}`);
            console.error(error);
        }
    }
    console.log(`\nExecuted ${tests.length} test(s).`);
    if (failures > 0) {
        throw new Error(`${failures} test(s) failed.`);
    }
}
