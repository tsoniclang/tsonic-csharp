import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles, formatDiagnostics } from "@tsonic/tsts";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { publishedCsharpClassBindings } from "../../../dist/analysis/source-evidence/types/resolution/published-class-bindings.js";
import { projectTypeDefinition } from "../../../dist/analysis/project-types/type-policy.js";
import { analyzeCsharpTypeProjections } from "../../../dist/analysis/declarations/type-projections.js";
import { csharpSourceTypeParameter } from "../../../dist/source/extension/type-parameters.js";
import { csharpProjectedType } from "../../../dist/target-model/types/projections.js";

function fixture() {
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/project", files: { "/project/index.ts": `
    export function outer<First, Second>() {
      class Unused<Left, Right> {}
      function nested<Third>() {
        class Local<Fourth> { declare first: First; declare third: Third; declare own: Fourth; }
        return Local;
      }
      const Anonymous = class<Own> { declare value: First; declare own: Own; };
      return { Unused, nested, Anonymous };
    }
    export function shadow<Value>() {
      function inner<Value>() {
        class Local<Own> { declare value: Value; declare own: Own; }
        return Local;
      }
      return inner;
    }
  ` }, compilerOptions: { strict: true, target: "es2022", module: "esnext" } }).checkSource();
  assert.equal(checked.diagnostics.length, 0, formatDiagnostics(checked.diagnostics));
  const source = createTargetSourceProgram(checked);
  const classes = source.navigation.nodes.filter(node => source.navigation.isProjectDeclaration(node) &&
    (source.ast.is.IsClassDeclaration(node) || source.ast.is.IsClassExpression(node)));
  assert.equal(classes.length, 4);
  return { checked, source, classes };
}

const unexpected = () => assert.fail("published class binders must not reopen checked Types");

test("published class binder vectors preserve original outer, unused, anonymous and shadowed identities", () => {
  const { source, classes } = fixture();
  for (const declaration of classes) {
    const queries = source.semantics.forNode(declaration);
    const checked = queries.declarations.declaredType(declaration);
    const expected = queries.types.typeArgumentBindings(checked);
    assert.equal(expected !== undefined, true, "the original checked binder vector exists");
    const selected = publishedCsharpClassBindings(declaration, source);
    assert.equal(selected !== undefined && selected.parameters.length === expected.length, true,
      "the complete published vector is retained, not inferred from used fields");
    assert.equal(selected.parameters.every((parameter, index) => parameter === expected[index].declaration), true,
      "the original order and exact parameter Nodes are preserved");
    const outer = expected.filter(binding => binding.scope === "outer");
    const own = expected.filter(binding => binding.scope === "local");
    assert.equal(selected.outer.length === outer.length && selected.outer.every((node, index) => node === outer[index].declaration), true,
      "only published outer entries are retained");
    assert.equal(selected.own.length === own.length && selected.own.every((node, index) => node === own[index].declaration), true,
      "the exact own subset stays complete");
    assert.equal(Object.isFrozen(selected) && Object.isFrozen(selected.parameters) && Object.isFrozen(selected.outer) &&
      Object.isFrozen(selected.own), true, "only evidence shells are frozen");
  }
});

test("local class catalogs consume canonical binders while all raw query paths are trapped", () => {
  const { source, classes } = fixture();
  const host = { ast: source.ast, navigation: source.navigation, effectiveTypes: source.effectiveTypes,
    enumConstants: source.semantics.enumConstants, sourceFacts: source.sourceFacts, semanticsFor: unexpected };
  for (const declaration of classes) {
    const binders = publishedCsharpClassBindings(declaration, source);
    const selected = projectTypeDefinition(host, declaration);
    assert.equal(selected.kind === "resolved", true, "the real local declaration is registered");
    assert.equal(selected.definition.outerTypeParameters.length === binders.outer.length &&
      selected.definition.outerTypeParameters.every((parameter, index) => parameter === binders.outer[index]), true,
    "the catalog consumes the exact published outer vector");
    assert.equal(selected.definition.typeParameters.length === binders.own.length &&
      selected.definition.typeParameters.every((parameter, index) => parameter === binders.own[index]), true,
    "the catalog retains every original own parameter");
    assert.equal(selected.definition.typeParameterBindings.length === binders.parameters.length &&
      selected.definition.typeParameterBindings.every((parameter, index) =>
        parameter.csharpDeclaration === binders.parameters[index]), true, "native identities follow the same ordered source vector");
  }
});

test("outer projection ownership consumes the same canonical class binding vector without a Type retry", () => {
  const { source, classes } = fixture();
  const declaration = classes[1];
  const binders = publishedCsharpClassBindings(declaration, source);
  const selectedNode = source.ast.members(declaration)[0];
  const outer = csharpSourceTypeParameter(binders.outer[0], source.ast);
  const projection = csharpProjectedType({ kind: "conditional", declaration, identity: "published.class.outer",
    sourceName: "Outer", sourceArguments: [], arguments: [outer] });
  const absent = { get: () => undefined };
  const projections = analyzeCsharpTypeProjections({ ...source, semantics: new Proxy({}, { get: unexpected }) }, {
    compileTimeMetadata: { get: () => false }, nodeTargetType: { get: node => node === selectedNode ? projection : undefined },
    storageTargetType: absent, bindingProjection: absent,
  }, { selectedCall: absent }, { removesProjection: () => false });
  const retained = projections.outerGenericProjection.get(declaration);
  assert.equal(retained.length === 1 && retained[0].identity === projection.identity, true,
    "the actual local class owns its outer projection");
});

test("missing, foreign, duplicate, reordered and concrete-use vectors cannot replace canonical class bindings", () => {
  const { source, classes } = fixture();
  const declaration = classes[0];
  const outcome = source.effectiveTypes.get(declaration);
  assert.equal(outcome !== undefined && outcome.kind !== "refused" && outcome.type.kind === "declared", true);
  const descriptor = outcome.type;
  const own = source.ast.typeParameters(declaration);
  const outer = descriptor.typeArguments.filter(argument => !own.includes(argument.declaration));
  const ownArguments = descriptor.typeArguments.filter(argument => own.includes(argument.declaration));
  const foreign = source.ast.typeParameters(classes[1])[0];
  const vector = typeArguments => ({ ...outcome, type: { ...descriptor, typeArguments } });
  for (const [label, publication] of [
    ["missing publication", undefined],
    ["refused publication", { kind: "refused", source: "tsonic", code: "TSONIC_LOCAL_TYPE_UNSUPPORTED", site: declaration, reason: "fixture" }],
    ["foreign occurrence", { ...outcome, provenance: { ...outcome.provenance, occurrence: classes[1] } }],
    ["foreign source file", { ...outcome, provenance: { ...outcome.provenance, sourceFile: undefined } }],
    ["foreign nominal owner", { ...outcome, type: { ...descriptor, declaration: classes[1] } }],
    ["missing own parameter", vector([...outer, ownArguments[0]])],
    ["duplicate parameter", vector([...descriptor.typeArguments, descriptor.typeArguments[0]])],
    ["concrete use argument", vector([...outer, ownArguments[0], { kind: "primitive", primitive: "int64" }])],
    ["foreign outer parameter", vector([{ kind: "declared", declaration: foreign, typeArguments: [] }, ...ownArguments])],
    ["reordered own parameters", vector([...outer, ...ownArguments.toReversed()])],
    ["outer after own", vector([ownArguments[0], ...outer, ownArguments[1]])],
    ["cut parameter", vector([...outer, ownArguments[0], { ...ownArguments[1], cut: "recursion" }])],
  ]) {
    const effectiveTypes = { get: node => node === declaration ? publication : source.effectiveTypes.get(node) };
    assert.equal(publishedCsharpClassBindings(declaration, { ast: source.ast, effectiveTypes }) === undefined, true, label);
    const host = { ast: source.ast, navigation: source.navigation, effectiveTypes,
      enumConstants: source.semantics.enumConstants, sourceFacts: source.sourceFacts, semanticsFor: unexpected };
    assert.equal(projectTypeDefinition(host, declaration).kind === "not-project-type", true, `${label}: no catalog repair`);
  }
});

test("constructor-valued class publications require one exact instance binder vector across all signatures", () => {
  const { source, classes } = fixture();
  const declaration = classes.find(node => source.ast.is.IsClassExpression(node));
  const outcome = source.effectiveTypes.get(declaration);
  assert.equal(outcome !== undefined && outcome.kind !== "refused" &&
    (outcome.type.kind === "callable" || outcome.type.kind === "shape"), true);
  const descriptor = outcome.type;
  const signature = descriptor.constructs[0];
  assert.equal(signature !== undefined, true, "the real class constructor result is published");
  const selected = constructs => publishedCsharpClassBindings(declaration, { ast: source.ast, effectiveTypes: {
    get: node => node === declaration ? { ...outcome, type: { ...descriptor, constructs } } : source.effectiveTypes.get(node),
  } });
  assert.equal(selected([signature, signature]) !== undefined, true, "equal overload results retain the same instance");
  assert.equal(selected([]) === undefined, true, "missing constructor results are not repaired");
  assert.equal(selected([signature, { ...signature, result: { ...signature.result, declaration: classes[0] } }]) === undefined, true,
    "foreign overload results cannot supply a binder vector");
});
