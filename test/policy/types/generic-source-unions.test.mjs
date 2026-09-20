import assert from "node:assert/strict";
import test from "node:test";
import { csharpRuntimeUnionTargetType } from "../../../dist/target-model/types/runtime-carriers.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/nullable.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { inferCsharpTargetTypeParameterBindings, substituteObjectShapeFactTargetTypeParameters } from "../../../dist/policy/types/callables/substitution.js";
import { selectCsharpAuthoredUnionRefinement } from "../../../dist/policy/types/resolution/source-union-refinement.js";
import { selectCsharpConversion } from "../../../dist/policy/conversions/selection/core.js";
import { selectCsharpObjectLiteralUnionShape } from "../../../dist/policy/types/objects/object-shape-policy/union-construction.js";

const byte = { kind: "source-primitive", name: "uint8" };
const integer = { kind: "source-primitive", name: "int32" };
const parameter = { kind: "type-parameter", name: "Element" };
const arm = (name, argument) => ({ kind: "target-named", id: name, typeArguments: [argument] });

test("union literal construction requires one total declaration-identity match", () => {
  const firstDeclaration = {};
  const secondDeclaration = {};
  const optionalDeclaration = {};
  const member = declaration => ({ sourceName: "sameSpelling", sourceDeclarations: [declaration], type: byte });
  const shapes = [
    { targetType: arm("First", byte), members: [member(firstDeclaration), { ...member(optionalDeclaration), optional: true }] },
    { targetType: arm("Second", byte), members: [member(secondDeclaration)] },
  ];
  const union = csharpRuntimeUnionTargetType(shapes.map(shape => shape.targetType));
  const select = (elements, target = union) => selectCsharpObjectLiteralUnionShape(target, elements,
    type => shapes.find(shape => targetTypeRefEquals(shape.targetType, type)));
  const first = { sourceSelectedDeclarations: [firstDeclaration] };
  const optional = { sourceSelectedDeclarations: [optionalDeclaration] };
  assert.equal(select([first]), shapes[0]);
  assert.equal(select([optional, first]), shapes[0]);
  assert.equal(select([first], csharpNullableTargetType(union)), shapes[0]);
  assert.equal(select([]), undefined);
  assert.equal(select([optional]), undefined);
  assert.equal(select([first, first]), undefined);
  assert.equal(select([undefined]), undefined);
  assert.equal(select([{ sourceSelectedDeclarations: [{}] }]), undefined);
  assert.equal(select([{ sourceSelectedDeclarations: [firstDeclaration, secondDeclaration] }]), undefined);
});

test("generic nullable union inference uses one exact arm and retains concrete widths", () => {
  const pattern = csharpNullableTargetType(csharpRuntimeUnionTargetType([arm("Value", parameter), arm("Pointer", parameter)]));
  const parameters = new Set(["Element"]);
  assert.deepEqual(inferCsharpTargetTypeParameterBindings(pattern, arm("Value", byte), parameters), new Map([["Element", byte]]));
  const both = csharpRuntimeUnionTargetType([arm("Value", byte), arm("Pointer", byte)]);
  assert.deepEqual(inferCsharpTargetTypeParameterBindings(pattern, both, parameters), new Map([["Element", byte]]));
  const conflict = csharpRuntimeUnionTargetType([arm("Value", byte), arm("Pointer", integer)]);
  assert.equal(inferCsharpTargetTypeParameterBindings(pattern, conflict, parameters), undefined);
  assert.equal(inferCsharpTargetTypeParameterBindings(pattern, arm("Unknown", byte), parameters), undefined);
  const ambiguous = csharpRuntimeUnionTargetType([arm("Value", parameter), arm("Value", byte)]);
  assert.equal(inferCsharpTargetTypeParameterBindings(ambiguous, arm("Value", byte), parameters), undefined);
});

test("shape substitution keeps one symbolic declaration through multiple instantiations", () => {
  const declaration = {};
  const original = { targetType: arm("Value", parameter), members: [{
    sourceName: "value", sourceKey: { kind: "property", name: "value" },
    sourceDeclarations: [declaration], targetName: "value", memberKind: "property", type: parameter,
  }] };
  const renamed = substituteObjectShapeFactTargetTypeParameters(original, new Map([["Element", { kind: "type-parameter", name: "Item" }]]));
  const selected = substituteObjectShapeFactTargetTypeParameters(renamed, new Map([["Item", byte]]));
  assert.equal(selected.declarationTemplate, original);
  assert.deepEqual(selected.targetType, arm("Value", byte));
  assert.deepEqual(selected.members[0].type, byte);
  assert.equal(selected.members[0].sourceDeclarations[0], declaration);
  assert.deepEqual(original.members[0].type, parameter);
});

test("source-union refinement requires exact unique member declarations", () => {
  const firstDeclaration = {};
  const secondDeclaration = {};
  const selectedType = {};
  const declaredType = {};
  const selectedSymbol = {};
  const shapes = [firstDeclaration, secondDeclaration].map((declaration, index) => ({
    targetType: arm(`Arm${index}`, byte), members: [{
      sourceName: "value", targetName: "value", memberKind: "property", type: byte,
      sourceDeclarations: [declaration],
    }],
  }));
  let declarations = [firstDeclaration];
  const queries = {
    types: { refinement: () => ({ kind: "members", types: [selectedType] }), isNullish: () => false,
      propertyInfos: () => [{ symbol: selectedSymbol, rootSymbols: [] }], },
    declarations: { symbolDeclarations: () => declarations },
  };
  const union = csharpRuntimeUnionTargetType(shapes.map(shape => shape.targetType), shapes);
  const select = value => selectCsharpAuthoredUnionRefinement(value, declaredType, selectedType, queries, () => undefined,
    type => shapes.find(shape => targetTypeRefEquals(shape.targetType, type)));
  const selected = select(csharpNullableTargetType(union));
  assert.equal(selected.kind, "resolved");
  assert(targetTypeRefEquals(selected.type, shapes[0].targetType));
  declarations = [{}];
  assert.equal(select(union).kind, "rejected");
  declarations = [firstDeclaration, secondDeclaration];
  assert.equal(select(union).kind, "rejected");
  declarations = [];
  assert.equal(select(union).kind, "rejected");
});

test("nullable union conversion never confuses nullability with selecting an arm", () => {
  const union = csharpRuntimeUnionTargetType([byte, integer]);
  const nullable = csharpNullableTargetType(union);
  assert.equal(selectCsharpConversion({}, union, nullable, "implicit").kind, "implicit");
  assert.equal(selectCsharpConversion({}, nullable, union, "explicit").kind, "nullable-value");
  assert.equal(selectCsharpConversion({}, nullable, union, "implicit").kind, "rejected");
});
