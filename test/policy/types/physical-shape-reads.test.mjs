import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles } from "@tsonic/tsts";
import { analyzeSourceLiteralValues, createTargetSourceProgram } from "@tsonic/target-api/source";
import { createCsharpObjectShapePolicy } from "../../../dist/analysis/objects/shapes/api.js";
import { resolveNodeValueWithState } from "../../../dist/analysis/source-evidence/types/resolution/nodes.js";
import { createCsharpSourceTypeRepresentationHost, resolveCsharpSourceTypeDescriptor } from "../../../dist/analysis/source-evidence/types/resolution/effective-types.js";
import { analyzeCsharpSourceTypeFlowObligations } from "../../../dist/analysis/source-evidence/type-flow-obligations.js";
import { createCsharpObjectShapeValueStorage } from "../../../dist/policy/types/objects/shape-carriers.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { csharpTargetNamedType } from "../../../dist/target-model/types/factories.js";
import { csharpObjectShapeMemberContractKey } from "../../../dist/target-model/types/object-shape-identity.js";

function fixture() {
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/src", files: {
    "/src/index.ts": `function takeNumber(value: number): void { void value; }
      function run(): void {
        const selected = { chosen: 1, unchanged: 2 };
        const earlier = { chosen: 3, unchanged: 4 };
        takeNumber(selected.chosen); void selected.unchanged; takeNumber(earlier.chosen); void earlier;
      }`,
  }, compilerOptions: { strict: true, target: "es2022", module: "esnext" } }).checkSource();
  assert.equal(checked.diagnostics.length === 0, true, "the physical owner consumes genuine checked Source");
  const source = createTargetSourceProgram(checked);
  const file = checked.getSourceFile("/src/index.ts");
  const nodes = [];
  const visit = node => { nodes.push(node); source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); }); };
  visit(file);
  const declaration = nodes.find(node => source.ast.is.IsVariableDeclaration(node) &&
    source.ast.text(source.ast.name(node)) === "selected");
  const earlier = nodes.find(node => source.ast.is.IsVariableDeclaration(node) &&
    source.ast.text(source.ast.name(node)) === "earlier");
  const literal = source.ast.as.AsVariableDeclaration(declaration).Initializer;
  const reference = nodes.find(node => source.ast.is.IsIdentifier(node) && source.ast.text(node) === "selected" &&
    source.ast.is.IsPropertyAccessExpression(source.ast.parent(node)));
  const publication = source.effectiveTypes.get(reference);
  const principal = source.effectiveTypes.get(declaration);
  const foreign = source.effectiveTypes.get(earlier);
  assert.equal(publication?.type.kind === "shape" && principal?.type.kind === "shape" && foreign?.type.kind === "shape", true,
    "the exact occurrence, principal and opposite owner have complete shape publications");
  const scoped = new Map();
  const host = {
    ast: source.ast, navigation: source.navigation, effectiveTypes: source.effectiveTypes,
    sourceFiles: [file], sourceFacts: source.sourceFacts, target: { id: "csharp" },
    semantics: source.semantics.forFile, semanticsFor: source.semantics.forNode,
    hasSemantics: source.semantics.includes, memoryBindings: { hasBoundField: () => false },
    sourceStorage: { memberSubjectFor: () => undefined },
    representations: { scopedTargetType: node => scoped.get(node), genericProjections: () => [] },
    typeParameterConstraints: {}, projectTypeCatalog: { definitionForTarget: () => undefined },
  };
  const scope = { host, selectDirectSourceFacts: () => ({ kind: "not-applicable" }) };
  host.typeResolver = {
    resolveDescriptor: (descriptor, occurrence, state) => resolveCsharpSourceTypeDescriptor(scope, descriptor, state, occurrence),
    resolveNode: (node, sourceFile, state) => resolveNodeValueWithState(scope, node, sourceFile, state)?.selectedType,
  };
  const shapes = createCsharpObjectShapePolicy(host);
  host.objectShapes = shapes;
  const logical = resolveCsharpSourceTypeDescriptor(scope, publication.type, { depth: 0 }, reference);
  const shape = shapes.resolveTarget(logical);
  const physical = createCsharpObjectShapeValueStorage(shape);
  assert.equal(physical !== undefined && !targetTypeRefEquals(logical, physical.targetType), true,
    "the native value-storage carrier is distinct from its logical reference representation");
  assert.equal(shapes.retainShape(physical, undefined) !== undefined, true, "the actual Native registry owns the carrier");
  for (const node of [declaration, literal, reference]) scoped.set(node, physical.targetType);
  return { source, host, shapes, scope, file, declaration, literal, reference, principal, foreign, scoped, physical, logical };
}

for (const site of ["declaration", "literal", "reference"]) test(`physical shape ${site} keeps its exact registered current member contract`, () => {
  const input = fixture();
  const selected = resolveNodeValueWithState(input.scope, input[site], input.file, { depth: 0 });
  assert.equal(targetTypeRefEquals(selected?.selectedType, input.physical.targetType), true,
    "the same canonical Native value carrier is retained without copying or reference allocation");
  assert.equal(selected?.effectiveType === input.source.effectiveTypes.get(input[site]), true,
    "the actual logical Source publication remains unchanged");
});

for (const declarationKind of ["class", "interface", "struct"]) {
  test(`physical shape cannot replace the selected Native ${declarationKind} identity`, () => {
    const input = fixture();
    const native = csharpTargetNamedType(`fixture.${declarationKind}`, [], { kind: "named", name: "Selected" },
      { sourceDeclarationKind: declarationKind, allowsRefLikeTypeArguments: [] });
    const registered = input.shapes.retainShape({ ...input.physical, targetType: native }, undefined);
    assert.equal(registered?.members.length === input.physical.members.length && registered.members.every((member, index) =>
      csharpObjectShapeMemberContractKey(member) === csharpObjectShapeMemberContractKey(input.physical.members[index]) &&
      member.origins?.length === input.physical.members[index].origins?.length &&
      member.origins.every((origin, originIndex) => origin === input.physical.members[index].origins[originIndex])), true,
      "the opposite has the same complete physical members and genuine Source origins");
    input.scope.selectDirectSourceFacts = () => ({ kind: "resolved", type: native });
    const selected = resolveNodeValueWithState(input.scope, input.reference, input.file, { depth: 0 });
    assert.equal(targetTypeRefEquals(selected?.selectedType, native), true,
      "equal Source publication and an anonymous scoped carrier cannot replace the selected Native declaration");
    assert.equal(selected?.effectiveType === input.source.effectiveTypes.get(input.reference), true,
      "the selected Native identity does not change the original Source publication");
  });
}

test("physical shape read requires the canonical value-storage projection, not an unrelated registered identity", () => {
  const input = fixture();
  const targetType = { ...input.physical.targetType, id: "fixture.other-physical",
    csharpRender: { kind: "named", name: "OtherPhysical" } };
  const other = input.shapes.retainShape({ ...input.physical, targetType }, undefined);
  assert.equal(other?.members === input.physical.members, true,
    "the other registered Native carrier has exactly the same members, widths and origins");
  input.scoped.set(input.reference, targetType);
  input.scoped.set(input.declaration, targetType);
  const selected = resolveNodeValueWithState(input.scope, input.reference, input.file, { depth: 0 });
  assert.equal(targetTypeRefEquals(selected?.selectedType, input.logical), true,
    "Source equality is not authority for a different physical Native identity");
  assert.equal(selected?.effectiveType === input.source.effectiveTypes.get(input.reference), true,
    "the original Source publication remains the sole logical result");
});

for (const kind of ["missing-occurrence", "missing-principal", "different-storage", "unregistered", "foreign-principal",
  "different-current-descriptor", "missing-origins", "foreign-same-width-origin", "different-width"]) {
  test(`physical shape read refuses ${kind} as an alternative physical authority`, () => {
    const input = fixture();
    if (kind === "missing-occurrence") input.scoped.delete(input.reference);
    if (kind === "missing-principal") input.scoped.delete(input.declaration);
    if (kind === "different-storage") input.scoped.set(input.declaration, input.logical);
    if (kind === "unregistered") {
      input.host.objectShapes = { ...input.shapes, resolveTarget: type =>
        targetTypeRefEquals(type, input.physical.targetType) ? undefined : input.shapes.resolveTarget(type) };
    }
    if (kind === "foreign-principal" || kind === "different-current-descriptor") {
      input.host.effectiveTypes = { ...input.source.effectiveTypes, get: node => node === input.declaration
        ? kind === "foreign-principal" ? input.foreign : { ...input.principal, type: input.foreign.type }
        : input.source.effectiveTypes.get(node) };
    }
    if (kind === "missing-origins" || kind === "foreign-same-width-origin" || kind === "different-width") {
      const member = input.physical.members[0];
      const opposite = kind === "missing-origins" ? { ...member, origins: undefined }
        : kind === "foreign-same-width-origin" ? { ...member, origins: [input.foreign.type.members[0].origin] }
        : { ...member, type: { kind: "source-primitive", name: "bool" } };
      const shape = { ...input.physical, members: [opposite, ...input.physical.members.slice(1)] };
      input.host.objectShapes = { ...input.shapes, resolveTarget: type =>
        targetTypeRefEquals(type, input.physical.targetType) ? shape : input.shapes.resolveTarget(type) };
    }
    const selected = resolveNodeValueWithState(input.scope, input.reference, input.file, { depth: 0 });
    assert.equal(targetTypeRefEquals(selected?.selectedType, input.logical), true,
      "a missing or contradictory physical proof cannot replace the unchanged logical Source representation");
    assert.equal(selected?.effectiveType === input.source.effectiveTypes.get(input.reference), true,
      "refusing a physical substitution never fabricates or changes the Source outcome");
  });
}

for (const kind of ["exact", "declared-destination", "foreign-source", "missing-current", "foreign-principal",
  "missing-association", "foreign-association", "unrelated-initializer", "self-principal", "solved-group-independent",
  "unregistered", "different-width"]) {
  test(`literal obligation physical projection preserves ${kind} authority`, () => {
    const input = fixture();
    const original = input.source.effectiveTypes.obligations().find(obligation => obligation.kind === "literal-admission" &&
      (obligation.value ?? obligation.site) === input.literal);
    assert.equal(original?.authority === "inferred" && original.type.kind === "shape", true,
      "the original inferred object obligation has an exact Source destination");
    const obligation = kind === "declared-destination" ? { ...original, authority: "declared" }
      : kind === "foreign-source" ? { ...original, type: input.foreign.type } : original;
    const published = input.host.effectiveTypes;
    input.host.effectiveTypes = { ...published, obligations: () => [obligation], get(node) {
      if (kind === "missing-current" && node === input.literal) return undefined;
      if (kind === "foreign-principal" && node === input.declaration) return input.foreign;
      const outcome = published.get(node);
      if (node === input.literal && kind === "solved-group-independent") return {
        ...outcome, provenance: { ...outcome.provenance, group: input.literal },
      };
      if (node === input.literal && ["missing-association", "foreign-association", "unrelated-initializer", "self-principal"].includes(kind)) return {
        ...outcome, provenance: { ...outcome.provenance, principal: kind === "missing-association" ? undefined : {
          declaration: kind === "foreign-association" ? input.foreign.provenance.occurrence
            : kind === "self-principal" ? input.literal : input.declaration,
          initializer: kind === "unrelated-initializer" ? input.reference : input.literal,
        } },
      };
      return outcome;
    } };
    let shape = input.physical;
    if (kind === "different-width") shape = { ...shape,
      members: [{ ...shape.members[0], type: { kind: "source-primitive", name: "bool" } }, ...shape.members.slice(1)] };
    if (kind === "unregistered" || kind === "different-width") input.host.objectShapes = { ...input.shapes,
      resolveTarget: type => targetTypeRefEquals(type, input.physical.targetType)
        ? kind === "unregistered" ? undefined : shape : input.shapes.resolveTarget(type) };
    const catalog = { definitionForTarget: () => undefined };
    const policy = { ...input.host, projectTypes: { catalog, directSupertypes: () => [] },
      providers: { findTargetBindingByTargetId: () => ({ kind: "missing" }) },
      literalValues: analyzeSourceLiteralValues(input.source.ast, [input.file]),
      types: {
        sourceTypeFlowRepresentation: node => createCsharpSourceTypeRepresentationHost(input.scope, { depth: 0 }, node),
        resolveNode(node, sourceFile) {
          const sourceResult = resolveNodeValueWithState(input.scope, node, sourceFile, { depth: 0 });
          return sourceResult === undefined ? undefined : { kind: "resolved", sourceResult };
        },
      },
    };
    const result = analyzeCsharpSourceTypeFlowObligations(policy, input.host.objectShapes, {
      issues: [], constructionFor: node => node === input.literal
        ? { targetType: input.physical.targetType, shape: input.physical } : undefined,
    }, { dictionaryLiteral: { get: () => undefined } }, { get: () => false });
    const admitted = kind === "exact" || kind === "solved-group-independent";
    assert.equal(result.length, admitted ? 0 : 1,
      "only the same inferred principal may represent this obligation through its proven physical allocation");
    if (!admitted) assert.equal(result[0].sourceNode === original.site && result[0].code === "CSHARP_UNSUPPORTED_AST", true,
      "a foreign or unavailable physical contract does not waive the ordinary Native conversion");
  });
}
