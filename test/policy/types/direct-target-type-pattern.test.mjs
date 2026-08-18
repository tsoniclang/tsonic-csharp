import assert from "node:assert/strict";
import { test } from "node:test";
import {
  csharpNullableReferenceTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  resolveCsharpTargetTypePatternArguments,
} from "../../../dist/policy/types/index.js";

const int32 = csharpSourcePrimitiveTargetType("int32");
const string = csharpStringTargetType();
const parameters = [{ name: "T" }];
const parameter = { kind: "type-parameter", name: "T" };

test("target type patterns close structural array bindings", () => {
  assert.deepEqual(
    resolveCsharpTargetTypePatternArguments(
      { kind: "array", element: parameter },
      { kind: "array", element: int32 },
      parameters,
    ),
    [int32],
  );
});

test("target type patterns close named generic bindings", () => {
  assert.deepEqual(
    resolveCsharpTargetTypePatternArguments(
      {
        kind: "target-named",
        id: "Example.Box`1",
        typeArguments: [parameter],
      },
      {
        kind: "target-named",
        id: "Example.Box`1",
        typeArguments: [string],
      },
      parameters,
    ),
    [string],
  );
});

test("target type patterns require repeated parameters to agree", () => {
  const pattern = { kind: "tuple", elements: [parameter, parameter] };
  assert.deepEqual(
    resolveCsharpTargetTypePatternArguments(
      pattern,
      { kind: "tuple", elements: [int32, int32] },
      parameters,
    ),
    [int32],
  );
  assert.equal(
    resolveCsharpTargetTypePatternArguments(
      pattern,
      { kind: "tuple", elements: [int32, string] },
      parameters,
    ),
    undefined,
  );
});

test("target type patterns reject incompatible concrete structure", () => {
  assert.equal(
    resolveCsharpTargetTypePatternArguments(
      { kind: "array", element: parameter, rank: 2 },
      { kind: "array", element: int32 },
      parameters,
    ),
    undefined,
  );
  assert.equal(
    resolveCsharpTargetTypePatternArguments(
      {
        kind: "target-named",
        id: "Example.Box`1",
        typeArguments: [parameter],
      },
      {
        kind: "target-named",
        id: "Example.Other`1",
        typeArguments: [int32],
      },
      parameters,
    ),
    undefined,
  );
});

test("target type patterns preserve nullability and require complete bindings", () => {
  const nullableString = csharpNullableReferenceTargetType(string);
  assert.deepEqual(
    resolveCsharpTargetTypePatternArguments(
      parameter,
      nullableString,
      parameters,
    ),
    [nullableString],
  );
  assert.equal(
    resolveCsharpTargetTypePatternArguments(
      csharpNullableReferenceTargetType({
        kind: "target-named",
        id: "Example.Box`1",
        typeArguments: [parameter],
      }),
      {
        kind: "target-named",
        id: "Example.Box`1",
        typeArguments: [string],
      },
      parameters,
    ),
    undefined,
  );
  assert.equal(
    resolveCsharpTargetTypePatternArguments(
      { kind: "target-named", id: "Example.Closed" },
      { kind: "target-named", id: "Example.Closed" },
      parameters,
    ),
    undefined,
  );
});
