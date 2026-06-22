import { test } from "node:test";
import assert from "node:assert/strict";
import { planTypeParameters } from "../dist/backend/planner/type-parameters.js";
import { KindIdentifier } from "../dist/backend/planner/source-ast.js";
import { isCsharpThrowableCarrier } from "../dist/backend/planner/statement-output.js";
import { csharpTargetTypeParameterConstraintFactKey } from "../dist/source/csharp-facts.js";
import {
  isCsharpStringType,
  isVoidTargetType,
  unwrapNullableTargetType,
} from "../dist/source/csharp-source-semantics/target-rules.js";
import { getTypeofRuntimeKind } from "../dist/source/csharp-source-semantics/typeof-operators.js";
import {
  csharpBigIntegerTargetType,
  csharpBooleanTargetType,
  csharpExceptionTargetType,
  csharpNullableValueTargetType,
  csharpQualifiedTypeRenderShape,
  csharpStringTargetType,
  csharpTargetNamedType,
  csharpVoidTargetType,
  getCsharpArrayLiteralElementTargetType,
} from "../dist/source/csharp-source-semantics/target-types.js";
import {
  csharpJsRegExpTargetType,
  isCsharpJsRegExpRuntimeCarrier,
} from "../dist/source/csharp-source-semantics/surfaces/js/regexp.js";

test("throwable carriers require explicit C# target capability metadata", () => {
  assert.equal(isCsharpThrowableCarrier({ kind: "target-named", id: "System.Exception" }), false);
  assert.equal(isCsharpThrowableCarrier(csharpTargetNamedType("System.Exception")), false);
  assert.equal(isCsharpThrowableCarrier(csharpExceptionTargetType()), true);
});

test("typeof runtime mapping requires explicit C# target metadata", () => {
  assert.equal(getTypeofRuntimeKind({ kind: "target-named", id: "System.String" }, { allowNullableUnwrap: false }), undefined);
  assert.equal(getTypeofRuntimeKind(csharpTargetNamedType("System.String"), { allowNullableUnwrap: false }), undefined);
  assert.equal(getTypeofRuntimeKind(csharpStringTargetType(), { allowNullableUnwrap: false }), "string");
  assert.equal(getTypeofRuntimeKind(csharpBooleanTargetType(), { allowNullableUnwrap: false }), "boolean");
  assert.equal(getTypeofRuntimeKind(csharpBigIntegerTargetType(), { allowNullableUnwrap: false }), "bigint");
});

test("special C# target types require explicit metadata", () => {
  const rawString = { kind: "target-named", id: "System.String" };
  const rawVoid = { kind: "target-named", id: "System.Void" };
  const intType = { kind: "source-primitive", name: "int32" };
  const rawNullable = { kind: "target-named", id: "System.Nullable`1", typeArguments: [intType] };
  assert.equal(isCsharpStringType(rawString), false);
  assert.equal(isCsharpStringType(csharpTargetNamedType("System.String")), false);
  assert.equal(isCsharpStringType(csharpStringTargetType()), true);
  assert.equal(isVoidTargetType(rawVoid), false);
  assert.equal(isVoidTargetType(csharpTargetNamedType("System.Void")), false);
  assert.equal(isVoidTargetType(csharpVoidTargetType()), true);
  assert.equal(unwrapNullableTargetType(rawNullable), rawNullable);
  assert.deepEqual(unwrapNullableTargetType(csharpTargetNamedType("System.Nullable`1", [intType])), csharpTargetNamedType("System.Nullable`1", [intType]));
  assert.deepEqual(unwrapNullableTargetType(csharpNullableValueTargetType(intType)), intType);
});

test("collection literal acceptance requires explicit C# target metadata", () => {
  const intType = { kind: "source-primitive", name: "int32" };
  const rawEnumerable = {
    kind: "target-named",
    id: "System.Collections.Generic.IEnumerable`1",
    typeArguments: [intType],
  };
  const enrichedEnumerable = csharpTargetNamedType("System.Collections.Generic.IEnumerable`1", [intType], {
    kind: "named",
    namespace: ["System", "Collections", "Generic"],
    name: "IEnumerable",
  }, {
    arrayLiteralElementType: intType,
  });

  assert.equal(getCsharpArrayLiteralElementTargetType(rawEnumerable), undefined);
  assert.deepEqual(getCsharpArrayLiteralElementTargetType(enrichedEnumerable), intType);
});

test("JS RegExp runtime carrier requires explicit JS surface metadata", () => {
  assert.equal(isCsharpJsRegExpRuntimeCarrier({ kind: "target-named", id: "Tsonic.CSharp.Js.RegExp" }), false);
  assert.equal(isCsharpJsRegExpRuntimeCarrier(csharpJsRegExpTargetType()), true);
});

test("type parameter constraints render finalized C# type facts", () => {
  const node = typeParameterNode("T");
  const diagnostics = [];
  const parameters = planTypeParameters([node], {}, fakeInput({
    subject: node,
    constraintFact: {
      constraints: [{
        kind: "csharp-type",
        type: csharpTargetNamedType("System.Numerics.INumber`1", [{ kind: "type-parameter", name: "T" }], csharpQualifiedTypeRenderShape("System.Numerics", "INumber")),
      }],
    },
  }), diagnostics);

  assert.deepEqual(diagnostics, []);
  assert.equal(parameters.length, 1);
  assert.equal(parameters[0].name, "T");
  assert.deepEqual(parameters[0].constraints, [{
    kind: "TypeConstraint",
    type: {
      kind: "QualifiedName",
      left: {
        kind: "QualifiedName",
        left: { kind: "IdentifierName", name: "System" },
        name: "Numerics",
      },
      name: "INumber",
      typeArguments: [{ kind: "IdentifierName", name: "T" }],
    },
  }]);
});

test("type parameter constraints render finalized C# keyword facts", () => {
  const node = typeParameterNode("T");
  const diagnostics = [];
  const parameters = planTypeParameters([node], {}, fakeInput({
    subject: node,
    constraintFact: {
      constraints: [{
        kind: "csharp-keyword",
        keyword: "class",
      }],
    },
  }), diagnostics);

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(parameters[0].constraints, [{
    kind: "KeywordConstraint",
    keyword: "class",
  }]);
});

test("type parameter constraints reject old target-specific mini protocols", () => {
  const node = typeParameterNode("T");
  const diagnostics = [];
  const parameters = planTypeParameters([node], {}, fakeInput({
    subject: node,
    constraintFact: {
      constraints: [{
        kind: "target-specific",
        target: "csharp",
        name: "generic-math-number",
      }],
    },
  }), diagnostics);

  assert.equal(parameters.length, 1);
  assert.equal(parameters[0].constraints, undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /does not support target type-parameter constraint 'csharp:generic-math-number'/);
});

function typeParameterNode(name) {
  return {
    Kind: "KindTypeParameter",
    name: { Kind: KindIdentifier, Text: name },
  };
}

function fakeInput(options) {
  return {
    ast: {
      kindName: (node) => String(node?.Kind),
      kindNameFromKind: (kind) => String(kind),
    },
    facts: {
      getFact: (subject, key) =>
        subject === options.subject && key === csharpTargetTypeParameterConstraintFactKey
          ? options.constraintFact
          : undefined,
    },
  };
}
