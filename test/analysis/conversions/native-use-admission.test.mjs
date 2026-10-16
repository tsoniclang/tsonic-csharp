import assert from "node:assert/strict";
import test from "node:test";
import { createTargetSourceProgram, analyzeSourceLiteralValues } from "@tsonic/target-api/source";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { analyzeCsharpExpectedTypes } from "../../../dist/analysis/expected-types/analyze.js";
import { admitCsharpExpectedNativeUses, collectCsharpExpectedNativeUseSites } from "../../../dist/analysis/expected-types/native-uses.js";
import { analyzeCsharpExactLiteralSelections } from "../../../dist/analysis/conversions/literal-plans.js";
import { csharpNativeUseSite } from "../../../dist/target-model/records/native-demand.js";
import { analyzeCsharpCallableCreations } from "../../../dist/analysis/callables/creation.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";

function owners(sourceText, surface) {
  const compiled = compileCsharpSource({ sourceText, surface });
  assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
  const program = compiled.result.program;
  assert.equal(program !== undefined, true, compiled.result.diagnostics.map(item => `${item.code}: ${item.message}`).join("; "));
  const source = createTargetSourceProgram(compiled.source);
  const ast = source.ast;
  const nodes = [];
  const walk = node => { nodes.push(node); ast.forEachChild(node, child => { if (child !== undefined) walk(child); }); };
  for (const file of program.sourceFiles) walk(file);
  const records = program.records;
  const literalValues = analyzeSourceLiteralValues(ast, program.sourceFiles);
  const contracts = nodes.filter(node => ast.is.IsFunctionDeclaration(node) && ast.body(node) !== undefined).flatMap(node => {
    const declared = records.returnContract.get(node);
    return declared?.kind === "resolved" ? [{ sourceDeclaration: node, returnType: declared.type }] : [];
  });
  const expected = analyzeCsharpExpectedTypes({ ast, sourceFiles: program.sourceFiles, literalValues,
    semantics: source.semantics.forFile, typeDefinitions: program.typeDefinitions }, records, records, program.objectShapes,
    { declarationContracts: contracts, closedInputType: () => undefined, get: () => undefined },
    { get: node => { const read = records.valueRead.get(node); return read === undefined ? undefined
      : { literalTarget: read.selectedOperation ?? read.source, operationValue: read.selectedOperation ?? read.source }; } }, records);
  const exact = analyzeCsharpExactLiteralSelections(literalValues, expected.nativeUseSites.requests.flatMap(request =>
    request.expression === undefined ? [] : [{ expression: request.expression, target: request.targetType }]));
  const final = { ast, exactLiteral: exact.exactLiteral, callableCreation: { get: () => undefined }, valueRead: records.valueRead,
    absentValue: { get: () => false }, operations: records };
  const initializer = name => ast.as.AsVariableDeclaration(nodes.find(node => ast.is.IsVariableDeclaration(node) && ast.text(ast.name(node)) === name)).Initializer;
  return { ast, nodes, program, expected, final, initializer };
}

for (const surface of ["native", "js"]) test(`${surface} real expected requests admit selected numeric carriers without integer-summary substitution`, () => {
  const value = owners(`
    import type { int32, float64 } from "@tsonic/core/types.js";
    export const typed: int32 = 7 / 2;
    export const product: float64 = (7 / 2) * 10;
    export function divide(left: int32, right: int32): float64 { return left / right; }
  `, surface);
  const admission = admitCsharpExpectedNativeUses(value.expected, value.final);
  for (const expression of [value.initializer("typed"), value.initializer("product")]) {
    const requests = value.expected.nativeUseSites.requestsOf(expression).filter(request => request.kind === "requested" &&
      request.site.role === "initializer");
    assert.equal(requests.length > 0, true, "real initializer requests");
    for (const request of requests) {
      const use = admission.expectedUse.get(request.site);
      const selected = value.expected.expectedBinary.get(expression, request.targetType);
      assert.equal(use !== undefined && selected?.kind === "resolved" && use.carrier === selected.resultType, true, "actual selected physical carrier");
    }
  }
  const binary = value.nodes.find(node => value.ast.is.IsBinaryExpression(node) &&
    value.ast.is.IsIdentifier(value.ast.as.AsBinaryExpression(node).Left) && value.ast.text(value.ast.as.AsBinaryExpression(node).Left) === "left");
  const uses = admission.entries.filter(entry => entry.use.expression === binary);
  assert.equal(uses.length > 0 && uses.every(entry => entry.use.carrier.kind === "source-primitive" && entry.use.carrier.name === "int32"), true,
    "integer-operand division remains integer before its requested float conversion");
  assert.equal(Object.isFrozen(admission) && Object.isFrozen(admission.entries) && admission.entries.every(entry => Object.isFrozen(entry.use)), true, "native-use-admission:62: Object.isFrozen(admission) && Object.isFrozen(admission.entries) && admission.entries.ever");
  assert.equal(Object.hasOwn(value.program.records, "expectedUse"), false, "private finalizer is not program publication");
});

test("exact dependencies do not borrow another expression's forwarding owner or a different target", () => {
  const value = owners("export const wrapped = (1); export const other = 2;", "native");
  const requests = value.expected.nativeUseSites.requests;
  const parent = requests.find(request => request.kind === "requested" && request.expression === value.initializer("wrapped"));
  assert.equal(parent !== undefined, true, "native-use-admission:70: parent !== undefined");
  const orphan = { ...parent, site: csharpNativeUseSite(value.initializer("other"), { kind: "operand", position: "only" }, { target: parent.targetType }),
    forwardedFrom: csharpNativeUseSite(value.initializer("other"), { kind: "initializer" }, { target: parent.targetType }) };
  const expected = { ...value.expected, nativeUseSites: collectCsharpExpectedNativeUseSites([...requests, orphan]) };
  const admission = admitCsharpExpectedNativeUses(expected, value.final);
  assert.equal(admission.expectedUse.get(orphan.site) === undefined, true, "no expression-wide first owner fallback");
  assert.equal(admission.pending.some(entry => entry.site === orphan.site && entry.reason === "forwarding-owner-unresolved"), true, "native-use-admission:76: admission.pending.some(entry => entry.site === orphan.site && entry.reason === \"forwarding");
});

test("unfinalized callable creation remains pending despite a known requested delegate", () => {
  const value = owners(`import type { int32 } from "@tsonic/core/types.js";
    export const callback: (value: int32) => int32 = value => value;`, "native");
  const admission = admitCsharpExpectedNativeUses(value.expected, value.final);
  const requests = value.expected.nativeUseSites.requestsOf(value.initializer("callback"));
  assert.equal(requests.length > 0, true, "native-use-admission:84: requests.length > 0");
  assert.equal(requests.every(request => admission.expectedUse.get(request.site) === undefined), true, "native-use-admission:85: requests.every(request => admission.expectedUse.get(request.site) === undefined)");
  assert.equal(requests.every(request => admission.pending.some(entry => entry.site === request.site && entry.reason === "callable-creation")), true, "native-use-admission:86: requests.every(request => admission.pending.some(entry => entry.site === request.site && e");
});

test("a required pending request and a cycle stay explicit rather than publishing a partial prefix", () => {
  const value = owners("export const result = 1;", "native");
  const expression = value.initializer("result");
  const request = value.expected.nativeUseSites.requestsOf(expression).find(entry => entry.kind === "requested");
  assert.equal(request !== undefined, true, "native-use-admission:93: request !== undefined");
  const first = csharpNativeUseSite(expression, { kind: "operand", position: "left" }, { target: request.targetType });
  const second = csharpNativeUseSite(expression, { kind: "operand", position: "right" }, { target: request.targetType });
  const pending = { ...request, kind: "pending", reason: "argument-unresolved" };
  const expected = { ...value.expected, nativeUseSites: collectCsharpExpectedNativeUseSites([pending,
    { ...request, site: first, forwardedFrom: second }, { ...request, site: second, forwardedFrom: first }]) };
  const admission = admitCsharpExpectedNativeUses(expected, value.final);
  assert.equal(admission.entries.length, 0, "native-use-admission:100: admission.entries.length");
  assert.deepEqual(admission.pending.map(entry => entry.reason), ["argument-unresolved", "forwarding-cycle", "forwarding-cycle"], "native-use-admission:101: admission.pending.map(entry => entry.reason)");
});

function nativeCreations(value, overrides = {}) {
  const records = value.program.records;
  const contract = declaration => {
    const result = records.returnContract.get(declaration);
    if (result?.kind !== "resolved") return undefined;
    const parameters = value.ast.parameters(declaration).map(parameter => {
      const type = records.lambdaParameterType.get(parameter) ?? records.valueRead.get(parameter)?.value;
      return type === undefined ? undefined : { sourceParameter: parameter, targetParameter: { type, passingMode: "by-value" } };
    });
    return parameters.some(parameter => parameter === undefined) ? undefined : {
      sourceDeclaration: declaration, methodTypeParameterIdentities: [], parameters, returnType: result.type,
    };
  };
  return analyzeCsharpCallableCreations({ ast: value.ast, nodes: value.nodes,
    captures: records, contracts: { get: identity => contract(identity.declaration), closedInputType: () => undefined }, expectedTypes: records,
    storage: records, evidence: records, conversions: records, ...overrides });
}

for (const surface of ["native", "js"]) {
  test(`${surface} actual callable creation consumes closed native parameters rather than an unrelated requested delegate`, () => {
    const value = owners(`import type { int32 } from "@tsonic/core/types.js";
      export const callback: (value: int32) => int32 = value => value;`, surface);
    const expression = value.initializer("callback");
    const actual = nativeCreations(value);
    const selected = actual.callableCreation.get(expression);
    assert.equal(selected?.kind === "selected", true, "the completed callable has one selected creation");
    assert.equal(actual.callableTarget.get(expression) === selected.carrier, true, "publication reads the canonical creation object");
    assert.equal(Object.isFrozen(selected) && Object.isFrozen(actual), true, "creation evidence is immutable");
    const unrelated = csharpDelegateTargetType("System.Func", [csharpSourcePrimitiveTargetType("float64")],
      csharpSourcePrimitiveTargetType("float64"));
    const mismatched = nativeCreations(value, { expectedTypes: { callableTarget: { get: () => unrelated } } });
    assert.equal(mismatched.callableCreation.get(expression)?.kind, "selected", "actual native creation remains available independently of an unrelated destination");
    assert.equal(mismatched.callableTarget.get(expression) !== unrelated, true, "an unproved requested carrier never replaces actual creation");
    const unproven = nativeCreations(value, { contracts: { get: () => undefined, closedInputType: () => undefined }, storage: { lambdaParameterType: { get: () => undefined } } });
    assert.equal(unproven.callableCreation.get(expression)?.kind, "pending", "known contextual demand alone is not physical creation proof");
  });
}

test("frame callable creation retains the selected implementation carrier before contextual conversion", () => {
  const value = owners(`export function create(): () => number {
    let value = 0; const increment = () => ++value; const read = () => value; increment(); return read;
  }`, "native");
  const expression = value.nodes.find(node => value.ast.is.IsArrowFunction(node) &&
    value.program.records.captureClosure.get(node) !== undefined);
  assert.equal(expression !== undefined, true, "the real capture owner publishes a shared-frame method");
  const closure = value.program.records.captureClosure.get(expression);
  const selected = nativeCreations(value).callableCreation.get(expression);
  assert.equal(selected?.kind === "selected" && selected.carrier === closure.method.type, true,
    "actual frame method identity is authoritative, not the consumer's delegate request");
});

test("discarded callable definitions do not manufacture a carrier or a runtime value", () => {
  const value = owners("export function run(): void { (() => 1); }", "native");
  const expression = value.nodes.find(node => value.ast.is.IsArrowFunction(node));
  assert.equal(expression !== undefined, true, "one checked discarded definition");
  const actual = nativeCreations(value);
  assert.equal(actual.callableCreation.get(expression)?.kind, "discarded", "completed allocation decision is retained");
  assert.equal(actual.callableTarget.get(expression) === undefined, true, "no delegate carrier for an erased definition");
});
