import assert from "node:assert/strict";
import test from "node:test";
import { publishedCsharpClassBindings } from "../../../dist/analysis/declarations/published-class-bindings.js";
import { hostProgram } from "../../representation/host-fixture.mjs";
import { projectTypeDefinition } from "../../../dist/analysis/project-types/type-policy.js";
import { analyzeCsharpTypeProjections } from "../../../dist/analysis/declarations/type-projections.js";
import { csharpSourceTypeParameter } from "../../../dist/source/extension/type-parameters.js";
import { csharpProjectedType } from "../../../dist/target-model/types/projections.js";

// The class binder vector is the Host publication of the class (facts.values.type: own binders, then the enclosing
// binders it closes over). C# reads it; it never asks a checker for type-argument bindings (I2, nextgen C-2542).
function fixture() {
  const program = hostProgram(`
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
  `);
  const source = { ast: program.ast, facts: program.facts, sourceFiles: program.files, syntax: program.ast,
    sourceFacts: program.host.sourceFacts };
  const classes = program.nodes.filter(node => program.ast.is.IsClassDeclaration(node) || program.ast.is.IsClassExpression(node));
  assert.equal(classes.length, 4);
  return { program, source, classes };
}

/** Type parameters of the lexically enclosing declarations, innermost first. */
function enclosingBinders(ast, declaration) {
  const binders = [];
  for (let owner = ast.parent(declaration); owner !== undefined; owner = ast.parent(owner)) binders.push(...ast.typeParameters(owner));
  return binders;
}

test("published class binder vectors preserve original outer, unused, anonymous and shadowed identities", () => {
  const { program, source, classes } = fixture();
  for (const declaration of classes) {
    const selected = publishedCsharpClassBindings(declaration, source);
    assert.equal(selected !== undefined, true, "every real class has its published binder vector");
    const own = source.ast.typeParameters(declaration);
    assert.equal(selected.own.length === own.length && selected.own.every((node, index) => node === own[index]), true,
      "the exact own binders are retained in authored order, used or not");
    const enclosing = enclosingBinders(source.ast, declaration);
    assert.equal(selected.outer.every(node => enclosing.includes(node)), true,
      "outer entries are binders of lexically enclosing declarations only");
    assert.equal(selected.parameters.length === selected.outer.length + selected.own.length &&
      selected.parameters.every((node, index) => node === [...selected.outer, ...selected.own][index]), true,
    "the published vector is outer binders followed by own binders");
    assert.equal(Object.isFrozen(selected) && Object.isFrozen(selected.parameters) && Object.isFrozen(selected.outer) &&
      Object.isFrozen(selected.own), true, "only evidence shells are frozen");
  }
  const shadowed = classes[3];
  const outerValue = source.ast.typeParameters(program.named("shadow"))[0];
  assert.equal(publishedCsharpClassBindings(shadowed, source).outer.includes(outerValue), false,
    "a shadowed outer binder of the same name is not the binder the class closes over");
  // Completeness (baseline: the full checked vector): every outer binder a class body references is published, in
  // enclosing order, so an empty or partial outer vector fails.
  const binder = (owner, index) => source.ast.typeParameters(program.named(owner))[index];
  const innerValue = source.ast.typeParameters(program.named("inner"))[0];
  const closes = [
    [classes[1], [binder("outer", 0), binder("nested", 0)], "Local closes over First and Third"],
    [classes[2], [binder("outer", 0)], "the anonymous class closes over First"],
    [shadowed, [innerValue], "the shadowing Local closes over inner's Value"],
  ];
  for (const [declaration, referenced, label] of closes) {
    const outer = publishedCsharpClassBindings(declaration, source).outer;
    assert.equal(referenced.every(node => node !== undefined && outer.includes(node)), true, `${label}: published`);
    const enclosing = enclosingBinders(source.ast, declaration);
    assert.equal(outer.every((node, index) => index === 0 ||
      enclosing.indexOf(outer[index - 1]) > enclosing.indexOf(node)), true, `${label}: outer binders keep enclosing order`);
  }
});

test("local class catalogs consume canonical binders while all raw query paths are trapped", () => {
  const { source, classes } = fixture();
  const host = { ast: source.ast, facts: source.facts, sourceFiles: source.sourceFiles, sourceFacts: source.sourceFacts };
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
  const outer = csharpSourceTypeParameter(binders.outer[0], source.ast, source.facts.navigation.identity);
  const projection = csharpProjectedType({ kind: "optional", part: "storage", arguments: [outer] });
  const absent = { get: () => undefined };
  const projections = analyzeCsharpTypeProjections(source, {
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
  const outcome = source.facts.values.type(declaration);
  assert.equal(outcome !== undefined && outcome.kind !== "refused" && outcome.type.kind === "declared", true);
  const descriptor = outcome.type;
  const own = source.ast.typeParameters(declaration);
  const outer = descriptor.typeArguments.filter(argument => !own.includes(argument.declaration));
  const ownArguments = descriptor.typeArguments.filter(argument => own.includes(argument.declaration));
  const foreign = source.ast.typeParameters(classes[1])[0];
  const vector = typeArguments => ({ ...outcome, type: { ...descriptor, typeArguments } });
  for (const [label, publication] of [
    ["refused publication", { kind: "refused", code: "TSONIC_LOCAL_TYPE_UNSUPPORTED", site: declaration, message: "fixture" }],
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
    const facts = { ...source.facts, values: { ...source.facts.values,
      type: node => node === declaration ? publication : source.facts.values.type(node) } };
    assert.equal(publishedCsharpClassBindings(declaration, { ast: source.ast, facts }) === undefined, true, label);
    const host = { ast: source.ast, facts, sourceFiles: source.sourceFiles, sourceFacts: source.sourceFacts };
    assert.equal(projectTypeDefinition(host, declaration).kind === "not-project-type", true, `${label}: no catalog repair`);
  }
});

test("constructor-valued class publications require one exact instance binder vector across all signatures", () => {
  const { source, classes } = fixture();
  const declaration = classes.find(node => source.ast.is.IsClassExpression(node));
  const outcome = source.facts.values.type(declaration);
  assert.equal(outcome !== undefined && outcome.kind !== "refused" &&
    (outcome.type.kind === "callable" || outcome.type.kind === "shape"), true);
  const descriptor = outcome.type;
  const signature = descriptor.constructs[0];
  assert.equal(signature !== undefined, true, "the real class constructor result is published");
  const selected = constructs => publishedCsharpClassBindings(declaration, { ast: source.ast, facts: { values: {
    type: node => node === declaration ? { ...outcome, type: { ...descriptor, constructs } } : source.facts.values.type(node),
  } } });
  assert.equal(selected([signature, signature]) !== undefined, true, "equal overload results retain the same instance");
  assert.equal(selected([]) === undefined, true, "missing constructor results are not repaired");
  assert.equal(selected([signature, { ...signature, result: { ...signature.result, declaration: classes[0] } }]) === undefined, true,
    "foreign overload results cannot supply a binder vector");
});
