type TestCase = {
  name: string;
  fn: () => void | Promise<void>;
};

const tests: TestCase[] = [];
const suiteStack: string[] = [];

export function describe(name: string, fn: () => void): void {
  suiteStack.push(name);
  try {
    fn();
  } finally {
    suiteStack.pop();
  }
}

export function it(name: string, fn: () => void | Promise<void>): void {
  tests.push({
    name: [...suiteStack, name].join(' > '),
    fn
  });
}

export async function runCollectedTests(): Promise<void> {
  let failures = 0;

  for (const test of tests) {
    try {
      await test.fn();
      console.log(`PASS ${test.name}`);
    } catch (error) {
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
