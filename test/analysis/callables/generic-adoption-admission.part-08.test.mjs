import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { code, identity, nativeEntryCases, nativeEntryInverses, nativeOpaquePayloadCases, nativeConstructorCases, nativeConstructorInverses, sourcePosition, sourceSpan, cases, rejected, declaredNativePromiseCall } from "./generic-adoption-admission.fixtures.mjs";

for (const [name, declarations, expression] of Array.from(nativeOpaquePayloadCases).slice(12, 13)) {
test("C# ordinary opaque callable input keeps its native value: " + name, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface: "js", targetOptions: { outputType: "Exe" },
      sourceText: declarations + "\nconsole.log(await wrap(7));" });
    assert.equal(compiled.result.diagnostics.length, 0, JSON.stringify(compiled.result.diagnostics.map(({ code, message }) => ({ code, message }))));
    assert.equal(executeCsharpConstruction(compiled, "ordinary-native-opaque-" + name, false, false, [], "").trim(), "7",
      "ordinary Awaited identity does not add a refusal or alter the native callback result");
  });
}

for (const [name, declarations, expression] of Array.from(nativeOpaquePayloadCases).slice(13, 18)) {
test("C# native opaque callable input is unresolved, not safe empty: " + name, () => {
    const compiled = compileCsharpSource({ surface: "js", sourceText: declarations +
      "\nexport function reject(value: Promise<number>): void { void wrap(value); }" });
    const issue = rejected(compiled, "wrap(value)", "KindCallExpression", "wrap");
    const { ast } = compiled.source;
    assert.equal(ast.kindName(issue.sourceNode), "KindCallExpression", "the original resolving operation owns uncertainty");
    assert.equal(Buffer.from(ast.getSourceText(ast.getSourceFile(issue.sourceNode))).subarray(ast.pos(issue.sourceNode), ast.end(issue.sourceNode))
      .toString("utf8").trim(), "wrap(value)", "approved C-1348: the declared instantiation owns adoption");
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

for (const [name, declarations] of Array.from(nativeConstructorCases).slice(0, 3)) {
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

for (const [name, sourceText] of Array.from(nativeConstructorInverses).slice(0, 2)) {
test("C# official native constructor inverse: " + name, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface: "native", targetOptions: { outputType: "Exe" }, sourceText });
    assert.equal(compiled.result.diagnostics.length, 0,
      JSON.stringify(compiled.result.diagnostics.map(({ code, message }) => ({ code, message }))));
    const output = executeCsharpConstruction(compiled, "official-constructor-inverse-" + name, false, false, [], "");
    assert.equal(output.trim(), "", "foreign identity and nonresolving callbacks never manufacture adoption");
  });
}

for (const [name, declarations, invoked] of Array.from(cases).slice(0, 19)) {
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

test("adoption provenance carries its fixed Unicode/CRLF payload independent of the project root", () => {
  const sourceText = 'const marker = "界😀";\r\nasync function identity<Value>(value: Value) {\r\n\treturn value;\r\n}\r\n' +
    "export function reject(promised: Promise<number>): void {\r\n\tvoid identity(promised);\r\n}";
  const compiled = compileCsharpSource({ surface: "js", projectRoot: "/another/csharp/src", sourceText });
  const issue = rejected(compiled, "identity(promised)", "KindCallExpression", "identity");
  assert.deepEqual(issue.sourceSpan, { fileName: "index.ts", line: 6, column: 7, endLine: 6, endColumn: 25 },
    "exact actual instantiation coordinates, not the related declaration");
  assert.deepEqual(issue.evidence, ["declaration index.ts:2:1", "first-sensitive-operation index.ts:3:2"],
    "byte-identical, independent of the physical checkout");
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

for (const [name, extra, receiver, unsupportedHeritage] of Array.from([
  ["incoming", "", "Holder<Promise<number>>"],
  ["alias", "type Alias<Part> = Holder<Part>;", "Alias<Promise<number>>"],
  ["union", "", "Holder<number> | Holder<Promise<number>>"],
  ["inherited", "class Derived<Part> extends Holder<Part> {}", "Derived<Promise<number>>"],
  ["fixed-inherited", "class Derived extends Holder<Promise<number>> {}", "Derived"],
  ["indexed-inherited", "class Derived<Parts extends unknown[]> extends Holder<Parts[0]> {}", "Derived<[Promise<number>]>", "Holder<Parts[0]>"],
  ["wrapped-inherited", "class Derived<Part> extends Holder<Promise<Part>> {}", "Derived<number>"],
  ["conditional-inherited", "class Derived<Part> extends Holder<Part extends number ? number : Promise<number>> {}", "Derived<string>", "Holder<Part extends number ? number : Promise<number>>"],
]).slice(0, 8)) {
test(`C# generic adoption refuses the actual ${name} class receiver`, () => {
    const compiled = compileCsharpSource({ surface: "js", sourceText: `
      class Holder<Value> { constructor(readonly value: Value) {} async get(): Promise<Value> { return this.value; } }
      ${extra} export function reject(holder: ${receiver}) { return holder.get(); }
    ` });
    if (unsupportedHeritage === undefined) {
      rejected(compiled, "holder.get()", "KindCallExpression");
      return;
    }
    assert.deepEqual(compiled.result.diagnostics.map(issue => issue.code),
      ["CSHARP_PROJECT_HERITAGE_TARGET_UNRESOLVED"],
      "approved C-1386: dependent base types retain their precise v1 heritage refusal");
    const issue = compiled.result.diagnostics[0];
    const { ast } = compiled.source;
    assert.equal(ast.kindName(issue.sourceNode), "KindExpressionWithTypeArguments",
      "the original dependent heritage clause owns the refusal, not the receiver call");
    const sourceFile = ast.getSourceFile(issue.sourceNode);
    assert.equal(sourceFile !== undefined && compiled.source.sourceFiles.includes(sourceFile), true,
      "approved C-1389: the heritage subject retains its original checked source owner");
    assert.equal(Buffer.from(ast.getSourceText(sourceFile))
      .subarray(ast.pos(issue.sourceNode), ast.end(issue.sourceNode)).toString("utf8").trim(),
    unsupportedHeritage, "the unchanged authored base type is retained exactly");
    const column = 7 + extra.indexOf(unsupportedHeritage);
    assert.deepEqual(sourceSpan(ast, issue.sourceNode), { fileName: "index.ts", line: 3, column,
      endLine: 3, endColumn: column + unsupportedHeritage.length },
    "the diagnostic's original checked heritage node keeps its exact source span");
    assert.equal(compiled.result.program === undefined && compiled.result.artifacts.length === 0, true,
      "unsupported dependent heritage publishes no program or artifact");
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

for (const [name, declaration] of Array.from([
  ["interface", "interface Contract<Value> { read(): Promise<Value>; }"],
  ["abstract", "abstract class Contract<Value> { abstract read(): Promise<Value>; }"],
  ["callable-property", "interface Contract<Value> { read: () => Promise<Value>; }"],
  ["class-callable-property", `class Contract<Value> { read: () => Promise<Value>;
    constructor(read: () => Promise<Value>) { this.read = read; } }`],
]).slice(0, 4)) {
test(`C# generic adoption keeps the unknown ${name} receiver contract`, () => {
    declaredNativePromiseCall(compileCsharpSource({ surface: "js", sourceText: `${declaration}
      export function reject(value: Contract<Promise<number>>) { return value.read(); }` }),
    "value.read()");
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

for (const recursive of Array.from([false, true]).slice(0, 2)) {
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
    "one exact unresolved source admission, not a safe empty summary or a later native error: " +
      JSON.stringify(compiled.result.diagnostics.map(({ code, message, sourceNode }) => ({ code, message,
        start: sourceNode === undefined ? undefined : compiled.source.ast.pos(sourceNode),
        end: sourceNode === undefined ? undefined : compiled.source.ast.end(sourceNode) }))));
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

for (const [name, body] of Array.from([
  ["unused-named", "async function unused() { return value; } return 1;"],
  ["discarded-arrow", "async () => value; return 1;"],
  ["type-only", "async function unused() { return value; } type OnlyType = typeof unused; return 1;"],
  ["erased-forwarding", "function unused() { return identity(value); } return 1;"],
]).slice(0, 1)) {
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
