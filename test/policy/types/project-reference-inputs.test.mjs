import assert from "node:assert/strict";
import test from "node:test";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { checkCsharpSource, assertCsharpCheckingSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { resolveProjectSourceType, projectSourceDeclarationTargetType } from "../../../dist/analysis/source-evidence/types/resolution/project-types.js";
import { resolveTypeReferenceNode } from "../../../dist/analysis/source-evidence/types/resolution/source-references.js";
import { resolveNodeValueWithState } from "../../../dist/analysis/source-evidence/types/resolution/nodes.js";

test("project reference selection retains the existing whole checked component in every current caller", () => {
  const checked = checkCsharpSource({ sourceText: `
    export interface Box<Value = int32> { readonly value: Value; }
    export interface Uses {
      explicit: Box<int64>;
      defaulted: Box;
      foreign: Array<int64>;
    }
    export function outer<Outer>(value: Outer): Outer {
      class Local<Inner = int32> { outer?: Outer; inner?: Inner; }
      let local: Local<int64> | undefined;
      void local;
      return value;
    }
    export function shadow(value: int64): int64 {
      interface Box<Value = int32> { readonly own?: Value; }
      let local: Box<int64> | undefined;
      void local;
      return value;
    }
  ` });
  assertCsharpCheckingSucceeded(checked);
  const source = createTargetSourceProgram(checked.source);
  const { ast, navigation } = source;
  const references = navigation.nodes.filter(node => ast.is.IsTypeReferenceNode(node) &&
    ["Box", "Local", "Array"].includes(ast.text(ast.as.AsTypeReferenceNode(node).TypeName)));
  assert.equal(references.length, 5, "all explicit, defaulted, outer, shadow and foreign references are real Source nodes");
  const projectReferences = references.filter(node => navigation.referenceFor(ast.as.AsTypeReferenceNode(node).TypeName) !== undefined);
  assert.equal(projectReferences.length, 4, "only the four actual project references can reach project projection");
  const projection = Object.freeze({ kind: "opaque", id: "observed-project-reference-boundary" });
  const integer = Object.freeze({ kind: "source-primitive", name: "int64" });
  const targets = [];
  let defaults = 0;
  let outerBindings = 0;
  for (const node of projectReferences) {
    const original = source.semantics.forNode(node);
    const selectedType = original.types.authoredType(node);
    const name = ast.as.AsTypeReferenceNode(node).TypeName;
    const reference = navigation.referenceFor(name);
    assert.equal(selectedType !== undefined && reference !== undefined, true, "the exact checked reference is available");
    const argumentNodes = ast.typeArguments(node);
    const sourceArguments = argumentNodes.map(argument => original.types.authoredType(argument));
    const nativeArguments = argumentNodes.map(() => integer);
    const bindings = original.types.typeArgumentBindings(selectedType);
    if (argumentNodes.length === 0) {
      defaults += 1;
      assert.equal(bindings.some(binding => binding.scope === "local" && binding.argumentType !== undefined), true,
        "the whole defaulted application retains its checked default without reopening the binder");
    }
    if (ast.text(name) === "Local") {
      outerBindings += 1;
      assert.equal(bindings.length === 2 && bindings.some(binding => binding.scope === "outer") &&
        bindings.some(binding => binding.scope === "local"), true, "the whole local reference retains its original outer and own vector");
    }
    if (ast.text(name) === "Box" && argumentNodes.length !== 0) targets.push(reference.declaration);
    const observations = [];
    const internalQueries = [];
    const host = {
      ast, navigation,
      semantics(file) {
        const queries = source.semantics.forFile(file);
        return { ...queries, types: { ...queries.types, authoredType(subject) {
          assert.equal(subject !== node && subject !== name, true, "project selection never reopens the whole reference or its TypeName");
          internalQueries.push(subject);
          return queries.types.authoredType(subject);
        } } };
      },
    };
    const scope = { host,
      resolveNodeWithState(argument) {
        assert.equal(argumentNodes.includes(argument), true, "only the original explicit argument is lowered");
        return integer;
      },
      projectSourceDeclarationTargetType(declaration, native, sources, state, selected) {
        observations.push({ declaration, native, sources, state, selected });
        return projection;
      },
    };
    const state = { depth: 0 };
    assert.equal(resolveProjectSourceType(scope, name, original.sourceFile, state, selectedType,
      nativeArguments, sourceArguments) === projection, true, "the existing boundary result is unchanged");
    const direct = observations.pop();
    assert.equal(direct.declaration === reference.declaration && direct.native === nativeArguments &&
      direct.sources === sourceArguments && direct.selected === selectedType && direct.state === state, true,
      "target, complete caller vectors, state and whole checked component keep object identity");
    assert.equal(internalQueries.length, 0, "already-retained arguments require no project query");
    assert.equal(resolveProjectSourceType(scope, name, original.sourceFile, state, undefined,
      nativeArguments, sourceArguments) === projection, true);
    assert.equal(observations.pop().selected === undefined && internalQueries.length === 0, true,
      "a missing whole component remains missing rather than reopening the TypeName");

    const caller = { ...scope,
      selectDirectSourceFacts: () => ({ kind: "not-applicable" }),
      resolveProjectSourceType(...arguments_) { return resolveProjectSourceType(scope, ...arguments_); },
    };
    assert.equal(resolveTypeReferenceNode(caller, node, original, state) === projection, true,
      "the actual Source-reference caller forwards its retained whole component");
    assert.equal(observations.pop().selected === selectedType, true, "the TypeName cannot substitute its formal Type");

    let wholeReads = 0;
    const fallbackQueries = { ...original, types: { ...original.types, authoredType(subject) {
      if (subject === node) wholeReads += 1;
      return original.types.authoredType(subject);
    } } };
    const fallback = { ...caller, host: { ...host,
      effectiveTypes: { get: () => undefined },
      semantics: () => fallbackQueries,
      sourceStorage: { storageSubjectFor: () => undefined },
      representations: { scopedTargetType: () => undefined },
    }, resolveTypeReferenceNode: () => undefined, resolveProjectThisTargetType: () => undefined };
    const result = resolveNodeValueWithState(fallback, node, original.sourceFile, state);
    assert.equal(result?.selectedType === projection && observations.pop().selected === selectedType, true,
      "the fallback reuses the exact whole component already checked for constructor metadata");
    assert.equal(wholeReads, 1, "constructor metadata and project selection share one existing whole-node query");
  }
  assert.equal(defaults, 1, "the omitted argument case was exercised");
  assert.equal(outerBindings, 1, "the original outer vector case was exercised");
  assert.equal(targets.length === 2 && targets[0] !== targets[1], true, "shadowed equal-spelling declarations stay distinct");

  const foreign = references.find(node => ast.text(ast.as.AsTypeReferenceNode(node).TypeName) === "Array");
  const foreignName = ast.as.AsTypeReferenceNode(foreign).TypeName;
  const foreignDeclaration = navigation.sourceReferenceFor(foreignName).declaration;
  assert.equal(navigation.isProjectDeclaration(foreignDeclaration), false, "the original foreign declaration is not a project owner");
  assert.equal(resolveProjectSourceType({ host: { ast, navigation,
    semantics() { assert.fail("a foreign reference cannot request project component queries"); } },
  projectSourceDeclarationTargetType() { assert.fail("a foreign reference cannot request project projection"); } },
  foreignName, ast.getSourceFile(foreign), { depth: 0 }, undefined), undefined);
  assert.equal(projectSourceDeclarationTargetType({ host: { navigation,
    semanticsFor() { assert.fail("a foreign declaration cannot request project semantics"); } } }, foreignDeclaration, []), undefined);
  let missingProjection = 0;
  assert.equal(resolveProjectSourceType({ host: { ast, navigation: { referenceFor: () => undefined } },
    projectSourceDeclarationTargetType() { missingProjection += 1; } }, projectReferences[0], ast.getSourceFile(projectReferences[0]),
  { depth: 0 }, undefined), undefined);
  assert.equal(missingProjection, 0, "missing selected declaration identity never reaches project projection");

  const declarations = navigation.nodes.filter(node => navigation.isProjectDeclaration(node) &&
    (ast.is.IsClassDeclaration(node) || ast.is.IsInterfaceDeclaration(node)));
  assert.equal(declarations.some(node => ast.is.IsClassDeclaration(node)) &&
    declarations.some(node => ast.is.IsInterfaceDeclaration(node)), true, "real class and interface declarations are both checked");
  for (const node of declarations) {
    let queries = 0;
    const result = resolveNodeValueWithState({ host: { ast, effectiveTypes: { get: () => undefined },
      semantics() { queries += 1; assert.fail("an unpublished class or interface never reaches syntax fallback"); },
    } }, node, ast.getSourceFile(node), { depth: 0 });
    assert.equal(result, undefined, "an unavailable class or interface publication stays unavailable");
    assert.equal(queries, 0, "class/interface reachability does not add a new declaration query");
  }
});
