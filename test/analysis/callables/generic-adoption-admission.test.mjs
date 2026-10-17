import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

const code = "TSONIC_GENERIC_ASYNC_ADOPTION_UNSUPPORTED";
const identity = "async function identity<Value>(value: Value) { return value; }";

const nativeEntryCases = [
  [
    "sync-forEach-capture",
    "function wrap<Value>(value: Value): Promise<Value> {\n  return new Promise<Value>(resolve => {\n    [0].forEach(() => { resolve(value); });\n  });\n}"
  ],
  [
    "deferred-then-capture",
    "function wrap<Value>(value: Value): Promise<Value> {\n  return new Promise<Value>(resolve => {\n    void Promise.resolve(0).then(() => { resolve(value); });\n  });\n}"
  ],
  [
    "deferred-catch-capture",
    "function wrap<Value>(value: Value): Promise<Value> {\n  return new Promise<Value>(resolve => {\n    void Promise.reject<void>(new Error(\"seed\")).catch(() => { resolve(value); });\n  });\n}"
  ],
  [
    "deferred-finally-capture",
    "function wrap<Value>(value: Value): Promise<Value> {\n  return new Promise<Value>(resolve => {\n    void Promise.resolve(0).finally(() => { resolve(value); });\n  });\n}"
  ],
  [
    "deferred-PromiseLike-capture",
    "function wrap<Value>(value: Value): Promise<Value> {\n  return new Promise<Value>(resolve => {\n    const pending: PromiseLike<number> = Promise.resolve(0);\n    void pending.then(() => { resolve(value); });\n  });\n}"
  ],
  [
    "native-direct-resolver",
    "function wrap<Value>(value: Value): Promise<Value> {\n  return new Promise<Value>(resolve => { [value].forEach(resolve); });\n}"
  ],
  [
    "native-callback-parameter",
    "function wrap<Value>(value: Value): Promise<Value> {\n  return new Promise<Value>(resolve => { [value].forEach(actual => { resolve(actual); }); });\n}"
  ],
  [
    "aliased-callback-and-resolver",
    "function wrap<Value>(value: Value): Promise<Value> {\n  return new Promise<Value>(resolve => {\n    const done = resolve;\n    const callback = (): void => { done(value); };\n    const alias = callback;\n    [0].forEach(alias);\n  });\n}"
  ],
  [
    "finite-returned-callback",
    "function delivery<Part>(done: (value: Part) => void, value: Part): () => void {\n  return () => { done(value); };\n}\nfunction wrap<Value>(value: Value): Promise<Value> {\n  return new Promise<Value>(resolve => { [0].forEach(delivery(resolve, value)); });\n}"
  ],
  [
    "source-helper-to-native-entry",
    "function invoke(callback: () => void): void { [0].forEach(callback); }\nfunction wrap<Value>(value: Value): Promise<Value> {\n  return new Promise<Value>(resolve => { invoke(() => { resolve(value); }); });\n}"
  ],
  [
    "two-native-levels",
    "function wrap<Value>(value: Value): Promise<Value> {\n  return new Promise<Value>(resolve => {\n    [0].forEach(() => { void Promise.resolve(0).then(() => { resolve(value); }); });\n  });\n}"
  ],
  [
    "native-source-recursive-SCC",
    "function deliver<Part>(done: (value: Part) => void, value: Part, depth: number): void {\n  if (depth === 0) { done(value); return; }\n  [0].forEach(() => { deliver(done, value, depth - 1); });\n}\nfunction wrap<Value>(value: Value): Promise<Value> {\n  return new Promise<Value>(resolve => { deliver(resolve, value, 2); });\n}"
  ],
  [
    "finite-callback-alternatives",
    "function wrap<Value>(value: Value): Promise<Value> {\n  return new Promise<Value>(resolve => {\n    const first = (): void => { resolve(value); };\n    const second = (): void => { resolve(value); };\n    const callback = value === value ? first : second;\n    [0].forEach(callback);\n  });\n}"
  ],
  [
    "both-native-then-ports",
    "function wrap<Value>(value: Value): Promise<Value> {\n  return new Promise<Value>(resolve => {\n    const callback = (): void => { resolve(value); };\n    void Promise.resolve(0).then(callback, callback);\n  });\n}"
  ]
];

nativeEntryCases.push(...[
  [
    "map-element",
    "function wrap<Value>(value: Value): Promise<Value> { return new Promise<Value>(resolve => { [value].map(actual => { resolve(actual); return 0; }); }); }"
  ],
  [
    "filter-element",
    "function wrap<Value>(value: Value): Promise<Value> { return new Promise<Value>(resolve => { [value].filter(actual => { resolve(actual); return true; }); }); }"
  ],
  [
    "some-element",
    "function wrap<Value>(value: Value): Promise<Value> { return new Promise<Value>(resolve => { [value].some(actual => { resolve(actual); return true; }); }); }"
  ],
  [
    "every-element",
    "function wrap<Value>(value: Value): Promise<Value> { return new Promise<Value>(resolve => { [value].every(actual => { resolve(actual); return true; }); }); }"
  ],
  [
    "find-element",
    "function wrap<Value>(value: Value): Promise<Value> { return new Promise<Value>(resolve => { [value].find(actual => { resolve(actual); return true; }); }); }"
  ],
  [
    "findLast-element",
    "function wrap<Value>(value: Value): Promise<Value> { return new Promise<Value>(resolve => { [value].findLast(actual => { resolve(actual); return true; }); }); }"
  ],
  [
    "findIndex-element",
    "function wrap<Value>(value: Value): Promise<Value> { return new Promise<Value>(resolve => { [value].findIndex(actual => { resolve(actual); return true; }); }); }"
  ],
  [
    "findLastIndex-element",
    "function wrap<Value>(value: Value): Promise<Value> { return new Promise<Value>(resolve => { [value].findLastIndex(actual => { resolve(actual); return true; }); }); }"
  ],
  [
    "reduce-element-not-accumulator",
    "function wrap<Value>(value: Value): Promise<Value> { return new Promise<Value>(resolve => { [value].reduce((accumulator, actual) => { resolve(actual); return accumulator; }, 0); }); }"
  ],
  [
    "sort-two-element-inputs",
    "function wrap<Value>(value: Value): Promise<Value> { return new Promise<Value>(resolve => { [value, value].sort((left, right) => { resolve(left); resolve(right); return 0; }); }); }"
  ],
  [
    "Array-from-actual-input0-mapper1",
    "function wrap<Value>(value: Value): Promise<Value> { return new Promise<Value>(resolve => { Array.from([value], actual => { resolve(actual); return 0; }); }); }"
  ],
  [
    "readonly-array-element",
    "function wrap<Value>(value: Value): Promise<Value> { return new Promise<Value>(resolve => { const values: ReadonlyArray<Value> = [value]; values.forEach(actual => { resolve(actual); }); }); }"
  ],
  [
    "Map-native-input-type-bound",
    "function wrap<Value>(value: Value): Promise<Value> { return new Promise<Value>(resolve => { const values = new Map<number, Value>([[0, value]]); values.forEach(actual => { resolve(actual); }); }); }"
  ],
  [
    "ReadonlyMap-native-input-type-bound",
    "function wrap<Value>(value: Value): Promise<Value> { return new Promise<Value>(resolve => { const values: ReadonlyMap<number, Value> = new Map<number, Value>([[0, value]]); values.forEach(actual => { resolve(actual); }); }); }"
  ],
  [
    "Set-native-input-type-bound",
    "function wrap<Value>(value: Value): Promise<Value> { return new Promise<Value>(resolve => { const values = new Set<Value>([value]); values.forEach(actual => { resolve(actual); }); }); }"
  ],
  [
    "ReadonlySet-native-input-type-bound",
    "function wrap<Value>(value: Value): Promise<Value> { return new Promise<Value>(resolve => { const values: ReadonlySet<Value> = new Set<Value>([value]); values.forEach(actual => { resolve(actual); }); }); }"
  ],
  [
    "TypedArray-captured-generic-resolver",
    "function wrap<Value>(value: Value): Promise<Value> { return new Promise<Value>(resolve => { new Int32Array([0, 1]).sort((left, right) => { void left; void right; resolve(value); return 0; }); }); }"
  ],
  [
    "optional-absent-fulfilled",
    "function wrap<Value>(value: Value): Promise<Value> { return new Promise<Value>(resolve => { void Promise.reject<number>(new Error(\"seed\")).then(undefined, () => { resolve(value); }); }); }"
  ]
]);

nativeEntryCases.push(...[
  [
    "deferred-captured-payload-location",
    "function wrap<Value>(value: Value): Promise<Value | number> {\n  return new Promise<Value | number>(resolve => {\n    let selected: Value | number = 7;\n    void Promise.resolve(0).then(() => { resolve(selected); });\n    selected = value;\n  });\n}"
  ],
  [
    "deferred-captured-resolver-location",
    "function wrap<Value>(value: Value): Promise<Value> {\n  return new Promise<Value>(resolve => {\n    let done: (actual: Value) => void = actual => { void actual; };\n    void Promise.resolve(0).then(() => { done(value); });\n    done = resolve;\n  });\n}"
  ],
  [
    "native-callback-actual-default",
    "function wrap<Value>(value: Value): Promise<Value> {\n  return new Promise<Value>(resolve => {\n    const values: (Value | undefined)[] = [undefined];\n    values.forEach((actual = value) => { resolve(actual); });\n  });\n}"
  ],
  [
    "stored-pending-native-entry",
    "function wrap<Value>(value: Value): Promise<Value> {\n  const pending = new Promise<Value>(resolve => {\n    const saved = (): void => { resolve(value); };\n    void Promise.resolve(0).then(saved);\n  });\n  return pending;\n}"
  ]
]);

nativeEntryCases.push(...[
  [
    "generic-native-callback-checked-input-bound",
    "function wrap<Value>(value: Value): Promise<Value> {\n  return new Promise<Value>(resolve => {\n    function deliver<Actual extends Value>(actual: Actual): void { resolve(actual); }\n    [value].forEach(deliver);\n  });\n}"
  ]
]);

nativeEntryCases.push(...[
  [
    "authored-this-native-input",
    "function wrap<Value>(value: Value): Promise<Value> { return new Promise<Value>(resolve => { function deliver(this: void, actual: Value): void { resolve(actual); } [value].forEach(deliver); }); }"
  ],
  [
    "tuple-rest-native-input",
    "function wrap<Value>(value: Value): Promise<Value> { return new Promise<Value>(resolve => { function deliver(...items: [actual: Value, index: number]): void { resolve(items[0]); } [value].forEach(deliver); }); }"
  ],
  [
    "destructured-tuple-native-component",
    "function wrap<Value>(value: Value): Promise<Value> { return new Promise<Value>(resolve => { const rows: [Value][] = [[value]]; rows.forEach(([actual]) => { resolve(actual); }); }); }"
  ],
  [
    "authored-this-source-helper",
    "function deliver<Part>(this: void, done: (value: Part) => void, value: Part): void { done(value); }\nfunction wrap<Value>(value: Value): Promise<Value> { return new Promise<Value>(resolve => { deliver(resolve, value); }); }"
  ],
  [
    "tuple-rest-source-helper",
    "function deliver<Part>(...items: [done: (value: Part) => void, value: Part]): void { items[0](items[1]); }\nfunction wrap<Value>(value: Value): Promise<Value> { return new Promise<Value>(resolve => { deliver(resolve, value); }); }"
  ],
  [
    "native-element-source-invocation",
    "function wrap<Value>(value: Value): Promise<Value> { return new Promise<Value>(resolve => { [() => { resolve(value); }].forEach(callback => { callback(); }); }); }"
  ],
  [
    "native-element-forwarded-native-callback",
    "function wrap<Value>(value: Value): Promise<Value> { return new Promise<Value>(resolve => { [() => { resolve(value); }].forEach(callback => { [0].forEach(callback); }); }); }"
  ],
  [
    "aliased-finite-native-element-candidates",
    "function wrap<Value>(value: Value): Promise<Value> { return new Promise<Value>(resolve => { const first = (): void => { resolve(value); }; const second = (): void => { resolve(value); }; const original = [first, second]; const copied = original; copied.forEach(callback => { callback(); }); }); }"
  ],
  [
    "native-default-actual-undefined",
    "function wrap<Value>(value: Value): Promise<Value> { return new Promise<Value>(resolve => { void Promise.resolve(undefined).then((actual: Value | undefined = value) => { if (actual !== undefined) resolve(actual); else resolve(value); }); }); }"
  ],
  [
    "official-nested-constructor-executor",
    "function wrap<Value>(value: Value): Promise<Value> { return new Promise<Value>(outer => { const nested = new Promise<void>(inner => { outer(value); inner(undefined); }); void nested; }); }"
  ],
  [
    "authored-this-constructor-executor",
    "function wrap<Value>(value: Value): Promise<Value> { function execute(this: void, done: (actual: Value | PromiseLike<Value>) => void): void { done(value); } return new Promise<Value>(execute); }"
  ],
  [
    "tuple-rest-constructor-executor",
    "function wrap<Value>(value: Value): Promise<Value> { function execute(...inputs: [done: (actual: Value | PromiseLike<Value>) => void]): void { inputs[0](value); } return new Promise<Value>(execute); }"
  ]
]);
nativeEntryCases.push(...[
  ["native-object-field-callable", "function wrap<Value>(value: Value): Promise<Value> { return new Promise<Value>(resolve => { const item = { callback: (): void => { resolve(value); } }; [item].forEach(actual => { actual.callback(); }); }); }"],
  ["native-class-field-callable", "function wrap<Value>(value: Value): Promise<Value> { return new Promise<Value>(resolve => { class Holder { callback = (): void => { resolve(value); }; } [new Holder()].forEach(actual => { actual.callback(); }); }); }"],
  ["native-returned-element-callable", "function wrap<Value>(value: Value): Promise<Value> { return new Promise<Value>(resolve => { function make(): () => void { return () => { resolve(value); }; } [make()].forEach(actual => { actual(); }); }); }"]
]);

for (const [name, declarations] of nativeEntryCases) {
  test("C# native callback entry keeps exact generic adoption: " + name, () => {
    const compiled = compileCsharpSource({ surface: "js", sourceText: declarations +
      "\nexport function reject(promised: Promise<number>): void { void wrap(promised); }" });
    rejected(compiled, "wrap(promised)", "KindCallExpression", "wrap");
  });
}

test("C# native callback ordinary matrix executes every retained entry under one real loop owner", { timeout: 300_000 }, () => {
  const files = Object.fromEntries(nativeEntryCases.map(([name, declarations], index) =>
    [`case${index}.ts`, declarations + "\nexport async function run(): Promise<number> { return await wrap(7); }"]));
  const sourceText = nativeEntryCases.map((entry, index) => `import { run as run${index} } from "./case${index}.js";`).join("\n") +
    "\n" + nativeEntryCases.map((entry, index) => `console.log(await run${index}());`).join("\n");
  const compiled = compileCsharpSource({ surface: "js", targetOptions: { outputType: "Exe" }, sourceText, files });
  assert.equal(compiled.result.diagnostics.length, 0,
    JSON.stringify(compiled.result.diagnostics.map(({ code, message }) => ({ code, message }))));
  const output = executeCsharpConstruction(compiled, "native-callback-entry-matrix", false, false, [], "");
  assert.deepEqual(output.trim().split(/\r?\n/u), nativeEntryCases.map(() => "7"),
    "every synchronous/deferred/aliased/helper/recursive entry preserves the ordinary native payload");
});

const nativeEntryInverses = [
  [
    "non-resolving-native-observer",
    "function wrap<Value>(value: Value): Promise<number> {\n  return new Promise<number>(resolve => {\n    [0].forEach(() => { void value; });\n    resolve(7);\n  });\n}\nconsole.log(await wrap(Promise.resolve(5)));\n"
  ],
  [
    "non-resolving-deferred-observer",
    "function wrap<Value>(value: Value): Promise<number> {\n  return new Promise<number>(resolve => {\n    void Promise.resolve(0).then(() => { void value; });\n    resolve(7);\n  });\n}\nconsole.log(await wrap(Promise.resolve(5)));\n"
  ],
  [
    "same-helper-ordinary-and-resolver-correlated",
    "function deliver<Part>(callback: (value: Part) => void, value: Part): void {\n  [0].forEach(() => { callback(value); });\n}\nfunction wrap<Value>(value: Value): Promise<number> {\n  return new Promise<number>(resolve => {\n    const observe = (actual: Value): void => { void actual; };\n    deliver(observe, value);\n    deliver(resolve, 7);\n  });\n}\nconsole.log(await wrap(Promise.resolve(5)));\n"
  ],
  [
    "same-helper-ordinary-and-resolver-correlated-reversed",
    "function deliver<Part>(callback: (value: Part) => void, value: Part): void {\n  [0].forEach(() => { callback(value); });\n}\nfunction wrap<Value>(value: Value): Promise<number> {\n  return new Promise<number>(resolve => {\n    const observe = (actual: Value): void => { void actual; };\n    deliver(resolve, 7);\n    deliver(observe, value);\n  });\n}\nconsole.log(await wrap(Promise.resolve(5)));\n"
  ],
  [
    "same-source-two-created-callbacks",
    "function make<Part>(callback: (value: Part) => void, value: Part): () => void {\n  return () => { callback(value); };\n}\nfunction wrap<Value>(value: Value): Promise<number> {\n  return new Promise<number>(resolve => {\n    const first = make((actual: Value): void => { void actual; }, value);\n    const second = make(resolve, 7);\n    [0].forEach(first);\n    [0].forEach(second);\n  });\n}\nconsole.log(await wrap(Promise.resolve(5)));\n"
  ],
  [
    "callback-signature-alone-does-not-prove-resolver",
    "function wrap<Value>(value: Value): Promise<number> {\n  return new Promise<number>(resolve => {\n    const observer = (actual: Value): void => { void actual; };\n    [value].forEach(observer);\n    resolve(7);\n  });\n}\nconsole.log(await wrap(Promise.resolve(5)));\n"
  ]
];
nativeEntryInverses.push(...[
  [
    "reduce-accumulator-remains-number",
    "function wrap<Value>(value: Value): Promise<number> {\n  return new Promise<number>(resolve => { [value].reduce((accumulator, actual) => { void actual; resolve(accumulator); return accumulator; }, 7); });\n}\nconsole.log(await wrap(Promise.resolve(5)));\n"
  ],
  [
    "sort-callback-never-resolves-captured-Value",
    "function wrap<Value>(value: Value): Promise<number> {\n  return new Promise<number>(resolve => { [1, 2].sort((left, right) => { void value; resolve(left + right + 4); return 0; }); });\n}\nconsole.log(await wrap(Promise.resolve(5)));\n"
  ],
  [
    "Array-from-mapper-is-not-iterable-Value",
    "function wrap<Value>(value: Value): Promise<number> {\n  return new Promise<number>(resolve => { Array.from([0], actual => { void value; resolve(actual + 7); return 0; }); });\n}\nconsole.log(await wrap(Promise.resolve(5)));\n"
  ]
]);
nativeEntryInverses.push(...[
  [
    "authored-this-index-not-element",
    "function wrap<Value>(value: Value): Promise<number> { return new Promise<number>(resolve => { function deliver(this: void, actual: Value, index: number): void { void actual; resolve(index + 7); } [value].forEach(deliver); }); }\nconsole.log(await wrap(Promise.resolve(5)));\n"
  ],
  [
    "tuple-rest-index-not-element",
    "function wrap<Value>(value: Value): Promise<number> { return new Promise<number>(resolve => { function deliver(...items: [actual: Value, index: number]): void { void items[0]; resolve(items[1] + 7); } [value].forEach(deliver); }); }\nconsole.log(await wrap(Promise.resolve(5)));\n"
  ],
  [
    "required-native-input-excludes-this-default",
    "function wrap<Value>(value: Value): Promise<Value | number> { return new Promise<Value | number>(resolve => { function deliver(this: void, actual: Value | number = value): void { resolve(actual); } [7].forEach(deliver); }); }\nconsole.log(await wrap(Promise.resolve(5)));\n"
  ],
  [
    "native-element-observer-resolver-correlation",
    "function wrap<Value>(value: Value): Promise<number> { return new Promise<number>(resolve => { const observe = (): void => { void value; }; const done = (): void => { resolve(7); }; [observe, done].forEach(callback => { callback(); }); }); }\nconsole.log(await wrap(Promise.resolve(5)));\n"
  ],
  [
    "native-element-observer-resolver-correlation-reversed",
    "function wrap<Value>(value: Value): Promise<number> { return new Promise<number>(resolve => { const observe = (): void => { void value; }; const done = (): void => { resolve(7); }; [done, observe].forEach(callback => { [0].forEach(callback); }); }); }\nconsole.log(await wrap(Promise.resolve(5)));\n"
  ],
  [
    "native-element-unused-callback",
    "function wrap<Value>(value: Value): Promise<number> { return new Promise<number>(resolve => { [() => { void value; }].forEach(callback => { void callback; }); resolve(7); }); }\nconsole.log(await wrap(Promise.resolve(5)));\n"
  ],
  [
    "authored-this-nonresolver",
    "function wrap<Value>(value: Value): Promise<number> { return new Promise<number>(resolve => { function observe(this: void, actual: Value): void { void actual; } [value].forEach(observe); resolve(7); }); }\nconsole.log(await wrap(Promise.resolve(5)));\n"
  ]
]);
nativeEntryInverses.push(...[
  ["known-source-ignored-callable", "function ignore(callback: () => void): () => void { void callback; return () => {}; } function wrap<Value>(value: Value): Promise<Value | number> { return new Promise<Value | number>(resolve => { [ignore(() => { resolve(value); })].forEach(actual => { actual(); }); resolve(7); }); } console.log(await wrap(Promise.resolve(5)));"],
  ["opaque-map-unused-callable", "function wrap<Value>(value: Value): Promise<Value | number> { return new Promise<Value | number>(resolve => { const values = new Map<number, () => void>([[0, () => { resolve(value); }]]); values.forEach(actual => { void actual; }); resolve(7); }); } console.log(await wrap(Promise.resolve(5)));"],
  ["opaque-set-nonresolving-callable", "function wrap<Value>(value: Value): Promise<number> { return new Promise<number>(resolve => { const values = new Set<() => void>([() => { void value; }]); values.forEach(actual => { actual(); }); resolve(7); }); } console.log(await wrap(Promise.resolve(5)));"]
]);

nativeEntryInverses.push(...[
  [
    "opaque-set-returned-observer-keeps-union-nonadoption",
    "function make<Part>(done: (value: Part) => void, value: Part): () => void { return () => { done(value); }; } function wrap<Value>(value: Value): Promise<Value | number> { return new Promise<Value | number>(resolve => { const observer = make((actual: Value): void => { void actual; }, value); const completion = make(resolve, 7); new Set([observer]).forEach(next => { next(); }); completion(); }); } console.log(await wrap(Promise.resolve(5)));"
  ],
  [
    "opaque-set-returned-observer-keeps-union-nonadoption-reversed",
    "function make<Part>(done: (value: Part) => void, value: Part): () => void { return () => { done(value); }; } function wrap<Value>(value: Value): Promise<Value | number> { return new Promise<Value | number>(resolve => { const observer = make((actual: Value): void => { void actual; }, value); const completion = make(resolve, 7); completion(); new Set([observer]).forEach(next => { next(); }); }); } console.log(await wrap(Promise.resolve(5)));"
  ],
  [
    "opaque-set-factory-callee-is-not-returned-payload",
    "function make<Value>(value: Value, done: (actual: number) => void): () => void { done(7); return () => { void value; }; } function wrap<Value>(value: Value): Promise<Value | number> { return new Promise<Value | number>(resolve => { const observer = make(value, resolve); new Set([observer]).forEach(next => { next(); }); }); } console.log(await wrap(Promise.resolve(5)));"
  ],
  [
    "opaque-set-factory-callee-is-not-returned-payload-alias",
    "function make<Value>(value: Value, done: (actual: number) => void): () => void { done(7); return () => { void value; }; } function wrap<Value>(value: Value): Promise<Value | number> { return new Promise<Value | number>(resolve => { const original = make(value, resolve); const observer = original; new Set([observer]).forEach(next => { next(); }); }); } console.log(await wrap(Promise.resolve(5)));"
  ]
]);

for (const [name, sourceText] of nativeEntryInverses) {
  test("C# native callback non-adoption inverse: " + name, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface: "js", targetOptions: { outputType: "Exe" }, sourceText });
    assert.equal(compiled.result.diagnostics.length, 0,
      JSON.stringify(compiled.result.diagnostics.map(({ code, message }) => ({ code, message }))));
    const output = executeCsharpConstruction(compiled, "native-callback-inverse-" + name, false, false, [], "");
    assert.equal(output.trim(), "7", "only the actual resolver's same-activation payload is adopted");
  });
}
const nativeOpaquePayloadCases = [
["map-callable-payload","function wrap<Value>(value: Value): Promise<Value> { return new Promise<Value>(resolve => { const values = new Map<number, () => void>([[0, () => { resolve(value); }]]); values.forEach(actual => { actual(); }); }); }","resolve(value)"],
["set-callable-payload","function wrap<Value>(value: Value): Promise<Value> { return new Promise<Value>(resolve => { const values = new Set<() => void>([() => { resolve(value); }]); values.forEach(actual => { actual(); }); }); }","resolve(value)"],
["set-returned-adopter-actual-creation","function make<Part>(done: (value: Part) => void, value: Part): () => void { return () => { done(value); }; } function wrap<Value>(value: Value): Promise<Value | number> { return new Promise<Value | number>(resolve => { const observer = make((actual: number): void => { void actual; }, 7); const completion = make(resolve, value); new Set([completion]).forEach(next => { next(); }); observer(); }); }","done(value)"],
["set-returned-adopter-actual-creation-reversed","function make<Part>(done: (value: Part) => void, value: Part): () => void { return () => { done(value); }; } function wrap<Value>(value: Value): Promise<Value | number> { return new Promise<Value | number>(resolve => { const observer = make((actual: number): void => { void actual; }, 7); const completion = make(resolve, value); observer(); new Set([completion]).forEach(next => { next(); }); }); }","done(value)"]
];

for (const [name, declarations, expression] of nativeOpaquePayloadCases) {
  test("C# native opaque callable input is unresolved, not safe empty: " + name, () => {
    const compiled = compileCsharpSource({ surface: "js", sourceText: declarations +
      "\nexport function reject(value: Promise<number>): void { void wrap(value); }" });
    assert.deepEqual(compiled.result.diagnostics.map(issue => issue.code), ["CSHARP_ASYNC_RESULT_USE_NOT_PROVEN"],
      "one precise source refusal, never a fabricated empty-safe execution or downstream native error");
    const issue = compiled.result.diagnostics[0];
    const { ast } = compiled.source;
    assert.equal(ast.kindName(issue.sourceNode), "KindCallExpression", "the original resolving operation owns uncertainty");
    assert.equal(Buffer.from(ast.getSourceText(ast.getSourceFile(issue.sourceNode))).subarray(ast.pos(issue.sourceNode), ast.end(issue.sourceNode))
      .toString("utf8").trim(), expression, "both targets report the same exact demanded operation");
    assert.equal(compiled.result.program === undefined && compiled.result.artifacts.length === 0, true,
      "an unresolved source adoption publishes no program or artifact");
  });
  test("C# ordinary opaque callable input keeps its native value: " + name, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface: "js", targetOptions: { outputType: "Exe" },
      sourceText: declarations + "\nconsole.log(await wrap(7));" });
    assert.equal(compiled.result.diagnostics.length, 0, JSON.stringify(compiled.result.diagnostics.map(({ code, message }) => ({ code, message }))));
    assert.equal(executeCsharpConstruction(compiled, "ordinary-native-opaque-" + name, false, false, [], "").trim(), "7",
      "ordinary Awaited identity does not add a refusal or alter the native callback result");
  });
}

const nativeConstructorCases = [
  [
    "direct-executor",
    "function wrap<Value>(value: Value): Promise<Value> { return new Promise<Value>(resolve => { resolve(value); }); }"
  ],
  [
    "nested-executor",
    "function wrap<Value>(value: Value): Promise<Value> { return new Promise<Value>(outer => { const nested = new Promise<void>(inner => { outer(value); inner(undefined); }); void nested; }); }"
  ],
  [
    "named-this-nested-executor",
    "function wrap<Value>(value: Value): Promise<Value> { return new Promise<Value>(outer => { function execute(this: void, inner: (value: void | PromiseLike<void>) => void): void { outer(value); inner(undefined); } const nested = new Promise<void>(execute); void nested; }); }"
  ]
];
const nativeConstructorInverses = [
  [
    "nested-nonresolver",
    "function wrap<Value>(value: Value): Promise<number> { return new Promise<number>(done => { const nested = new Promise<void>(inner => { void value; inner(undefined); }); void nested; done(7); }); }\nif ((await wrap(Promise.resolve(5))) !== 7) throw new Error(\"native constructor nonresolver\");"
  ],
  [
    "foreign-same-named-constructor",
    "namespace Foreign { export class PromiseConstructor<Part> { constructor(execute: (resolve: (actual: Part) => void) => void) { void execute; } } }\nfunction wrap<Value>(value: Value): number { const other = new Foreign.PromiseConstructor<Value>(resolve => { resolve(value); }); void other; return 7; }\nif (wrap(Promise.resolve(5)) !== 7) throw new Error(\"foreign constructor identity\");"
  ]
];

for (const [name, declarations] of nativeConstructorCases) {
  test("C# official native constructor keeps exact generic adoption: " + name, () => {
    const compiled = compileCsharpSource({ surface: "native", sourceText: declarations +
      "\nexport function reject(promised: Promise<number>): void { void wrap(promised); }" });
    rejected(compiled, "wrap(promised)", "KindCallExpression", "wrap");
  });
  test("C# official native constructor preserves its ordinary native value: " + name, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface: "native", targetOptions: { outputType: "Exe" },
      sourceText: declarations + "\nif ((await wrap(7)) !== 7) throw new Error(\"ordinary constructor payload\");" });
    assert.equal(compiled.result.diagnostics.length, 0,
      JSON.stringify(compiled.result.diagnostics.map(({ code, message }) => ({ code, message }))));
    const output = executeCsharpConstruction(compiled, "official-constructor-" + name, false, false, [], "");
    assert.equal(output.trim(), "", "the exact officially selected native constructor preserves the ordinary payload");
  });
}
for (const [name, sourceText] of nativeConstructorInverses) {
  test("C# official native constructor inverse: " + name, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface: "native", targetOptions: { outputType: "Exe" }, sourceText });
    assert.equal(compiled.result.diagnostics.length, 0,
      JSON.stringify(compiled.result.diagnostics.map(({ code, message }) => ({ code, message }))));
    const output = executeCsharpConstruction(compiled, "official-constructor-inverse-" + name, false, false, [], "");
    assert.equal(output.trim(), "", "foreign identity and nonresolving callbacks never manufacture adoption");
  });
}
function sourcePosition(ast, node, finish = false) {
  const bytes = Buffer.from(ast.getSourceText(ast.getSourceFile(node)));
  const leading = /^[\t\n\v\f\r ]*/u.exec(bytes.subarray(ast.pos(node), ast.end(node)).toString("utf8"))[0];
  const position = finish ? ast.end(node) : ast.pos(node) + Buffer.byteLength(leading);
  const lines = bytes.subarray(0, position).toString("utf8").split(/\r\n|\r|\n/u);
  return { line: lines.length, column: [...lines.at(-1)].length + 1 };
}
function sourceSpan(ast, node) {
  const start = sourcePosition(ast, node);
  const finish = sourcePosition(ast, node, true);
  return { fileName: "index.ts", ...start, endLine: finish.line, endColumn: finish.column };
}
const cases = [
  ["direct", identity, "identity"],
  ["forward-await", `${identity}\nasync function outer<Value>(value: Value): Promise<void> { await identity(value); }`, "outer"],
  ["forward-local", `${identity}\nasync function outer2<Value>(value: Value): Promise<number> { const result = await identity(value); return 0; }`, "outer2"],
  ["forward-discard", `${identity}\nfunction sync<Value>(value: Value): void { void identity(value); }`, "sync"],
  ["forward-pending", `async function later<Value>(value: Value, pending: Promise<void>) { await pending; return value; }
    async function outer3<Value>(value: Value): Promise<void> { await later(value, Promise.resolve(undefined)); }`, "outer3"],
  ["resolve", "function wrap<Value>(value: Value): void { void Promise.resolve(value); }", "wrap"],
  ["promise-like-reaction", `function likeReaction<Value>(value: Value): void {
    const pending: PromiseLike<number> = Promise.resolve(0); void pending.then(() => value);
  }`, "likeReaction"],
  ["named-executor", `function namedExecutor<Value>(value: Value) {
    function execute(resolve: (value: Value | PromiseLike<Value>) => void): void { resolve(value); }
    return new Promise<Value>(execute);
  }`, "namedExecutor"],
  ["resolver-helper", `function helper<Value>(value: Value) { return new Promise<Value>(resolve => {
    function deliver(callback: (value: Value) => void): void { callback(value); } deliver(resolve);
  }); }`, "helper"],
  ["generic-resolver-helper", `function deliver<Part>(callback: (value: Part) => void, value: Part): void { callback(value); }
    function helper<Value>(value: Value) { return new Promise<Value>(resolve => deliver(resolve, value)); }`, "helper"],
  ["member-resolver", `function helper<Value>(value: Value) { return new Promise<Value>(resolve => {
    const cell = { done: resolve }; const alias = cell.done; alias(value);
  }); }`, "helper"],
  ["typed-returned-executor", `type Executor<Part> = (resolve: (value: Part | PromiseLike<Part>) => void) => void;
    function create<Part>(value: Part): Executor<Part> { return resolve => resolve(value); }
    function helper<Value>(value: Value) { return new Promise<Value>(create(value)); }`, "helper"],
  ["nested-return", "function make<Value>(value: Value): { read(): Promise<Value> } { return { async read(): Promise<Value> { return value; } }; }", "make"],
  ["called-nested", "function consume<Value>(value: Value) { async function inner() { return value; } return inner(); }", "consume"],
  ["hoisted-call", "function consume<Value>(value: Value) { return inner(); async function inner() { return value; } }", "consume"],
  ["returned-arrow", "function consume<Value>(value: Value) { return async () => value; }", "consume"],
  ["stored-arrow", "function consume<Value>(value: Value) { const queue: (() => Promise<Value>)[] = []; const later = async () => value; queue.push(later); }", "consume"],
  ["invoked-arrow", "function consume<Value>(value: Value) { return (async () => value)(); }", "consume"],
  ["overloaded", "function identity2<Value>(value: Value): Promise<Value>; async function identity2<Value>(value: Value): Promise<Value> { return value; }", "identity2"],
];

function rejected(compiled, text, kind, declarationName) {
  assert.deepEqual(compiled.result.diagnostics.map(issue => issue.code).sort(), [code],
    "the complete diagnostic set identifies only the actual unsupported generic adoption");
  const issue = compiled.result.diagnostics[0];
  const { ast } = compiled.source;
  assert.equal(issue.sourceNode !== undefined, true, "the original checked instantiation is retained");
  assert.equal(ast.kindName(issue.sourceNode), kind, "refusal is not placed on the generic declaration");
  const file = ast.getSourceFile(issue.sourceNode);
  assert.equal(file !== undefined && compiled.source.sourceFiles.includes(file), true, "the exact checked source owns this node");
  assert.equal(Buffer.from(ast.getSourceText(file)).subarray(ast.pos(issue.sourceNode), ast.end(issue.sourceNode))
    .toString("utf8").trim(), text,
    "the precise actual instantiation, not an outer read, owns the refusal");
  assert.equal(issue.message.includes("capability C15, frozen"), true, "the supported native payload boundary is explicit");
  assert.equal(compiled.result.program === undefined && compiled.result.artifacts.length === 0, true,
    "generic adoption is refused before publication or emission");
  const nodes = [];
  const visit = node => { nodes.push(node); ast.forEachChild(node, child => { if (child !== undefined) visit(child); }); };
  compiled.source.sourceFiles.filter(file => file !== undefined && !ast.isDeclarationFile(file)).forEach(visit);
  assert.deepEqual(issue.sourceSpan, sourceSpan(ast, issue.sourceNode), "the original instantiation has its exact canonical source span");
  assert.equal(issue.evidence.length, 2, "exactly two related locations, with the signed capability in the code and message");
  for (const [index, label] of ["declaration", "first-sensitive-operation"].entries()) {
    const candidates = nodes.filter(node => {
      const position = sourcePosition(ast, node);
      return `${label} index.ts:${position.line}:${position.column}` === issue.evidence[index];
    });
    assert.equal(candidates.length > 0, true, `${label}: exact related original source coordinates`);
    if (label === "declaration") assert.equal(candidates.some(node => nodes.some(parameter =>
      ast.is.IsTypeParameterDeclaration(parameter) && ast.parent(parameter) === node) &&
      (declarationName === undefined || ast.text(ast.name(node)) === declarationName)), true,
    "the related declaration owns the actual selected generic binder");
  }
  return issue;
}

for (const [name, declarations, invoked] of cases) {
  test(`C# generic adoption refuses the actual Promise-valued ${name} site before sealing`, () => {
    rejected(compileCsharpSource({ surface: "js", sourceText: `${declarations}
      export function reject(promised: Promise<number>): void { void ${invoked}(promised); }` }),
    `${invoked}(promised)`, "KindCallExpression", invoked);
  });
  test(`C# generic adoption keeps the ordinary actual for ${name}`, () => {
    const compiled = compileCsharpSource({ surface: "js", sourceText: `${declarations}
      export function ordinary(value: number): void { void ${invoked}(value); }` });
    assert.equal(compiled.result.diagnostics.length, 0,
      JSON.stringify(compiled.result.diagnostics.map(({ code, message }) => ({ code, message }))));
    assert.equal(compiled.result.program !== undefined && compiled.result.artifacts.length > 0, true,
      "ordinary generic payloads retain their native definition and ABI");
  });
}

test("C# adoption provenance has the same fixed Unicode/CRLF payload as Rust", () => {
  const sourceText = 'const marker = "界😀";\r\nasync function identity<Value>(value: Value) {\r\n\treturn value;\r\n}\r\n' +
    "export function reject(promised: Promise<number>): void {\r\n\tvoid identity(promised);\r\n}";
  const compiled = compileCsharpSource({ surface: "js", projectRoot: "/another/csharp/src", sourceText });
  const issue = rejected(compiled, "identity(promised)", "KindCallExpression", "identity");
  assert.deepEqual(issue.sourceSpan, { fileName: "index.ts", line: 6, column: 7, endLine: 6, endColumn: 25 },
    "exact actual instantiation coordinates, not the related declaration");
  assert.deepEqual(issue.evidence, ["declaration index.ts:2:1", "first-sensitive-operation index.ts:3:2"],
    "byte-identical to the paired Rust expectation, independent of the physical checkout");
});

test("C# generic class adoption is refused at the checked constructor", () => {
  rejected(compileCsharpSource({ surface: "js", sourceText: `
    class Holder<Value> { constructor(readonly value: Value) {} async get(): Promise<Value> { return this.value; } }
    export function reject(promised: Promise<number>): void { void new Holder(promised); }
  ` }), "new Holder(promised)", "KindNewExpression", "Holder");
});

test("C# refuses a known Promise wrapper with a still-free inner payload before physical analysis", () => {
  rejected(compileCsharpSource({ surface: "js", sourceText: `${identity}
    function wrap<Value>(value: Value) { return identity(Promise.resolve(value)); }
    export function run(): void { void wrap(7); }` }),
  "identity(Promise.resolve(value))", "KindCallExpression", "identity");
});

for (const [name, extra, receiver] of [
  ["incoming", "", "Holder<Promise<number>>"],
  ["alias", "type Alias<Part> = Holder<Part>;", "Alias<Promise<number>>"],
  ["union", "", "Holder<number> | Holder<Promise<number>>"],
  ["inherited", "class Derived<Part> extends Holder<Part> {}", "Derived<Promise<number>>"],
  ["fixed-inherited", "class Derived extends Holder<Promise<number>> {}", "Derived"],
  ["indexed-inherited", "class Derived<Parts extends unknown[]> extends Holder<Parts[0]> {}", "Derived<[Promise<number>]>"],
  ["wrapped-inherited", "class Derived<Part> extends Holder<Promise<Part>> {}", "Derived<number>"],
  ["conditional-inherited", "class Derived<Part> extends Holder<Part extends number ? number : Promise<number>> {}", "Derived<string>"],
]) {
  test(`C# generic adoption refuses the actual ${name} class receiver`, () => {
    rejected(compileCsharpSource({ surface: "js", sourceText: `
      class Holder<Value> { constructor(readonly value: Value) {} async get(): Promise<Value> { return this.value; } }
      ${extra} export function reject(holder: ${receiver}) { return holder.get(); }
    ` }), "holder.get()", "KindCallExpression");
  });
}

test("C# ordinary class receiver retains an executable native payload", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", targetOptions: { outputType: "Exe" },
    sourceText: `class Holder<Value> { constructor(readonly value: Value) {}
      async get(): Promise<Value> { return this.value; } }
      async function use(holder: Holder<number>): Promise<number> { return await holder.get(); }
      console.log(await use(new Holder(7)));` });
  assert.equal(compiled.result.diagnostics.length, 0,
    JSON.stringify(compiled.result.diagnostics.map(({ code, message }) => ({ code, message }))));
  const output = executeCsharpConstruction(compiled, "generic-receiver-payload", false, false, [], "");
  assert.equal(output.trim(), "7", "ordinary actual receiver bindings remain native and executable");
});

for (const [name, declaration] of [
  ["interface", "interface Contract<Value> { read(): Promise<Value>; }"],
  ["abstract", "abstract class Contract<Value> { abstract read(): Promise<Value>; }"],
  ["callable-property", "interface Contract<Value> { read: () => Promise<Value>; }"],
  ["class-callable-property", `class Contract<Value> { read: () => Promise<Value>;
    constructor(read: () => Promise<Value>) { this.read = read; } }`],
]) {
  test(`C# generic adoption keeps the unknown ${name} receiver contract`, () => {
    rejected(compileCsharpSource({ surface: "js", sourceText: `${declaration}
      export function reject(value: Contract<Promise<number>>) { return value.read(); }` }),
    "value.read()", "KindCallExpression");
  });
}

test("C# ordinary generic source forms retain their complete native build and execution", { timeout: 300_000 }, () => {
  const files = Object.fromEntries(cases.map(([, declarations, invoked], index) => [`form${index}.ts`, `${declarations}
    export function ordinary(value: number): void { void ${invoked}(value); }`]));
  const sourceText = cases.map((_, index) => `import { ordinary as call${index} } from "./form${index}.js";`).join("\n") +
    cases.map((_, index) => `call${index}(7);`).join("\n") + "\nconsole.log(7);";
  const compiled = compileCsharpSource({ surface: "js", targetOptions: { outputType: "Exe" }, sourceText, files });
  assert.equal(compiled.result.diagnostics.length, 0,
    JSON.stringify(compiled.result.diagnostics.map(({ code, message }) => ({ code, message }))));
  const output = executeCsharpConstruction(compiled, "ordinary-generic-forms", false, false, [], "");
  assert.equal(output.trim(), "7", "every ordinary form runs under the real native event-loop owner");
});

for (const recursive of [false, true]) {
  const helper = recursive ? `function deliver<Value>(callback: (value: Value) => void, value: Value, count: number): void {
    if (count > 0) bounce(callback, value, count - 1); else callback(value);
  } function bounce<Value>(callback: (value: Value) => void, value: Value, count: number): void {
    if (count > 0) deliver(callback, value, count - 1); else callback(value);
  }` : "function deliver<Value>(callback: (value: Value) => void, value: Value, count: number): void { callback(value); }";
  test(`C# retains ${recursive ? "recursive" : "direct"} resolver/value correlation in native execution`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface: "js", targetOptions: { outputType: "Exe" }, sourceText: `${helper}
      function wrap<Value>(value: Value): Promise<number> { return new Promise<number>(resolve => {
        deliver(resolve, 7, 2); deliver(item => { void item; }, value, 2);
      }); }
      console.log(await wrap(Promise.resolve(11)));` });
    assert.equal(compiled.result.diagnostics.length, 0,
      JSON.stringify(compiled.result.diagnostics.map(({ code, message }) => ({ code, message }))));
    const output = executeCsharpConstruction(compiled, `resolver-${recursive ? "recursive" : "direct"}-rows`, false, false, [], "");
    assert.equal(output.trim(), "7", "the Promise-valued actual reaches only the ordinary callback");
  });
  test(`C# refuses the matching ${recursive ? "recursive" : "direct"} adopting resolver row`, () => {
    rejected(compileCsharpSource({ surface: "js", sourceText: `${helper}
      function wrap<Value>(value: Value): Promise<Value> { return new Promise<Value>(resolve => deliver(resolve, value, 2)); }
      export function reject(promised: Promise<number>): void { void wrap(promised); }` }),
    "wrap(promised)", "KindCallExpression", "wrap");
  });
}

test("C# keeps opaque resolver provenance explicitly unresolved for a Promise-valued actual", () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `declare function opaque<Value>(value: Value): Value;
    function wrap<Value>(value: Value) { return new Promise<Value>(resolve => { const done = opaque(resolve); done(value); }); }
    export function reject(promised: Promise<number>): void { void wrap(promised); }` });
  assert.deepEqual(compiled.result.diagnostics.map(issue => issue.code), ["CSHARP_ASYNC_RESULT_USE_NOT_PROVEN"],
    "one exact unresolved source admission, not a safe empty summary or a later native error");
  const issue = compiled.result.diagnostics[0];
  const { ast } = compiled.source;
  assert.equal(ast.kindName(issue.sourceNode), "KindCallExpression", "the original unresolved operation is the diagnostic site");
  assert.equal(Buffer.from(ast.getSourceText(ast.getSourceFile(issue.sourceNode)))
    .subarray(ast.pos(issue.sourceNode), ast.end(issue.sourceNode)).toString("utf8").trim(), "done(value)",
  "the precise same source operation is reported on both targets");
  assert.equal(compiled.result.program === undefined && compiled.result.artifacts.length === 0, true,
    "the unresolved source summary publishes no program or artifacts");
});

test("C# preserves an ordinary native actual despite an open symbolic resolver alias", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", targetOptions: { outputType: "Exe" }, sourceText: `
    type Alias<Value> = (resolve: (value: Value) => void) => (value: Value) => void;
    function wrap<Value>(value: Value, alias: Alias<Value>): Promise<Value> {
      return new Promise<Value>(resolve => { const done = alias(resolve); done(value); });
    }
    console.log(await wrap<number>(7, resolve => resolve));` });
  assert.equal(compiled.result.diagnostics.length, 0,
    JSON.stringify(compiled.result.diagnostics.map(({ code, message }) => ({ code, message }))));
  const output = executeCsharpConstruction(compiled, "ordinary-resolver-alias", false, false, [], "");
  assert.equal(output.trim(), "7", "a proven non-adopting ordinary payload preserves the complete native callback and value behavior");
});

for (const [name, body] of [
  ["unused-named", "async function unused() { return value; } return 1;"],
  ["discarded-arrow", "async () => value; return 1;"],
  ["type-only", "async function unused() { return value; } type OnlyType = typeof unused; return 1;"],
  ["erased-forwarding", "function unused() { return identity(value); } return 1;"],
]) {
  test(`C# erases ${name} without refusing or executing its generic async body`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface: "js", targetOptions: { outputType: "Exe" },
      sourceText: `${identity}\nfunction consume<Value>(value: Value): number { ${body} }
        console.log(consume(Promise.resolve(1)));` });
    assert.equal(compiled.result.diagnostics.length, 0,
      JSON.stringify(compiled.result.diagnostics.map(({ code, message }) => ({ code, message }))));
    const output = executeCsharpConstruction(compiled, `generic-erased-${name}`, false, false, [], "");
    assert.equal(output.trim(), "1", "only the retained consume body runs");
  });
}

for (const declaration of [
  "interface Contract { identity<Value>(value: Value): Promise<Value>; }",
  "abstract class Contract { abstract identity<Value>(value: Value): Promise<Value>; }",
]) {
  test(`C# generic adoption keeps its unknown ${declaration.startsWith("interface") ? "interface" : "abstract"} signature`, () => {
    rejected(compileCsharpSource({ surface: "js", sourceText: `${declaration}
      export function reject(contract: Contract, promised: Promise<number>): void { void contract.identity(promised); }` }),
    "contract.identity(promised)", "KindCallExpression", "identity");
  });
}

test("C# unknown source generic bodies fail closed at their actual instantiation", () => {
  rejected(compileCsharpSource({ surface: "js", sourceText: `
    export function reject(callback: <Value>(value: Value) => Promise<Value>, promised: Promise<number>): void {
      void callback(promised);
    }
  ` }), "callback(promised)", "KindCallExpression");
});

test("C# ordinary library generics and constrained native values do not acquire an adoption refusal", () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    async function primitive<Value extends number>(value: Value): Promise<Value> { return value; }
    export async function run(): Promise<number> { return await primitive(7); }
  ` });
  assert.equal(compiled.result.diagnostics.length, 0,
    JSON.stringify(compiled.result.diagnostics.map(({ code, message }) => ({ code, message }))));
  assert.equal(compiled.result.program !== undefined, true, "a native primitive constraint is a checked non-adopting contract");
  for (const source of [
    "export async function run(): Promise<number[]> { return await Promise.all([1, 2].map(async value => value)); }",
    "export function run(): Promise<number>[] { return [1, 2].map(async value => value); }",
    "async function worker(): Promise<number> { return 7; } export async function run(): Promise<number[]> { return await Promise.all([worker(), worker()]); }",
  ]) {
    const result = compileCsharpSource({ surface: "js", sourceText: source }).result;
    assert.equal(result.diagnostics.filter(issue => issue.code === code).length, 0,
      "ambient library binders keep their existing lowering outcome, not the source-generic boundary");
  }
});
