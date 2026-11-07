import assert from "node:assert/strict";
import test from "node:test";
import { createTargetSourceProgram, sourceTypeDescriptorSum } from "@tsonic/target-api/source";
import { checkCsharpSource, assertCsharpCheckingSucceeded } from "../../../helpers/direct-csharp-session.mjs";
import { createCsharpTypeResolutionServices } from "../../../../dist/analysis/source-evidence/types/resolution/engine.js";
import { resolveCsharpPublishedUnionMembers, resolveCsharpUnionMemberCarrier } from "../../../../dist/analysis/source-evidence/types/resolution/source-evidence.js";
import { resolveCsharpSourceTypeDescriptor } from "../../../../dist/analysis/source-evidence/types/resolution/effective-types.js";
import { resolveAuthoredAndSelectedSourceType } from "../../../../dist/analysis/source-evidence/types/resolution/selected-values.js";
import { csharpSourcePrimitiveTargetType } from "../../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpRuntimeUnionTargetType, isCsharpAbsenceTargetType } from "../../../../dist/target-model/types/carriers/runtime-carriers.js";
import { targetTypeRefEquals } from "../../../../dist/target-model/types/equality.js";

const unexpected = () => assert.fail("published E3 selection must never retry a checked carrier or shape");
let retained;
function fixture() {
  if (retained !== undefined) return retained;
  const checked = checkCsharpSource({ sourceText: [
    "export function read(value: undefined | string | int32): undefined | string | int32 { return value; }",
    "export function foreign(value: string | uint32): string | uint32 { return value; }",
  ].join("\n") });
  assertCsharpCheckingSucceeded(checked);
  const source = createTargetSourceProgram(checked.source);
  const ast = source.ast;
  const declaration = source.navigation.nodes.find(node => ast.is.IsFunctionDeclaration(node) &&
    ast.text(ast.name(node)) === "read");
  const parameter = ast.parameters(declaration)[0];
  const syntax = ast.typeNode(parameter);
  const outcome = source.effectiveTypes.get(parameter);
  assert.equal(outcome?.kind !== "refused" && outcome?.type.kind === "optional", true,
    "the original checked width and absence have their actual Host publication");
  const queries = source.semantics.forNode(parameter);
  const host = { target: checked.target, ast, effectiveTypes: source.effectiveTypes,
    navigation: source.navigation, typeParameterConstraints: {}, bindingProjection: unexpected,
    sourceStorage: { storageSubjectFor(node) {
      assert.equal(node === syntax, true, "only the original authored type component is queried for storage");
      return undefined;
    } },
    semantics: file => source.semantics.forNode(file), semanticsFor: node => source.semantics.forNode(node),
    hasSemantics: file => source.semantics.includes(file), structuralTypes: { resolveTarget: unexpected },
  };
  const scope = { host, resolveTypeWithState: unexpected, resolveNodeWithState: unexpected };
  const carrier = resolveCsharpSourceTypeDescriptor(scope, outcome.type, { depth: 0 }, parameter);
  assert.equal(carrier !== undefined, true, "the exact published Source sum has a native representation");
  retained = { source, ast, parameter, syntax, outcome, queries, host, scope, carrier };
  return retained;
}

test("published union members retain exact original E3 roles and native widths without checked retries", () => {
  const input = fixture();
  const members = createCsharpTypeResolutionServices(input.host).policy.sourceUnionMembers(input.parameter, input.carrier);
  const record = sourceTypeDescriptorSum(input.ast, input.outcome.type);
  assert.equal(members?.length === record.arms.length, true, "all Source arms, including absence, stay indexed");
  for (const [index, member] of members.entries()) {
    assert.equal(member.descriptor === record.arms[index].type && member.role === record.arms[index].role &&
      member.arm === index && record.roles.find(role => role.role === member.role).arms.includes(index), true,
    "the original role identity and closed arm index are separate published facts");
    const selected = resolveCsharpUnionMemberCarrier(input.scope, input.carrier, input.outcome.type,
      member.descriptor, input.parameter, { depth: 0 });
    assert.equal(targetTypeRefEquals(selected, member.carrier), true, "each exact selected Source component retains its arm");
  }
  const integer = members.find(member => member.descriptor.kind === "primitive");
  assert.equal(targetTypeRefEquals(integer.carrier, csharpSourcePrimitiveTargetType("int32")), true,
    "the checker number category cannot widen the published int32 arm");
  assert.equal(members.filter(member => isCsharpAbsenceTargetType(member.carrier)).length, 1,
    "the original absence index is retained without a payload or a second nullish variant");
});

test("published union member selection rejects foreign widths and ordered or absent carrier mismatches", () => {
  const input = fixture();
  const members = resolveCsharpPublishedUnionMembers(input.scope, input.carrier, input.outcome.type,
    input.parameter, { depth: 0 });
  const payloads = members.filter(member => !isCsharpAbsenceTargetType(member.carrier)).map(member => member.carrier);
  for (const carrier of [csharpRuntimeUnionTargetType(payloads),
    csharpRuntimeUnionTargetType([...payloads].reverse()),
    csharpSourcePrimitiveTargetType("float64")]) {
    assert.equal(resolveCsharpPublishedUnionMembers(input.scope, carrier, input.outcome.type,
      input.parameter, { depth: 0 }) === undefined, true, "a different physical domain cannot borrow E3 authority");
  }
  assert.equal(resolveCsharpUnionMemberCarrier(input.scope, input.carrier, input.outcome.type,
    { kind: "primitive", primitive: "uint32" }, input.parameter, { depth: 0 }) === undefined, true,
  "same checked numeric category is not original Source membership");
});

test("required Source union occurrence and family publications fail invariant rather than retrying checked types", () => {
  const input = fixture();
  for (const kind of ["missing", "foreign", "refused", "family"]) {
    const effectiveTypes = { ...input.source.effectiveTypes,
      get: node => node !== input.parameter ? input.source.effectiveTypes.get(node) : kind === "missing" ? undefined
        : kind === "foreign" ? { ...input.outcome, provenance: { ...input.outcome.provenance, occurrence: input.syntax } }
        : kind === "refused" ? { kind: "refused", source: "tsonic", code: "TSONIC_LOCAL_TYPE_CONFLICT",
          site: input.parameter, reason: "retained actual refusal" } : input.outcome,
      sum: identity => kind === "family" ? undefined : input.source.effectiveTypes.sum(identity),
    };
    const resolve = () => createCsharpTypeResolutionServices({ ...input.host, effectiveTypes })
      .policy.sourceUnionMembers(input.parameter, input.carrier);
    if (kind === "refused") assert.equal(resolve() === undefined, true, "the actual Host refusal remains first");
    else assert.throws(resolve, /Source union member lookup/u, kind);
  }
});

test("authored Source union refinement consumes only its exact published selected component", () => {
  const input = fixture();
  const selectedType = input.queries.types.authoredType(input.syntax);
  const integer = input.outcome.type.value.types.find(type => type.kind === "primitive");
  const scope = { ...input.scope, resolveNodeWithState: () => input.carrier };
  const selected = resolveAuthoredAndSelectedSourceType(scope, input.syntax, input.queries.sourceFile,
    selectedType, input.queries.sourceFile, { depth: 0, sourceComponent: {
      selectedType, descriptor: integer, occurrence: input.syntax,
    } });
  assert.equal(targetTypeRefEquals(selected, csharpSourcePrimitiveTargetType("int32")), true,
    "the retained selected component fixes the native width without reopening the checked number");
  assert.throws(() => resolveAuthoredAndSelectedSourceType(scope, input.syntax, input.queries.sourceFile,
    {}, input.queries.sourceFile, { depth: 0 }), /published selected Source component/u,
  "a missing narrowed publication cannot reopen the checked Type");
});
