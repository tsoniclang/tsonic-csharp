import assert from "node:assert/strict";
import test from "node:test";
import { createPublishedSourceUnionFixture } from "../../helpers/published-source-unions.mjs";
import { csharpSourceTypeParameter } from "../../../dist/source/extension/type-parameters.js";
import {
  combineCsharpTargetUnionMembers,
  csharpAbsenceTargetType,
  csharpNullableTargetType,
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
const fixture = createPublishedSourceUnionFixture(`
  import type { uint64 } from "@tsonic/core/types.js";
  declare class Record { readonly value: string; }
  declare function numeric(present: boolean | uint64, first: boolean | (uint64 | undefined),
    reverse: (uint64 | undefined) | boolean, both: (boolean | undefined) | (uint64 | undefined),
    explicit: boolean | (uint64 | undefined) | undefined,
    nested: (boolean | uint64 | undefined) | uint64): void;
  declare function nominal(present: boolean | Record, first: boolean | (Record | undefined),
    reverse: (Record | undefined) | boolean, both: (boolean | undefined) | (Record | undefined),
    explicit: boolean | (Record | undefined) | undefined,
    nested: (boolean | Record | undefined) | Record): void;
  declare function scalar(optional: uint64 | undefined, repeatedOptional: uint64 | (uint64 | undefined),
    extra: (uint64 | undefined) | undefined, repeated: uint64 | uint64, absent: undefined | undefined,
    voidish: uint64 | void): void;
  declare function bounded<Value extends object>(first: Value | undefined, reverse: undefined | Value,
    repeated: (Value | undefined) | Value, nested: (Value | undefined) | undefined, voidish: Value | void): void;
`, { Record: () => reference });

test("nullable union leaves share one native absence without changing payloads", () => {
  for (const [name, second] of [["numeric", integer], ["nominal", reference]]) {
    const expected = csharpNullableTargetType(fixture.carrier(name));
    for (const index of [1, 2, 3, 4, 5]) {
      const actual = fixture.carrier(name, index);
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
  assert.equal(fixture.descriptor("scalar", 5).kind, "optional", "the real uint64 | void publication has one absence");
  for (const index of [0, 1, 2, 5]) {
    assert.equal(targetTypeRefEquals(fixture.carrier("scalar", index), optional), true);
  }
  assert.equal(targetTypeRefEquals(fixture.carrier("scalar", 4),
    csharpAbsenceTargetType()), true);
  assert.equal(targetTypeRefEquals(fixture.carrier("scalar", 3), integer), true);
  assert.equal(combineCsharpTargetUnionMembers([]) === undefined, true);
});

test("bounded generic absence uses native nullable references on every union route", () => {
  const nominal = csharpTargetNamedType("fixture.NativeClass", undefined, undefined,
    { allowsRefLikeTypeArguments: [], sourceDeclarationKind: "class", constraintRequiresReferenceType: true });
  for (const constraints of [[{ kind: "keyword", keyword: "class" }], [{ kind: "type", type: nominal }]]) {
    const original = fixture.ast.typeParameters(fixture.declaration("bounded"))[0];
    const parameter = { ...csharpSourceTypeParameter(original, fixture.ast),
      csharpConstraints: { kind: "resolved", constraints } };
    const nullable = csharpNullableTargetType(parameter);
    assert.equal(fixture.descriptor("bounded", 4).kind, "optional", "the original Value | void publication has one absence");
    for (const index of [0, 1, 2, 3, 4]) {
      const selected = fixture.carrier("bounded", index, new Map([[original, parameter]]));
      assert.equal(targetTypeRefEquals(selected, nullable), true, "all native absence entry points select identical T? storage");
      assert.equal(selected.kind === "type-parameter" && selected.csharpNullableReference === true && selected.csharpProjection === undefined, true,
        "a proven reference-bound parameter has no manufactured storage witness");
      assert.equal(selected.csharpConstraints === parameter.csharpConstraints, true, "the native constraint evidence is retained");
      assert.equal(targetTypeRefEquals(getCsharpNullableElementTargetType(selected), parameter), true,
        "removing native absence restores the original payload identity");
    }
  }
});
