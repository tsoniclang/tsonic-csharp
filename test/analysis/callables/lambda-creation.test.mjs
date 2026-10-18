import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles, formatDiagnostics } from "@tsonic/tsts";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { analyzeCsharpCaptureStorage } from "../../../dist/analysis/callables/capture-storage.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { compileCsharpRequiredRecordSource } from "../../helpers/required-records.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { createCsharpPlanningContext } from "../../../dist/backend/planner/context.js";
import { planParametersWithPrelude } from "../../../dist/backend/planner/declarations/callables/parameters.js";
import { planLambdaParameterStorage } from "../../../dist/backend/planner/expressions/lambda-parameter-storage.js";
import { createDestructuringPlannerState } from "../../../dist/backend/planner/bindings/index.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { getCsharpMethodValue } from "../../../dist/target-model/types/method-values.js";
import { csharpCaptureFrameCachedInstanceName } from "../../../dist/target-model/records/capture-storage.js";

const scalar = Object.freeze({ kind: "source-primitive", name: "float64" });
const callable = csharpDelegateTargetType("System.Func", [scalar], scalar);

function fixture(body, quotation = false, expectedIssueCodes = []) {
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/project",
    files: { "/project/index.ts": `
      declare function invoke(mapper: (value: number) => number): number;
      declare function unknown(mapper: (value: number) => number): number;
      export function run(value: number) { ${body} }
    ` }, compilerOptions: { strict: true, target: "es2022", module: "esnext" } }).checkSource();
  assert.equal(checked.diagnostics.length, 0, formatDiagnostics(checked.diagnostics.slice(0, 4)).slice(0, 1024));
  const source = createTargetSourceProgram(checked);
  const file = checked.getSourceFile("/project/index.ts");
  assert.equal(file !== undefined, true, "checked source file");
  const lambdas = [];
  const calls = [];
  const declarations = new Map();
  const visit = node => {
    if (source.ast.is.IsArrowFunction(node) || source.ast.is.IsFunctionExpression(node)) lambdas.push(node);
    if (source.ast.is.IsCallExpression(node)) calls.push(node);
    if (source.ast.is.IsFunctionDeclaration(node)) declarations.set(source.ast.text(source.ast.name(node)), node);
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(file);
  const operations = new Map(calls.map(call => {
    const checkedCall = source.semantics.forNode(call).operations.call(call);
    const callee = source.ast.as.AsCallExpression(call)?.Expression;
    const declaration = callee === undefined ? undefined : source.navigation.sourceReferenceFor(callee)?.declaration;
    const parameter = { type: callable, passingMode: "by-value" };
    const selected = declaration === declarations.get("invoke") ? { origin: "source-profile",
      invocationOnlyCallableArgumentIndexes: Object.freeze([0]),
      arguments: [{ sourceArgumentIndex: 0, sourceForm: "value", targetParameter: parameter }],
    } : { origin: "provider", invocationOnlyCallableArgumentIndexes: Object.freeze([0]),
      arguments: [{ sourceArgumentIndex: 0, sourceForm: "value", targetParameter: parameter }],
    };
    return [call, { source: checkedCall, target: { kind: "resolved", call: Object.freeze(selected) } }];
  }));
  const evidence = { compileTimeMetadata: { get: () => false },
    typeParameterConstraints: { get: () => [] },
    nodeTargetType: { get: node => source.ast.is.IsArrowFunction(node) || source.ast.is.IsFunctionExpression(node) ? callable : scalar },
    storageTargetType: { get: () => undefined } };
  const storage = { nativeBacking: { get: () => undefined },
    nativeArray: { get: () => undefined },
    storageType: { get: () => undefined },
    typedLocationIdentity: { get: () => false } };
  const names = { resolve: () => ({ kind: "resolved", name: "selected" }), temporaryName: name => name };
  const target = quotation ? { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "Fixture::Quotation", csharpExpressionTreeDelegateType: callable } : callable;
  const selected = analyzeCsharpCaptureStorage(source, { knownShapes: () => [] }, storage, evidence,
    [], names, { runtimeDefault: Object.freeze({ get: () => undefined }) }, { selectedCall: Object.freeze({ get: node => operations.get(node) }) },
    { callableTarget: Object.freeze({ get: node => lambdas.includes(node) ? target : undefined }) });
  if (expectedIssueCodes.length === 0) assert.equal(selected.issues.length === 0, true, "closed capture storage");
  else assert.equal(selected.issues.length === expectedIssueCodes.length && selected.issues.every((issue, index) =>
    issue.code === expectedIssueCodes[index]), true, "the exact missing native contract is retained, not treated as an empty environment");
  assert.equal(lambdas.length, 1, "one exact authored callable");
  return { selected, lambda: lambdas[0], operations, source };
}

for (const [name, body] of [
  ["inline argument", "return invoke((entry: number) => entry + 1);"],
  ["parenthesized argument", "return invoke(((entry: number) => entry + 1));"],
  ["satisfies argument", "return invoke(((entry: number) => entry + 1) satisfies ((value: number) => number));"],
  ["inline named recursion", "return invoke(function recurse(entry: number): number { return entry === 0 ? 1 : recurse(entry - 1); });"],
  ["immutable aliases", "const mapper = (entry: number) => entry + 1; const alias = mapper; invoke(alias); return invoke(mapper);"],
]) {
  test(`capture-free ${name} selects the native cached delegate`, () => {
    const input = fixture(body);
    const selected = input.selected.lambdaCreation.get(input.lambda);
    assert.equal(selected.kind, "cached");
    assert.equal(selected.staticBody, true);
    assert.equal(Object.isFrozen(selected), true);
  });
}

for (const [name, body, staticBody = true] of [
  ["unknown destination", "return unknown((entry: number) => entry + 1);"],
  ["optional argument call", "return invoke?.((entry: number) => entry + 1);"],
  ["spread argument", "return invoke(...[(entry: number) => entry + 1]);"],
  ["mixed destination aliases", "const mapper = (entry: number) => entry + 1; const alias = mapper; invoke(alias); return unknown(mapper);"],
  ["observed identity", "const mapper = (entry: number) => entry + 1; const alias = mapper; invoke(alias); return mapper === alias;"],
  ["returned value", "const mapper = (entry: number) => entry + 1; invoke(mapper); return mapper;"],
  ["stored value", "const mapper = (entry: number) => entry + 1; invoke(mapper); return { mapper };"],
  ["writable alias", "let mapper = (entry: number) => entry + 1; return invoke(mapper);"],
  ["unproved declaration annotation", "const mapper: (entry: number) => number = entry => entry + 1; return invoke(mapper);"],
  ["named self value", "return invoke(function self(entry: number): number { const alias = self; return alias === self ? entry : -1; });", false],
]) {
  test(`${name} follows the native capture and shared-identity contract`, () => {
    const input = fixture(body);
    const selected = input.selected.lambdaCreation.get(input.lambda);
    assert.equal(selected.kind, staticBody ? "cached" : "fresh");
    assert.equal(selected.staticBody, staticBody, "observed self values require their exact nonstatic identity binding");
  });
}

test("returned capturing closures retain their fresh native activation", () => {
  const input = fixture("return (entry: number) => entry + value;");
  const selected = input.selected.lambdaCreation.get(input.lambda);
  assert.equal(selected.kind, "fresh", "an actual lexical capture is not shared across evaluations");
  assert.equal(selected.staticBody, false, "the captured argument requires its own native environment");
});

test("invocation-only captured callbacks use their native activation without static caches", () => {
  const input = fixture("return invoke((entry: number) => entry + value);");
  assert.equal(input.selected.lambdaCreation.get(input.lambda).kind, "inline");
  assert.equal(input.selected.lambdaCreation.get(input.lambda).staticBody, false);
});

test("missing callable creation evidence remains conservative", () => {
  const input = fixture("return invoke((entry: number) => entry + 1);");
  const unknown = input.selected.lambdaCreation.get({});
  assert.equal(unknown.kind, "fresh");
  assert.equal(unknown.staticBody, false);
  assert.equal(Object.isFrozen(unknown), true);
});

test("an unresolved generic callable contract cannot establish an empty cached environment", () => {
  const input = fixture("return <Item>(entry: Item): Item => entry;", false, ["CSHARP_GENERIC_CALLABLE_CONTRACT_NOT_CLOSED"]);
  const creation = input.selected.lambdaCreation.get(input.lambda);
  assert.equal(creation.kind === "fresh" && creation.staticBody === false, true,
    "a syntactically capture-free generic body without its resolved native callable owner is not a proven cache candidate");
  assert.equal(input.selected.captureClosure.get(input.lambda) === undefined, true,
    "a missing generic owner cannot publish a fabricated empty native frame");
});

for (const surface of ["native", "js"]) test(`${surface} empty generic callable environments share their native cached owner with no per-evaluation allocation`,
  { timeout: 300_000 }, () => {
  const selected = compileCsharpRequiredRecordSource(`
    import type { int64 } from "@tsonic/core/types.js";
    type Identity = <Item>(value: Item) => Item;
    export function make(): Identity { return <Item>(value: Item): Item => value; }
    export function other(): Identity { return <Item>(value: Item): Item => value; }
    export function typed<Outer>(): <Item>(value: Item, other: Outer) => Outer {
      return <Item>(value: Item, other: Outer): Outer => other;
    }
    export function captured(seed: number): Identity {
      return <Item>(value: Item): Item => { if (seed < 0) throw new Error("captured seed"); return value; };
    }
    let emptyVisits = 0;
    function observeEmpty(value: {}): void { emptyVisits += 1; }
    export function capturedEmpty(unit: {}): Identity {
      return <Item>(value: Item): Item => { observeEmpty(unit); return value; };
    }
    export function run(): boolean {
      const first = make();
      const alias = first;
      const second = make();
      const different = other();
      const typedFirst = typed<int64>();
      const typedSecond = typed<int64>();
      if (first !== second || alias !== second || first === different || first(7) !== 7 || second("value") !== "value") return false;
      if (typedFirst !== typedSecond || typedFirst(true, 9007199254740993n) !== 9007199254740993n) return false;
      const capturedFirst = captured(7);
      const capturedSecond = captured(7);
      if (capturedFirst === capturedSecond || capturedFirst(3) !== 3 || !capturedSecond(true)) return false;
      const empty = {};
      const emptyFirst = capturedEmpty(empty);
      const emptySecond = capturedEmpty(empty);
      if (emptyFirst === emptySecond || emptyFirst(5) !== 5 || !emptySecond(true) || emptyVisits !== 2) return false;
      return true;
    }
  `, surface);
  const { source, program, nodes } = selected;
  const declarations = new Map(nodes.filter(node => source.ast.is.IsFunctionDeclaration(node))
    .map(node => [source.ast.text(source.ast.name(node)), node]));
  const returned = name => {
    const declaration = declarations.get(name);
    const statement = source.ast.statements(source.ast.body(declaration)).find(node => source.ast.is.IsReturnStatement(node));
    const expression = statement === undefined ? undefined : source.ast.as.AsReturnStatement(statement)?.Expression;
    assert.equal(expression !== undefined && source.ast.is.IsArrowFunction(expression), true, `${name}: original exact returned generic expression`);
    return expression;
  };
  const cache = new Map();
  for (const name of ["make", "other", "typed"]) {
    const expression = returned(name);
    const creation = program.records.lambdaCreation.get(expression);
    const closure = program.records.captureClosure.get(expression);
    assert.equal(creation.kind === "cached" && creation.staticBody === true && closure?.frame.ownership === "value" &&
      closure.frame.bindings.length === 0 && closure.frame.parents.length === 0 && closure.frame.receivers.length === 0, true,
    `${name}: the canonical pre-seal decision uses complete, genuinely empty native environment evidence`);
    assert.equal(Object.isFrozen(creation) && Object.isFrozen(closure.frame) && Object.isFrozen(closure.method), true,
      `${name}: renderer inputs are immutable native owner facts`);
    cache.set(name, closure);
  }
  for (const name of ["captured", "capturedEmpty"]) {
    const expression = returned(name);
    const creation = program.records.lambdaCreation.get(expression);
    const closure = program.records.captureClosure.get(expression);
    assert.equal(creation.kind === "fresh" && creation.staticBody === false && closure?.frame.bindings.length === 1, true,
      `${name}: any actual captured binding remains a fresh activation, including an object with no authored fields`);
  }
  const typed = cache.get("typed");
  assert.equal(typed.frame.shape.targetType.kind === "target-named" && typed.frame.shape.targetType.typeArguments?.length === 1, true,
    "a type-only outer native environment remains in the cached class's exact closed generic specialization");
  const generated = [...selected.compiled.artifacts].filter(([path]) => path.endsWith(".cs")).map(([, text]) => text).join("\n");
  for (const [name, closure] of cache) assert.equal(generated.includes(csharpCaptureFrameCachedInstanceName(closure.method)), true,
    `${name}: the same admitted cache member is emitted and referenced, not a second runtime cache choice`);
  const invocation = getCsharpMethodValue(cache.get("make").method.type)?.method;
  const typedInvocation = getCsharpMethodValue(typed.method.type)?.method;
  assert.equal(typeof invocation === "string" && typeof typedInvocation === "string", true,
    "native proof invokes the actual selected quantified entry, never a guessed method name");
  executeCsharpConstruction(selected.compiled, `cached-generic-native-owner-${surface}`, false, false, [], `
using Subject = Tsonic.Generated.Index;
if (!Subject.run()) throw new System.Exception("generic cached identity, native values, captured identity or receiver effects");
var first = Subject.make();
if (!System.Object.ReferenceEquals(first, Subject.make()) || System.Object.ReferenceEquals(first, Subject.other()) ||
    first.${invocation}<long>(9007199254740993L) != 9007199254740993L ||
    !System.Object.ReferenceEquals(Subject.typed<long>(), Subject.typed<long>()) ||
    Subject.typed<long>().${typedInvocation}<bool>(true, 9007199254740993L) != 9007199254740993L)
    throw new System.Exception("native cached instance specialization or exact generic argument result");
for (int index = 0; index < 20000; index++) {
    _ = Subject.make().${invocation}<int>(index);
    _ = Subject.typed<long>().${typedInvocation}<bool>(true, index);
    _ = NativeIdentity.Instance.Invoke<int>(index);
    _ = NativeOuter<long>.Instance.Invoke<bool>(true, index);
}
long before = System.GC.GetAllocatedBytesForCurrentThread();
long sum = 0;
for (int index = 0; index < 20000; index++) {
    sum += Subject.make().${invocation}<int>(index);
    sum += Subject.typed<long>().${typedInvocation}<bool>(true, index);
}
long actualBytes = System.GC.GetAllocatedBytesForCurrentThread() - before;
if (sum != 399980000L || actualBytes != 0)
    throw new System.Exception("empty generic callable creation must have zero per-evaluation allocation");
before = System.GC.GetAllocatedBytesForCurrentThread();
long nativeSum = 0;
for (int index = 0; index < 20000; index++) {
    nativeSum += NativeIdentity.Instance.Invoke<int>(index);
    nativeSum += NativeOuter<long>.Instance.Invoke<bool>(true, index);
}
long nativeBytes = System.GC.GetAllocatedBytesForCurrentThread() - before;
if (nativeSum != sum || nativeBytes != 0 || nativeBytes != actualBytes)
    throw new System.Exception("the exact handwritten native cached-owner baseline and generated path must both allocate zero bytes");
sealed class NativeIdentity {
    public static readonly NativeIdentity Instance = new NativeIdentity();
    public Item Invoke<Item>(Item value) { return value; }
}
sealed class NativeOuter<Outer> {
    public static readonly NativeOuter<Outer> Instance = new NativeOuter<Outer>();
    public Outer Invoke<Item>(Item value, Outer other) { return other; }
}
`);
});

for (const body of ["return invoke((entry: number) => entry + 1);", "return invoke((entry: number) => entry + value);"]) {
  test(`exact quotation evidence preserves syntax independently of delegate flow (${body})`, () => {
    const input = fixture(body, true);
    const selected = input.selected.lambdaCreation.get(input.lambda);
    assert.equal(selected.kind, "quotation");
    assert.equal(selected.staticBody, false);
    assert.equal(input.selected.captureClosure.get(input.lambda) === undefined, true, "quotation has no native capture closure");
    assert.equal(Object.isFrozen(selected), true);
  });
}

for (const surface of ["native", "js"]) test(`${surface} checked physical entries erase this and reconstruct one native fixed tuple without allocation`,
  { timeout: 240_000 }, () => {
    const selected = compileCsharpRequiredRecordSource(`import type { int32, float64 } from "@tsonic/core/types.js";
      function identity(this: void, value: int32): int32 { return value; }
      export function pair(...items: [left: int32, right: int32]): int32 {
        items[0] = items[0] + 1;
        return items[0] + items[1];
      }
      function rest(...items: int32[]): int32 { return items[0] + items[1]; }
      export function adapted(): float64 {
        const callback: (left: int32, right: int32) => float64 = (...items: [float64, float64]): float64 => {
          items[0] += 0.5;
          return items[0] + items[1];
        };
        return callback(3, 4);
      }
      function make(this: void, seed: int32): () => int32 { return () => { seed++; return seed; }; }
      class Cell {
        private current: int32 = 0;
        get value(): int32 { return this.current; }
        set value(next: int32) { this.current = next; }
      }
      export function run(): boolean {
        const first = make(2);
        const second = make(7);
        const callback: (value: int32, index: int32) => int32 = (...items: [int32, int32]): int32 => items[0] + items[1];
        let stored: int32 = 0;
        const literal = { get value(): int32 { return stored; }, set value(next: int32) { stored = next; } };
        const cell = new Cell();
        literal.value = 11;
        cell.value = 13;
        return identity(7) === 7 && pair(3, 4) === 8 && rest(2, 5) === 7 && callback(3, 4) === 7 &&
          first() === 3 && first() === 4 && second() === 8 && literal.value === 11 && cell.value === 13;
      }`, surface);
    const { source, program, nodes } = selected;
    const declaration = name => nodes.find(node => source.ast.is.IsFunctionDeclaration(node) && source.ast.text(source.ast.name(node)) === name);
    const identity = declaration("identity");
    const pair = declaration("pair");
    const rest = declaration("rest");
    const erased = source.ast.parameters(identity)[0];
    const ordinary = source.ast.parameters(identity)[1];
    const identityEntry = program.records.callableTarget.entry(identity);
    assert.equal(identityEntry?.sourceDeclaration === identity && identityEntry.parameters.length === 1 &&
      identityEntry.parameters[0].sourceParameter === ordinary && identityEntry.parameters[0].sourceProjection.length === 0, true,
    "the native entry retains the actual checked value parameter, never the authored receiver metadata slot");
    assert.equal(program.records.nativeUse.order(erased) === undefined && program.records.nativeUse.order(ordinary) !== undefined, true,
      "the erased receiver is outside the admitted native binding/construct domain");
    const entry = program.records.callableTarget.entry(pair);
    const tupleParameter = source.ast.parameters(pair)[0];
    assert.equal(entry?.parameters.length === 2 && entry.parameters.every((parameter, index) =>
      parameter.sourceParameter === tupleParameter && parameter.sourceProjection.length === 1 &&
      parameter.sourceProjection[0].kind === "tuple-element" && parameter.sourceProjection[0].index === index &&
      parameter.targetParameter.paramsArray !== true && parameter.targetParameter.passingMode === "by-value"), true,
    "finite tuple components retain original source identity, ordered native slots and non-params ABI");
    const storage = program.records.requiredStorageType.get(tupleParameter);
    assert.equal(program.records.lambdaParameterType.get(tupleParameter) === undefined && storage?.kind === "tuple" && storage.elements.length === 2 &&
      entry.parameters.every((parameter, index) => targetTypeRefEquals(parameter.targetParameter.type, storage.elements[index])), true,
      "the original mutable body binding keeps its complete native tuple, not one arbitrarily selected component");
    const restEntry = program.records.callableTarget.entry(rest);
    assert.equal(restEntry?.parameters.length === 1 && restEntry.parameters[0].targetParameter.paramsArray === true &&
      restEntry.parameters[0].sourceProjection[0]?.kind === "array-element", true,
    "a genuine array rest remains one native params collection, distinct from a fixed tuple entry");
    assert.equal(Object.isFrozen(identityEntry) && Object.isFrozen(entry) && Object.isFrozen(entry.parameters) &&
      entry.parameters.every(parameter => Object.isFrozen(parameter) && Object.isFrozen(parameter.sourceProjection)), true,
    "the canonical entry and source projection vectors are immutable before emission");
    assert.equal(program.records.callableTarget.entry({}) === undefined, true, "a foreign declaration cannot borrow any physical entry");
    const adapted = nodes.find(node => source.ast.is.IsArrowFunction(node) && source.ast.parameters(node).some(parameter => {
      const bodyType = program.records.requiredStorageType.get(parameter);
      return bodyType?.kind === "tuple" && bodyType.elements.every(element => element.kind === "source-primitive" && element.name === "float64");
    }));
    const adaptedParameter = adapted === undefined ? undefined : source.ast.parameters(adapted)[0];
    const adaptedInput = program.records.lambdaParameterType.get(adaptedParameter);
    const adaptedStorage = program.records.requiredStorageType.get(adaptedParameter);
    const adaptation = program.records.conversion.get(adaptedInput, adaptedStorage, "implicit");
    assert.equal(adaptedParameter !== undefined && adaptedInput?.kind === "tuple" &&
      adaptedInput.elements.every(element => element.kind === "source-primitive" && element.name === "int32") &&
      adaptedStorage?.kind === "tuple" && adaptedStorage.elements.every(element => element.kind === "source-primitive" && element.name === "float64") &&
      adaptation?.kind === "implicit" && adaptation.proof === "tuple", true,
    "the same storage owner admits the complete native incoming tuple to authored body tuple conversion before emission");
    const context = createCsharpPlanningContext(program);
    const file = source.ast.getSourceFile(pair);
    const diagnostics = [];
    const planned = planParametersWithPrelude(pair, file, context, diagnostics);
    assert.equal(diagnostics.length === 0 && planned.parameters.length === 2, true, "the backend consumes the exact two admitted scalar slots");
    const initializers = planned.prelude.filter(statement => statement.kind === "LocalDeclarationStatement" && statement.initializer?.kind === "TupleExpression");
    assert.equal(initializers.length === 1 && initializers[0].initializer.elements.length === 2, true,
      "the original body binding is constructed once as a stack tuple, never an array allocation");
    assert.equal(planned.parameters.every(parameter => parameter.isParams !== true), true, "neither fixed tuple slot becomes params");
    assert.throws(() => planParametersWithPrelude(source.ast.parameters(pair), file, context, [], createDestructuringPlannerState()),
      error => error.diagnostic?.code === "TSONIC_INTERNAL_PLANNER_INVARIANT" &&
        error.message === "An emitted callable requires its exact sealed physical entry contract.",
    "the removed raw parameter-array entry API is rejected, not accepted as a compatibility overload");
    const arrow = nodes.find(node => source.ast.is.IsArrowFunction(node) && source.ast.parameters(node).some(parameter =>
      source.ast.as.AsParameterDeclaration(parameter)?.DotDotDotToken !== undefined));
    const carrier = program.records.callableTarget.get(arrow);
    assert.equal(carrier !== undefined, true, "the tuple-rest lambda has its one actual selected creation carrier");
    assert.throws(() => planLambdaParameterStorage(source.ast.parameters(arrow), file, context, [], createDestructuringPlannerState(), carrier),
      error => error.diagnostic?.code === "TSONIC_INTERNAL_PLANNER_INVARIANT" &&
        error.message === "An emitted callable requires its exact sealed physical entry contract.",
    "the lambda renderer also rejects the removed raw array form");
    executeCsharpConstruction(selected.compiled, `physical-native-entry-${surface}`, false, false, [], `
      if (!Tsonic.Generated.Index.run()) throw new System.Exception("entry identity/default/capture/body semantics");
      if (Tsonic.Generated.Index.adapted() != 7.5D) throw new System.Exception("sealed tuple parameter conversion/body mutation");
      _ = Tsonic.Generated.Index.pair(3, 4);
      long before = System.GC.GetAllocatedBytesForCurrentThread();
      int sum = 0;
      for (int index = 0; index < 20000; index++) sum += Tsonic.Generated.Index.pair(3, 4);
      long allocated = System.GC.GetAllocatedBytesForCurrentThread() - before;
      if (sum != 160000 || allocated != 0) throw new System.Exception("fixed tuple entry requires zero per-call heap allocation");
      before = System.GC.GetAllocatedBytesForCurrentThread();
      double adaptedSum = 0D;
      for (int index = 0; index < 20000; index++) adaptedSum += Tsonic.Generated.Index.adapted();
      allocated = System.GC.GetAllocatedBytesForCurrentThread() - before;
      if (adaptedSum != 150000D || allocated != 0) throw new System.Exception("native tuple parameter conversion must not allocate or round away body mutation");
    `);
  });
