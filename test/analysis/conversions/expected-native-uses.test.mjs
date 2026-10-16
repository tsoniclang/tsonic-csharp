import assert from "node:assert/strict";
import test from "node:test";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { createCsharpExpectedUseCollection } from "../../../dist/analysis/expected-types/collection.js";
import { createCsharpExpectedConstructUses } from "../../../dist/analysis/expected-types/construct-uses.js";
import { createCsharpExpectedReturnTargets } from "../../../dist/analysis/expected-types/return-targets.js";
import { createCsharpExpectedTypePropagation } from "../../../dist/analysis/expected-types/propagation.js";
import { collectCsharpExpectedNativeUseSites } from "../../../dist/analysis/expected-types/native-uses.js";
import { csharpNativeUseSite } from "../../../dist/target-model/records/native-demand.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { targetTypeRefKey } from "../../../dist/target-model/types/equality.js";

function owners(sourceText, surface = "native", targetOptions) {
  const compiled = compileCsharpSource({ sourceText, surface, targetOptions });
  assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
  const program = compiled.result.program;
  assert.equal(program !== undefined, true, compiled.result.diagnostics.map(({ code, message }) => `${code}: ${message}`).join("; "));
  const source = createTargetSourceProgram(compiled.source);
  const ast = source.ast;
  const records = program.records;
  const nodes = [];
  const walk = node => { nodes.push(node); ast.forEachChild(node, child => { if (child !== undefined) walk(child); }); };
  for (const file of program.sourceFiles) walk(file);
  const contracts = nodes.filter(node => ast.is.IsFunctionDeclaration(node) && ast.body(node) !== undefined).flatMap(node => {
    const declared = records.returnContract.get(node);
    const returnType = records.generatorTargetType.get(node) ?? (declared?.kind === "resolved" ? declared.type : undefined);
    return returnType === undefined ? [] : [{ sourceDeclaration: node, returnType }];
  });
  const input = {
    policy: { ast, sourceFiles: program.sourceFiles, semantics: source.semantics.forFile, typeDefinitions: program.typeDefinitions },
    evidence: records,
    operations: { ...records, nativePointer: { get() { assert.fail("losing raw pointer reader"); } },
      typedLocation: { get() { assert.fail("losing raw location reader"); } } },
    objectShapes: program.objectShapes,
    callables: { declarationContracts: contracts, closedInputType: () => undefined, get: () => undefined },
    valueReadStages: { get: node => { const read = records.valueRead.get(node); return read === undefined ? undefined
      : { literalTarget: read.selectedOperation ?? read.source, operationValue: read.selectedOperation ?? read.source }; } },
    declarations: records,
  };
  const collection = createCsharpExpectedUseCollection(input.policy);
  const constructs = createCsharpExpectedConstructUses(input, collection);
  const returns = createCsharpExpectedReturnTargets(input, collection);
  const propagation = createCsharpExpectedTypePropagation(input, collection, (node, target) => records.expectedBinary.get(node, target));
  const text = node => String(ast.getSourceText(ast.getSourceFile(node))).slice(ast.pos(node), ast.end(node)).trim().replace(/\s+/gu, " ");
  return { compiled, program, ast, nodes, input, collection, constructs, returns, propagation, text };
}

function collect(value) {
  for (const node of value.nodes) {
    value.constructs.recordInitializer(node);
    value.constructs.recordOperationUses(node, value.ast.getSourceFile(node));
    value.returns.recordReturnExpression(node);
    value.returns.recordExpressionBodyReturn(node);
    value.constructs.recordThrownValue(node);
  }
  value.returns.recordReturnDemands();
  for (let pending = value.collection.takePending(); pending !== undefined; pending = value.collection.takePending()) value.propagation.propagate(pending);
  return collectCsharpExpectedNativeUseSites(value.collection.seal().requests);
}

for (const surface of ["native", "js"]) test(`${surface} actual selected calls and wrapper forwarding preserve exact source/effective/parameter sites`, () => {
  const value = owners(`
    import type { int32 } from "@tsonic/core/types.js";
    function identity(value: int32): int32 { return value; }
    export function run(value: int32): int32 { const selected: int32 = identity((value)); return selected; }
  `, surface);
  const sites = collect(value);
  const call = value.nodes.find(node => value.ast.is.IsCallExpression(node) && value.text(node) === "identity((value))");
  assert.equal(call !== undefined, true);
  const callRequests = sites.requests.filter(request => request.site.subject === call && request.site.role.startsWith("argument:"));
  assert.equal(callRequests.length, 1);
  const [request] = callRequests;
  assert.equal(request.kind === "requested" && request.site.role.includes("effective=0") && request.site.role.includes("parameter=0") &&
    value.text(request.expression) === "(value)", true);
  const children = sites.requests.filter(child => child.forwardedFrom === request.site);
  assert.equal(children.length > 0 && children.every(child => child.site.subject === request.expression), true, "explicit exact forwarding edge");
  assert.equal(sites.get(csharpNativeUseSite(call, { kind: "argument", sourceIndex: 0, effectiveIndex: 1, parameterIndex: 0 },
    { target: request.targetType })).length, 0, "wrong effective identity has no positional fallback");
  assert.equal(Object.hasOwn(value.program.records, "nativeUseSites") || Object.hasOwn(value.program.records, "expectedUse"), false,
    "the private requests are not final backend records");
});

test("constructed pointer and ordinary source domains read the chosen RNH payload without raw applicability probes", () => {
  const value = owners(`
    import { unsafe as directUnsafe } from "@tsonic/csharp/lang.js";
    import { offsetnativeptr } from "@tsonic/core/lang.js";
    import type { ptr } from "@tsonic/csharp/lang.js";
    import type { int32, nativeInt } from "@tsonic/core/types.js";
    export function shifted(pointer: ptr<int32>, offset: nativeInt): ptr<int32> { return directUnsafe(offsetnativeptr(pointer, offset)); }
  `, "native", { languageDialect: "csharp15-preview" });
  const sites = collect(value);
  const pointer = value.nodes.find(node => value.program.records.nativeHandler.get(node)?.selection.kind === "offset");
  assert.equal(pointer !== undefined, true);
  const requests = sites.requests.filter(request => request.site.subject === pointer);
  assert.equal(requests.some(request => request.site.role === "intrinsic-operand:offset" && value.text(request.expression) === "offset"), true);
  assert.equal(requests.every(request => !request.site.role.startsWith("argument:")), true, "native intrinsic never re-enters the losing call grouping");
});

test("generator completion and constructor parameters remain actual pre-seal request roots", () => {
  const value = owners(`
    import type { int32 } from "@tsonic/core/types.js";
    export class Box { constructor(public value: int32) {} }
    export function build(value: int32): Box { return new Box(value); }
    export function* values(): Generator<int32, string, unknown> { yield 1; return "done"; }
  `);
  const sites = collect(value);
  const constructor = value.nodes.find(node => value.ast.is.IsNewExpression(node));
  const returned = value.nodes.find(node => value.ast.is.IsReturnStatement(node) && value.text(node) === 'return "done";');
  assert.equal(sites.requests.some(request => request.site.subject === constructor && request.site.role.startsWith("argument:")), true);
  const completion = sites.requests.filter(request => request.site.subject === returned && request.site.role === "return");
  assert.equal(completion.length === 1 && completion[0].kind === "requested" && value.text(completion[0].expression) === '"done"', true,
    "generator return completion is not dropped by the collection split");
});

for (const surface of ["native", "js"]) test(`${surface} numeric request evidence retains actual selected operation carriers without folding source summaries`, () => {
  const value = owners(`
    import type { int32, float64 } from "@tsonic/core/types.js";
    export const plain = 7 / 2;
    export const typed: int32 = 7 / 2;
    export const floating: float64 = 7 / 2;
    export const numberResult: number = (1 + 2) / 4;
    export const product = (7 / 2) * 10;
  `, surface);
  const sites = collect(value);
  const rows = value.nodes.filter(node => value.ast.is.IsVariableDeclaration(node) &&
    ["plain", "typed", "floating", "numberResult", "product"].includes(value.ast.text(value.ast.name(node)))).map(node => {
    const expression = value.ast.as.AsVariableDeclaration(node).Initializer;
    const selected = value.program.records.binaryOperation.get(expression)?.target;
    assert.equal(selected?.kind === "resolved", true, "the real operation owner selected the expression");
    const carrier = type => type === undefined ? null : targetTypeRefKey(type);
    return { name: value.ast.text(value.ast.name(node)), source: value.text(expression),
      left: carrier(selected.leftInputType), right: carrier(selected.rightInputType), result: carrier(selected.resultType),
      readSource: carrier(value.program.records.valueRead.get(expression)?.source),
      expected: value.program.records.requiredExpectedType.get(expression).map(carrier),
      requests: sites.requestsOf(expression).map(request => ({ role: request.site.role, kind: request.kind,
        target: carrier(request.targetType), exactInteger: request.exactInteger, mode: request.mode })) };
  });
  assert.equal(rows.length, 5, "all typed/untyped controls are observed");
  console.log(JSON.stringify({ numericOwnerEvidence: surface, rows }));
  const typed = rows.find(row => row.name === "typed");
  assert.equal(typed.expected.includes(targetTypeRefKey(csharpSourcePrimitiveTargetType("int32"))), true,
    "the authored integer use remains explicit, not reconstructed from generated syntax");
});
