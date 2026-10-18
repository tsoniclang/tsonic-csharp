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

const scalar = Object.freeze({ kind: "source-primitive", name: "float64" });
const callable = csharpDelegateTargetType("System.Func", [scalar], scalar);

function fixture(body, quotation = false) {
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
  assert.equal(selected.issues.length === 0, true, "closed capture storage");
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
    const selected = compileCsharpRequiredRecordSource(`import type { int32 } from "@tsonic/core/types.js";
      function identity(this: void, value: int32): int32 { return value; }
      export function pair(...items: [left: int32, right: int32]): int32 {
        items[0] = items[0] + 1;
        return items[0] + items[1];
      }
      function rest(...items: int32[]): int32 { return items[0] + items[1]; }
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
      _ = Tsonic.Generated.Index.pair(3, 4);
      long before = System.GC.GetAllocatedBytesForCurrentThread();
      int sum = 0;
      for (int index = 0; index < 20000; index++) sum += Tsonic.Generated.Index.pair(3, 4);
      long allocated = System.GC.GetAllocatedBytesForCurrentThread() - before;
      if (sum != 160000 || allocated != 0) throw new System.Exception("fixed tuple entry requires zero per-call heap allocation");
    `);
  });
