import assert from "node:assert/strict";
import test from "node:test";
import {
  combineCsharpTargetUnionMembers,
  csharpAbsenceTargetType,
  csharpNullableTargetType,
  csharpRuntimeUnionTargetType,
  csharpSourcePrimitiveTargetType,
  csharpTargetNamedType,
  csharpVoidTargetType,
  getCsharpNullableElementTargetType,
  getCsharpRuntimeUnionArms,
  targetTypeRefEquals,
} from "../../../dist/target-model/types/index.js";

const boolean = csharpSourcePrimitiveTargetType("bool");
const integer = csharpSourcePrimitiveTargetType("uint64");
const reference = csharpTargetNamedType("fixture.Record", undefined, undefined, { allowsRefLikeTypeArguments: [],});

test("nullable union leaves share one native absence without changing payloads", () => {
  for (const second of [integer, reference]) {
    const expected = csharpNullableTargetType(csharpRuntimeUnionTargetType([boolean, second]));
    for (const members of [
      [boolean, csharpNullableTargetType(second)],
      [csharpNullableTargetType(second), boolean],
      [csharpNullableTargetType(boolean), csharpNullableTargetType(second)],
      [boolean, csharpNullableTargetType(second), csharpAbsenceTargetType()],
      [csharpNullableTargetType(csharpRuntimeUnionTargetType([boolean, second])), second],
    ]) {
      const actual = combineCsharpTargetUnionMembers(members);
      assert.equal(targetTypeRefEquals(actual, expected), true, second.id);
      const payload = getCsharpNullableElementTargetType(actual);
      const arms = getCsharpRuntimeUnionArms(payload);
      assert.equal(arms.length, 2);
      assert.equal(arms.every(arm => getCsharpNullableElementTargetType(arm) === undefined), true);
      assert.equal(arms.some(arm => targetTypeRefEquals(arm, second)), true);
    }
  }
});

test("nullable normalization never manufactures an object payload or nested optional", () => {
  const optional = csharpNullableTargetType(integer);
  for (const members of [[optional], [integer, optional], [optional, csharpAbsenceTargetType()],
    [integer, csharpVoidTargetType()]]) {
    assert.equal(targetTypeRefEquals(combineCsharpTargetUnionMembers(members), optional), true);
  }
  assert.equal(targetTypeRefEquals(combineCsharpTargetUnionMembers([csharpAbsenceTargetType(), csharpAbsenceTargetType()]),
    csharpAbsenceTargetType()), true);
  assert.equal(targetTypeRefEquals(combineCsharpTargetUnionMembers([integer, integer]), integer), true);
  assert.equal(combineCsharpTargetUnionMembers([]) === undefined, true);
});

test("bounded generic absence uses native nullable references on every union route", () => {
  const nominal = csharpTargetNamedType("fixture.NativeClass", undefined, undefined,
    { allowsRefLikeTypeArguments: [], sourceDeclarationKind: "class", constraintRequiresReferenceType: true });
  for (const constraints of [[{ kind: "keyword", keyword: "class" }], [{ kind: "type", type: nominal }]]) {
    const parameter = { kind: "type-parameter", identity: "fixture:T", name: "T", csharpConstraints: { kind: "resolved", constraints } };
    const nullable = csharpNullableTargetType(parameter);
    for (const members of [[parameter, csharpAbsenceTargetType()], [csharpAbsenceTargetType(), parameter],
      [nullable, parameter], [nullable, csharpAbsenceTargetType()], [parameter, csharpVoidTargetType()]]) {
      const selected = combineCsharpTargetUnionMembers(members);
      assert.equal(targetTypeRefEquals(selected, nullable), true, "all native absence entry points select identical T? storage");
      assert.equal(selected.kind === "type-parameter" && selected.csharpNullableReference === true && selected.csharpProjection === undefined, true,
        "a proven reference-bound parameter has no manufactured storage witness");
      assert.equal(selected.csharpConstraints === parameter.csharpConstraints, true, "the native constraint evidence is retained");
      assert.equal(targetTypeRefEquals(getCsharpNullableElementTargetType(selected), parameter), true,
        "removing native absence restores the original payload identity");
    }
  }
});
