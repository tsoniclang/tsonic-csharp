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
const reference = csharpTargetNamedType("fixture.Record");

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
