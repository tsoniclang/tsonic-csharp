import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles } from "@tsonic/tsts";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { csharpAbsenceTargetType, csharpRuntimeUnionTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpTargetNamedType } from "../../../dist/target-model/types/factories.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { inferCsharpTargetTypeParameterBindings, substituteObjectShapeFactTargetTypeParameters } from "../../../dist/policy/types/resolution/substitution.js";
import { selectCsharpAuthoredUnionRefinement, sourceRefinementOnlyRemovesNullish } from "../../../dist/analysis/source-evidence/types/resolution/source-union-refinement.js";
import { selectCsharpConversion } from "../../../dist/policy/conversions/core.js";
import { selectCsharpObjectLiteralUnionCarrier } from "../../../dist/analysis/objects/shapes/union-construction.js";
import { csharpSourceUnionTargetType } from "../../../dist/target-model/types/source-union-definitions.js";
import { csharpStringTargetType, csharpVoidTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";

const byte = { kind: "source-primitive", name: "uint8" };
const integer = { kind: "source-primitive", name: "int32" };
const parameter = { kind: "type-parameter", identity: "Element", name: "Element" };
const arm = (name, argument) => ({ kind: "target-named", csharpAllowsRefLikeTypeArguments: [false], id: name, typeArguments: [argument] });

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
  const select = (elements, target = union) => selectCsharpObjectLiteralUnionCarrier(target, elements,
    type => shapes.find(shape => targetTypeRefEquals(shape.targetType, type)), element => element.sourceSelectedDeclarations);
  const first = { sourceSelectedDeclarations: [firstDeclaration] };
  const optional = { sourceSelectedDeclarations: [optionalDeclaration] };
  assert.equal(select([first]) === shapes[0].targetType, true);
  assert.equal(select([optional, first]) === shapes[0].targetType, true);
  assert.equal(select([first], csharpNullableTargetType(union)) === shapes[0].targetType, true);
  assert.equal(select([]), undefined);
  assert.equal(select([optional]), undefined);
  assert.equal(select([first, first]), undefined);
  assert.equal(select([undefined]), undefined);
  assert.equal(select([{ sourceSelectedDeclarations: [{}] }]), undefined);
  assert.equal(select([{ sourceSelectedDeclarations: [firstDeclaration, secondDeclaration] }]), undefined);
});

test("indexed record union construction retains exact carriers and rejects ambiguous or unavailable arms", () => {
  const string = csharpStringTargetType();
  const integer = { kind: "source-primitive", name: "int64" };
  const record = { kind: "target-named", csharpAllowsRefLikeTypeArguments: [false, false], id: "System.Collections.Generic.Dictionary`2",
    typeArguments: [string, integer], csharpCollectionSurface: "record" };
  const alternate = { ...record, typeArguments: [string, byte] };
  const root = csharpSourceUnionTargetType("record-root", "RecordRoot", []);
  const definitions = { sourceUnionArms: carrier => carrier === root ? [string, integer, record] : undefined };
  const select = (target, elements = [{}], source) => selectCsharpObjectLiteralUnionCarrier(target, elements,
    () => undefined, () => undefined, definitions, source);
  assert.equal(select(root) === record, true);
  assert.equal(select(csharpNullableTargetType(root)) === record, true);
  assert.equal(select(root, []) === record, true);
  assert.equal(select(root, [undefined]) === undefined, true);
  assert.equal(select(csharpRuntimeUnionTargetType([string, integer])) === undefined, true);
  assert.equal(select(csharpRuntimeUnionTargetType([record, alternate])) === undefined, true);
  assert.equal(select(csharpRuntimeUnionTargetType([record, alternate]), [{}], record) === record, true);
  assert.equal(select(csharpRuntimeUnionTargetType([record, record]), [{}], record) === undefined, true);
  assert.equal(select(root, [{}], { ...record, typeArguments: [string, parameter] }) === record, true);
  assert.equal(select(csharpSourceUnionTargetType("missing", "Missing", [])) === undefined, true);
});

test("record and declaration-shaped literal matches cannot select an arbitrary union constructor", () => {
  const declaration = {};
  const record = { kind: "target-named", csharpAllowsRefLikeTypeArguments: [false, false], id: "System.Collections.Generic.Dictionary`2",
    typeArguments: [csharpStringTargetType(), byte], csharpCollectionSurface: "record" };
  const shape = { targetType: arm("Declared", byte), members: [{ type: byte, sourceDeclarations: [declaration] }] };
  const union = csharpRuntimeUnionTargetType([record, shape.targetType]);
  const select = source => selectCsharpObjectLiteralUnionCarrier(union, [{ sourceSelectedDeclarations: [declaration] }],
    carrier => targetTypeRefEquals(carrier, shape.targetType) ? shape : undefined,
    element => element.sourceSelectedDeclarations, undefined, source);
  assert.equal(select() === undefined, true);
  assert.equal(select(shape.targetType) === shape.targetType, true);
  assert.equal(select(record) === record, true);
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
  const renamed = substituteObjectShapeFactTargetTypeParameters(original, new Map([["Element", { kind: "type-parameter", identity: "Item", name: "Item" }]]));
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
    types: { refinement: () => ({ kind: "members", types: [selectedType] }), isNullish: () => false, isVoidLike: () => false,
      unionOrIntersectionTypes: () => [selectedType, {}],
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

test("checked void union members select only an already-admitted native absence", () => {
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/src", files: {
    "/src/index.ts": "class Later {} type Outcome = void | string | Later;",
  }, compilerOptions: { strict: true, module: "esnext" } }).checkSource();
  assert.equal(checked.diagnostics.length, 0);
  const source = createTargetSourceProgram(checked);
  const file = checked.getSourceFile("/src/index.ts");
  let alias;
  source.ast.forEachChild(file, node => {
    if (source.ast.is.IsTypeAliasDeclaration(node)) alias = node;
  });
  assert.equal(alias !== undefined, true, "the real checked union has its authored declaration");
  const queries = source.semantics.forNode(alias);
  const declared = queries.types.authoredType(source.ast.typeNode(alias));
  const selected = queries.types.unionOrIntersectionTypes(declared)
    .find(member => member !== undefined && queries.types.isVoidLike(member));
  assert.equal(selected !== undefined, true, "the original absence arm is genuinely checked void, not guessed undefined");
  const later = csharpTargetNamedType("source.Later", undefined, { kind: "named", name: "Later" },
    { allowsRefLikeTypeArguments: [], sourceDeclarationKind: "class" });
  const union = csharpRuntimeUnionTargetType([csharpStringTargetType(), later]);
  const resolve = carrier => selectCsharpAuthoredUnionRefinement(carrier, declared, selected, queries,
    () => undefined, () => undefined);
  const absent = resolve(csharpNullableTargetType(union));
  assert.equal(absent.kind === "resolved" && targetTypeRefEquals(absent.type, csharpAbsenceTargetType()), true,
    "the source void value uses the nullable union's one proven absence, never a present payload");
  assert.equal(resolve(union).kind, "rejected", "a non-optional native union cannot manufacture an absent variant");
  assert.equal(resolve(csharpVoidTargetType()).kind, "not-applicable", "ordinary native void remains a completion, not value storage");
});

test("nullish refinement retains a native carrier only for the complete non-nullish selection", () => {
  const present = {};
  const other = {};
  const absent = {};
  const declared = {};
  let members = [present];
  let declaredMembers = [present, absent];
  const queries = { types: {
    refinement: () => ({ kind: "members", types: members }),
    unionOrIntersectionTypes: () => declaredMembers,
    isNullish: type => type === absent,
  } };
  assert(sourceRefinementOnlyRemovesNullish(declared, present, queries));
  assert.deepEqual(selectCsharpAuthoredUnionRefinement(csharpNullableTargetType(byte), declared, present,
    queries, () => { throw new Error("native carrier must not be reconstructed"); }, () => undefined),
  { kind: "resolved", type: byte });
  for (const invalid of [[], [other], [present, absent], [present, present]]) {
    members = invalid;
    assert.equal(sourceRefinementOnlyRemovesNullish(declared, present, queries), false);
  }
  members = [present];
  for (const invalid of [[present], [present, undefined], [present, other, absent]]) {
    declaredMembers = invalid;
    assert.equal(sourceRefinementOnlyRemovesNullish(declared, present, queries), false);
  }
});

test("nullable union conversion never confuses nullability with selecting an arm", () => {
  const union = csharpRuntimeUnionTargetType([byte, integer]);
  const nullable = csharpNullableTargetType(union);
  // Union`N is a readonly struct: wrapping it in Nullable<T> is the implicit nullable conversion, never an arm selection.
  assert.deepEqual(selectCsharpConversion({}, union, nullable, "implicit"), { kind: "implicit", proof: "nullable" });
  assert.equal(selectCsharpConversion({}, nullable, union, "explicit").kind, "nullable-value");
  assert.equal(selectCsharpConversion({}, nullable, union, "implicit").kind, "rejected");
});
