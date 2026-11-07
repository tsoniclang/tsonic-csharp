import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles } from "@tsonic/tsts";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { csharpAbsenceTargetType, csharpRuntimeUnionTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpTargetNamedType } from "../../../dist/target-model/types/factories.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { inferCsharpTargetTypeParameterBindings, substituteObjectShapeFactTargetTypeParameters } from "../../../dist/policy/types/resolution/substitution.js";
import { sourceRefinementOnlyRemovesNullish } from "../../../dist/analysis/source-evidence/types/resolution/source-union-refinement.js";
import { resolveCsharpUnionMemberCarrier } from "../../../dist/analysis/source-evidence/types/resolution/source-evidence.js";
import { createPublishedSourceUnionFixture } from "../../helpers/published-source-unions.mjs";
import { sourceTypeDescriptorStructure } from "@tsonic/target-api/source";
import { selectCsharpConversion } from "../../../dist/policy/conversions/core.js";
import { selectCsharpObjectLiteralUnionCarrier } from "../../../dist/analysis/objects/shapes/union-construction.js";
import { csharpSourceUnionTargetType } from "../../../dist/target-model/types/source-union-definitions.js";
import { csharpStringTargetType, csharpVoidTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";

const byte = { kind: "source-primitive", name: "uint8" };
const integer = { kind: "source-primitive", name: "int32" };
const parameter = { kind: "type-parameter", identity: "Element", name: "Element" };
const arm = (name, argument) => ({ kind: "target-named", csharpAllowsRefLikeTypeArguments: [false], id: name, typeArguments: [argument] });

function publishedSelection(source, occurrence, descriptor, natives = new Map()) {
  const forbidden = () => assert.fail("an exact published union component cannot retry a checked carrier");
  const host = { ast: source.ast, effectiveTypes: source.effectiveTypes, navigation: source.navigation,
    sourceFacts: source.sourceFacts, target: { id: "csharp" }, typeParameterConstraints: {},
    hasSemantics: source.semantics.includes, semanticsFor: source.semantics.forNode,
    representations: { scopedTargetType: () => undefined, genericProjections: () => [] },
    projectTypeCatalog: {
      definitionForDeclaration: declaration => !natives.has(declaration) ? undefined : {
        outerTypeParameters: [], typeParameters: [], outerTypeProjections: [], typeProjections: [],
      },
      targetTypeForDeclaration(declaration, arguments_) {
        assert.equal(arguments_.length, 0, "the original closed Native classes have no Source binders");
        return natives.get(declaration);
      },
    } };
  const scope = { host, resolveTypeWithState: forbidden,
    selectDirectSourceFacts: () => ({ kind: "not-applicable" }) };
  return (carrier, selected) => resolveCsharpUnionMemberCarrier(scope, carrier, descriptor, selected, occurrence, { depth: 0 });
}

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
  const fixture = createPublishedSourceUnionFixture(`
    import type { uint8 } from "@tsonic/core/types.js";
    declare class First { value: uint8; }
    declare class Second { value: uint8; }
    declare class Foreign { value: uint8; }
    declare function nominal(value: First | Second | undefined): void;
    declare function foreign(value: Foreign): void;
    declare function shared(value: { value: uint8 }): void;
    declare function missing(value: unknown): void;
  `);
  const firstDeclaration = fixture.declaration("First");
  const secondDeclaration = fixture.declaration("Second");
  const shapes = [firstDeclaration, secondDeclaration].map((declaration, index) => ({
    targetType: arm(`Arm${index}`, byte), members: [{
      sourceName: "value", targetName: "value", memberKind: "property", type: byte,
      sourceDeclarations: [declaration],
    }],
  }));
  const descriptor = fixture.descriptor("nominal");
  const occurrence = fixture.ast.parameters(fixture.declaration("nominal"))[0];
  const select = publishedSelection(fixture.source, occurrence, descriptor,
    new Map([[firstDeclaration, shapes[0].targetType], [secondDeclaration, shapes[1].targetType]]));
  const union = csharpRuntimeUnionTargetType(shapes.map(shape => shape.targetType), shapes);
  const selectedType = descriptor.value.types.find(type => type.kind === "declared" && type.declaration === firstDeclaration);
  const nullable = csharpNullableTargetType(union);
  const selected = select(nullable, selectedType);
  assert.equal(selected !== undefined, true);
  assert(targetTypeRefEquals(selected, shapes[0].targetType));
  assert.equal(select(nullable, fixture.descriptor("foreign")) === undefined, true);
  assert.equal(select(nullable, fixture.descriptor("shared")) === undefined, true);
  assert.equal(select(nullable, fixture.descriptor("missing")) === undefined, true);
  assert.equal(select(union, selectedType) === undefined, true, "missing Native absence cannot borrow the Source domain");
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
  const outcome = source.effectiveTypes.get(source.ast.typeNode(alias));
  assert.equal(outcome !== undefined && outcome.kind !== "refused", true, "the same original union has its Source publication");
  const descriptor = sourceTypeDescriptorStructure(outcome.type);
  assert.equal(descriptor.kind, "optional", "A11 publishes the original void arm as one absence");
  const laterDeclaration = source.navigation.nodes.find(node => source.ast.is.IsClassDeclaration(node));
  const select = publishedSelection(source, source.ast.typeNode(alias), descriptor, new Map([[laterDeclaration, later]]));
  const resolve = carrier => select(carrier, { kind: "intrinsic", intrinsic: "absence" });
  const absent = resolve(csharpNullableTargetType(union));
  assert.equal(absent !== undefined && targetTypeRefEquals(absent, csharpAbsenceTargetType()), true,
    "the source void value uses the nullable union's one proven absence, never a present payload");
  assert.equal(resolve(union) === undefined, true, "a non-optional native union cannot manufacture an absent variant");
  assert.equal(resolve(csharpVoidTargetType()) === undefined, true, "ordinary native void remains a completion, not value storage");
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
  const fixture = createPublishedSourceUnionFixture('import type { uint8 } from "@tsonic/core/types.js"; declare function present(value: uint8 | undefined): void;');
  const descriptor = fixture.descriptor("present");
  const select = publishedSelection(fixture.source, fixture.ast.parameters(fixture.declaration("present"))[0], descriptor);
  assert.deepEqual(select(csharpNullableTargetType(byte), descriptor.value), byte);
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
