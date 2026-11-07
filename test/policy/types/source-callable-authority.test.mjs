// Source callable authority over Host facts (nextgen C-2542 §2, R2, I2). The deleted resolution/source-ownership.ts
// and generic-arguments.ts read checker signatures and checked binder references; their successors read the role
// model (identity.target / isProjectDeclaration), the published callable descriptors and the Host instantiation.
import assert from "node:assert/strict";
import test from "node:test";
import { hostProgram, representationServices, representations, represented } from "../../representation/host-fixture.mjs";
import { isSourceOwnedCallableRuntimeCarrierSubject } from "../../../dist/analysis/conversions/source-ownership.js";
import { publishedCsharpCallableInterface } from "../../../dist/analysis/source-evidence/types/published-callable-interface.js";
import { representInstantiation, csharpRepresentationContext } from "../../../dist/representation/index.js";
import { csharpSourcePrimitiveTargetType, targetTypeRefEquals } from "../../../dist/target-model/types/index.js";

const ownershipSource = `
import type { int32 } from "@tsonic/core/types.js";
import { foreign } from "./external.js";
function twice(value: int32): int32 { return value; }
const alias = twice;
const arrow = (value: int32): int32 => value;
const borrowed = foreign;
const count: int32 = 1 as int32;
export function run(): number { return alias(count) + arrow(count) + borrowed(count); }
`;

function ownershipFixture() {
  const program = hostProgram(ownershipSource, { files: { "external.d.ts": "export declare function foreign(value: number): number;" } });
  const at = representations(representationServices(program));
  const input = { ast: program.ast, facts: program.facts, sourceFiles: program.host.sourceFiles,
    sourceFacts: program.host.sourceFacts, types: { value: node => at.value(node) } };
  const run = program.named("run");
  const reference = name => {
    const found = program.nodes.find(node => program.ast.is.IsIdentifier(node) && program.ast.text(node) === name &&
      program.ast.is.IsCallExpression(program.ast.parent(node)) && isWithin(program, node, run));
    assert.notEqual(found, undefined, name);
    return found;
  };
  return { program, input, reference, owns: node => isSourceOwnedCallableRuntimeCarrierSubject(node, input) };
}

function isWithin(program, node, owner) {
  for (let current = node; current !== undefined; current = program.ast.parent(current)) if (current === owner) return true;
  return false;
}

test("inferred aliases of project callables keep Source callable authority from the published signature", () => {
  const { owns, reference } = ownershipFixture();
  assert.equal(owns(reference("alias")), true, "an alias of a project function is source owned");
  assert.equal(owns(reference("arrow")), true, "an authored arrow function value is source owned");
});

test("foreign, declaration-file and non-callable references do not manufacture Source callable authority", () => {
  const { owns, reference, program } = ownershipFixture();
  assert.equal(owns(reference("borrowed")), false, "a signature declared in a declaration file is not Source authority");
  const count = program.nodes.find(node => program.ast.is.IsIdentifier(node) && program.ast.text(node) === "count" &&
    program.ast.is.IsCallExpression(program.ast.parent(node)));
  assert.equal(owns(count), false, "a scalar value has no callable carrier");
  assert.equal(owns(undefined), false);
});

const interfaceSource = `
import type { int32, int64 } from "@tsonic/core/types.js";
export interface Unary<Value> { (value: Value): Value; }
export interface Concrete extends Unary<int64> {}
export interface Mixed { (value: int64): int64; readonly count: int32; }
export interface Factory { new(): Unary<int64>; }
`;

test("callable interface classification consumes the complete published inventory", () => {
  const program = hostProgram(interfaceSource);
  const host = { ast: program.ast, facts: program.facts };
  const selected = name => publishedCsharpCallableInterface(program.named(name), host);
  assert.notEqual(selected("Unary"), undefined, "the open callable inventory remains callable");
  const concrete = selected("Concrete");
  const parameter = concrete?.type.calls[0]?.parameters[0]?.type;
  assert.equal(parameter?.kind === "primitive" && parameter.primitive === "int64", true,
    "the inherited application is substituted by the Host and keeps its exact native width");
  assert.equal(selected("Mixed"), undefined, "a data member is not dropped to manufacture a pure callable");
  assert.equal(selected("Factory"), undefined, "a construct signature is not a call signature");
});

test("published callable interface selection rejects refused, foreign and unexpressible publications", () => {
  const program = hostProgram(`
import type { int32, int64 } from "@tsonic/core/types.js";
export interface Unary { (value: int32): int64; }
export interface Foreign { (value: int32): int64; }
`);
  const declaration = program.named("Unary");
  const foreign = program.named("Foreign");
  const outcome = program.facts.values.type(declaration);
  assert.equal(outcome.kind !== "refused" && outcome.type.kind === "declared", true, "the interface has its declared publication");
  const withOutcome = selected => ({ ast: program.ast,
    facts: { ...program.facts, values: { ...program.facts.values, type: node => node === declaration ? selected : program.facts.values.type(node) } } });
  assert.notEqual(publishedCsharpCallableInterface(declaration, withOutcome(outcome)), undefined, "control: the real publication");
  const cases = [
    { kind: "refused", source: "tsonic", code: "TSONIC_LOCAL_TYPE_UNSUPPORTED", site: declaration },
    { ...outcome, provenance: { ...outcome.provenance, occurrence: foreign } },
    { ...outcome, type: { ...outcome.type, declaration: foreign } },
    { ...outcome, type: { kind: "declared", declaration, typeArguments: [], cut: "unexpressible" } },
  ];
  for (const [index, selected] of cases.entries()) {
    assert.equal(publishedCsharpCallableInterface(declaration, withOutcome(selected)), undefined,
      `case ${index}: a refusal, another identity or a cut cannot manufacture callable structure`);
  }
});

test("explicit call type arguments come only from the Host instantiation, with their native width", () => {
  const program = hostProgram(`
import type { int32 } from "@tsonic/core/types.js";
function identity<Value>(value: Value): Value { return value; }
function plain(value: int32): int32 { return value; }
export function run(value: int32): int32 { return plain(identity<int32>(value)); }
`);
  const call = name => program.nodes.find(node => program.ast.is.IsCallExpression(node) &&
    program.ast.text(program.ast.as.AsCallExpression(node).Expression) === name);
  const instantiation = program.facts.instantiations.at(call("identity"));
  assert.equal(instantiation !== undefined && instantiation.kind !== "refused" && instantiation.method.length === 1, true,
    "one Host instantiation with one method binder");
  const binder = program.ast.typeParameters(program.named("identity"))[0];
  assert.equal(instantiation.method[0].declaration === binder, true, "the binding names the authored binder declaration");
  const services = representationServices(program);
  const represented_ = representInstantiation(instantiation, csharpRepresentationContext(services, call("identity"), "type-argument"));
  assert.equal(targetTypeRefEquals(represented(represented_.method[0]), csharpSourcePrimitiveTargetType("int32")), true);
  assert.equal(targetTypeRefEquals(represented(represented_.result), csharpSourcePrimitiveTargetType("int32")), true);
  assert.equal(program.facts.instantiations.at(call("plain")), undefined, "a non-generic call has no instantiation");
});
