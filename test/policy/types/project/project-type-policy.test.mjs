import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpFieldInitialization } from "../../../../dist/policy/types/project/field-initialization.js";
import { selectCsharpForwardingConstructor } from "../../../../dist/policy/types/project/forwarding-constructors.js";
import { csharpProjectHeritageKindIssue } from "../../../../dist/policy/types/project/relationships.js";
import { csharpNullableValueTargetType } from "../../../../dist/target-model/types/carriers/nullable.js";
import { csharpSourcePrimitiveTargetType, csharpStringTargetType } from "../../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpTargetNamedType } from "../../../../dist/target-model/types/factories.js";

const int32 = csharpSourcePrimitiveTargetType("int32");
const widget = csharpTargetNamedType("Acme.Widget", [], undefined, { allowsRefLikeTypeArguments: [] });
const contract = csharpTargetNamedType("Acme.IContract", [], undefined, { allowsRefLikeTypeArguments: [], sourceDeclarationKind: "interface" });

test("non-nullable reference fields initialize with the null-forgiving form; value and nullable fields do not", () => {
  assert.deepEqual(selectCsharpFieldInitialization(widget), { nullForgiving: true });
  assert.deepEqual(selectCsharpFieldInitialization(csharpStringTargetType()), { nullForgiving: true });
  assert.deepEqual(selectCsharpFieldInitialization(int32), { nullForgiving: false });
  assert.deepEqual(selectCsharpFieldInitialization(csharpNullableValueTargetType(int32)), { nullForgiving: false });
  assert.equal(Object.isFrozen(selectCsharpFieldInitialization(widget)), true);
});

test("project heritage is admitted only in the forms C# declarations can express", () => {
  const definition = (kind) => ({ kind, sourceName: `Project${kind}` });
  assert.equal(csharpProjectHeritageKindIssue(definition("struct"), "implements", "interface", contract),
    "Project struct 'Projectstruct' cannot declare C# heritage.");
  assert.equal(csharpProjectHeritageKindIssue(definition("interface"), "implements", "interface", contract),
    "Project interface 'Projectinterface' cannot implement a C# type.");
  assert.equal(csharpProjectHeritageKindIssue(definition("interface"), "extends", "interface", contract), undefined);
  assert.equal(csharpProjectHeritageKindIssue(definition("interface"), "extends", undefined, contract), undefined,
    "a native interface declaration is recognized from its carrier");
  assert.match(csharpProjectHeritageKindIssue(definition("interface"), "extends", "class", widget), /cannot inherit the non-interface C# type/u);
  assert.equal(csharpProjectHeritageKindIssue(definition("class"), "extends", "class", widget), undefined);
  assert.equal(csharpProjectHeritageKindIssue(definition("class"), "extends", "interface", contract),
    "Project class 'Projectclass' cannot extend the selected non-class C# type.");
  assert.match(csharpProjectHeritageKindIssue(definition("class"), "extends", undefined, int32), /cannot extend the non-class C# type/u);
  assert.equal(csharpProjectHeritageKindIssue(definition("class"), "implements", "interface", contract), undefined);
  assert.match(csharpProjectHeritageKindIssue(definition("class"), "implements", undefined, widget),
    /without an exact native interface declaration/u);
  assert.match(csharpProjectHeritageKindIssue(definition("class"), "implements", "class", widget), /cannot implement the non-interface C# type/u);
});

test("an implicit forwarding constructor has one variant per representable trailing omission", () => {
  const selected = selectCsharpForwardingConstructor([
    { name: "value", type: int32 },
    { name: "count", type: int32, csharpOmittableOptionalArgument: true },
    { name: "label", type: csharpStringTargetType(), passingMode: "byref-readonly", csharpOmittableOptionalArgument: true },
  ]);
  assert.equal(selected.kind, "selected");
  assert.deepEqual(selected.variants.map(variant => variant.map(parameter => parameter.name)),
    [["value"], ["value", "count"], ["value", "count", "label"]]);
  assert.equal(selected.variants[2][2].passing, "in");
  assert.equal(selected.variants[2][0].passing, undefined);
  const params = selectCsharpForwardingConstructor([{ name: "format", type: csharpStringTargetType() },
    { name: "values", type: { kind: "array", element: int32 }, paramsArray: true }]);
  assert.deepEqual(params.variants.map(variant => variant.map(parameter => parameter.name)), [["format", "values"]]);
  assert.equal(params.variants[0][1].paramsArray, true);
  assert.equal(selectCsharpForwardingConstructor([{ name: "class", type: int32 }]).variants[0][0].name, "@class");
});

test("forwarding constructors refuse omission orders, carriers, passing modes and names C# cannot express", () => {
  assert.equal(selectCsharpForwardingConstructor([{ name: "a", type: int32, csharpOmittableOptionalArgument: true },
    { name: "b", type: int32 }]).code, "CSHARP_UNSUPPORTED_AST");
  assert.equal(selectCsharpForwardingConstructor([{ name: "values", type: { kind: "array", element: int32 }, paramsArray: true },
    { name: "tail", type: int32 }]).code, "CSHARP_UNSUPPORTED_AST");
  assert.equal(selectCsharpForwardingConstructor([{ name: "native", type: { kind: "opaque", name: "native" } }]).code,
    "CSHARP_UNSUPPORTED_AST");
  assert.equal(selectCsharpForwardingConstructor([{ name: "value", type: int32, passingMode: "borrow-shared" }]).code,
    "CSHARP_UNSUPPORTED_AST");
  assert.equal(selectCsharpForwardingConstructor([{ name: "content-type", type: int32 }]).code, "CSHARP_INVALID_IDENTIFIER");
});
