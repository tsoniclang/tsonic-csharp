import { csharpSourceValueResult } from "../../../dist/analysis/source-evidence/types/resolution/call-results.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles, formatDiagnostics } from "@tsonic/tsts";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { createSourceStorageQuery } from "@tsonic/target-api/analysis";
import { createCsharpProjectTypeCatalog } from "../../../dist/analysis/project-types/catalog.js";
import { createCsharpObjectShapePolicy } from "../../../dist/analysis/objects/shapes/api.js";
import { createCsharpSourceTypeParameterEnvironment } from "../../../dist/analysis/source-evidence/types/resolution/type-parameter-environment.js";
import { resolveCsharpTypeParameterConstraints } from "../../../dist/analysis/source-evidence/types/resolution/type-parameter-constraints.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { resolveCsharpSourceTypeDescriptor } from "../../../dist/analysis/source-evidence/types/resolution/effective-types.js";

function fixture() {
  const checked = createCompilerSessionFromFiles({
    currentDirectory: "/project",
    compilerOptions: { strict: true, module: "esnext", moduleResolution: "bundler" },
    files: {
      "/project/factory.ts": "export function make<Outer>() { return class Box<Inner> { label: string = ''; }; }",
      "/project/index.ts": "import { make as imported } from './factory.js'; export class Root<Own> { label: string = ''; }; export const alias = imported;",
    },
  }).checkSource();
  assert.equal(checked.diagnostics.length, 0, formatDiagnostics(checked.diagnostics));
  const source = createTargetSourceProgram(checked);
  const semanticsFor = node => source.semantics.forNode(node);
  const catalog = createCsharpProjectTypeCatalog({ ast: source.ast, navigation: source.navigation,
    enumConstants: source.semantics.enumConstants, semanticsFor });
  assert.equal(catalog.issues.length, 0, "closed checked project catalog");
  assert.equal(catalog.definitions.length, 2, "both checked class declaration forms are exercised");
  const types = new Map(catalog.definitions.map(definition => [
    semanticsFor(definition.declaration).declarations.declaredType(definition.declaration),
    catalog.targetTypeForDeclaration(definition.declaration, definition.typeParameterBindings),
  ]));
  const selections = [];
  const host = {
    ast: source.ast,
    target: { id: "csharp" },
    sourceFacts: source.sourceFacts,
    effectiveTypes: source.effectiveTypes,
    navigation: source.navigation,
    sourceFiles: source.navigation.sourceFiles,
    sourceStorage: createSourceStorageQuery(source, source.navigation.sourceFiles),
    semantics: file => source.semantics.forFile(file),
    hasSemantics: source.semantics.includes,
    semanticsFor,
    typeParameterConstraints: createCsharpSourceTypeParameterEnvironment(source.ast, (declaration, parameter) => {
      const sourceFile = source.ast.getSourceFile(declaration);
      return sourceFile === undefined ? undefined : resolveCsharpTypeParameterConstraints(declaration, parameter, sourceFile, {
        ast: source.ast,
        types: { resolveNode: (node, file) => {
          const type = host.typeResolver.resolveNode(node, file, { depth: 0 });
          return type === undefined ? undefined : { kind: "resolved", sourceResult: csharpSourceValueResult(type) };
        } },
      });
    }),
    projectTypeCatalog: catalog,
    projectTypes: () => ({ directSupertypes: () => [] }),
    representations: { genericProjections: () => [], requiresClosedStructuralContract: () => false,
      scopedTargetType: () => undefined },
    providers: { resolveSelectedTypeRelation: () => undefined },
    objectShapes: { resolveCallableValue: () => undefined },
    memoryBindings: { hasBoundField: () => false },
    typeResolver: {
      resolveNode: (node, file, state) => {
        selections.push({ kind: "value", node, file, depth: state.depth });
        return undefined;
      },
      resolveDescriptor: (descriptor, node, state) => {
        selections.push({ kind: "descriptor", descriptor, node, depth: state.depth });
        return resolveCsharpSourceTypeDescriptor({
          host,
          resolveDirectSourceFacts: () => undefined,
          resolveProviderType: () => undefined,
        }, descriptor, state, node);
      },
      resolveType: () => assert.fail("class shapes must not convert raw checker types"),
      resolveSelectedType: (node, type, file) => source.semantics.forFile(file).types.isStringLike(type)
        ? { kind: "source-primitive", name: "string" } : undefined,
    },
  };
  return { source, catalog, types, selections, host };
}

test("class declaration shapes select checked instances rather than constructor values", () => {
  const { source, catalog, types, selections, host } = fixture();
  const policy = createCsharpObjectShapePolicy(host);
  for (const definition of catalog.definitions) {
    const queries = source.semantics.forNode(definition.declaration);
    const declaredType = queries.declarations.declaredType(definition.declaration);
    const shape = policy.resolveNodeWithState(definition.declaration, definition.sourceFile, { depth: 3 });
    const original = types.get(declaredType);
    const completed = { ...original, typeArguments: original.typeArguments.map(argument => ({ ...argument,
      csharpConstraints: host.typeParameterConstraints.resolve(argument).csharpConstraints })) };
    assert.equal(shape !== undefined && targetTypeRefEquals(shape.targetType, completed), true,
      `exact checked nominal instance carrier ${definition.sourceName}: ${shape?.targetType?.id ?? "absent"}, expected ${original.id}`);
    for (const [index, argument] of shape.targetType.typeArguments.entries()) {
      assert.equal(argument.csharpConstraints?.kind === "resolved", true, `${definition.sourceName}: resolved native binder ${index}`);
      assert.equal(argument.csharpConstraints === completed.typeArguments[index].csharpConstraints, true,
        `${definition.sourceName}: the canonical constraint environment completes binder ${index}`);
    }
    assert.equal(shape?.sourceType === declaredType, true, "matching checked instance source type");
    assert.deepEqual(shape.targetType.typeArguments.map(argument => argument.identity),
      definition.typeParameterBindings.map(argument => argument.identity), "declaration-owned quantifier order");
    assert.deepEqual(shape.targetType.typeArguments.map(argument => argument.name),
      definition.local ? ["Outer", "Inner"] : ["Own"], "captured and construction binders stay separate");
    assert.equal(selections.some(selection => selection.kind === "value" && selection.node === definition.declaration),
      false, "constructor-value selection cannot manufacture a structural class copy");
    assert.equal(selections.some(selection => selection.kind === "descriptor" &&
      selection.descriptor.kind === "declared" && selection.descriptor.declaration === definition.declaration &&
      selection.descriptor.typeArguments.length === definition.typeParameterBindings.length &&
      selection.descriptor.typeArguments.every((argument, index) => argument.kind === "declared" &&
        argument.declaration === [...definition.outerTypeParameters, ...definition.typeParameters][index]) &&
      selection.node === definition.declaration && selection.depth === 4), true, "existing bounded resolution context");
    assert.equal(policy.resolveNode(definition.declaration, definition.sourceFile)?.targetType === shape.targetType,
      true, "one canonical nominal shape across repeated queries");
  }
});

test("ordinary constructor aliases keep expression selection and do not become instances", () => {
  const { source, selections, host } = fixture();
  const policy = createCsharpObjectShapePolicy(host);
  const file = source.navigation.sourceFiles.find(candidate => source.ast.getFileName(candidate) === "/project/index.ts");
  let alias;
  const selectAlias = node => {
    if (source.ast.is.IsVariableDeclaration(node) && source.ast.text(source.ast.name(node)) === "alias") alias = node;
    source.ast.forEachChild(node, child => { if (child !== undefined) selectAlias(child); });
  };
  selectAlias(file);
  assert.equal(alias !== undefined, true, "checked constructor alias source declaration");
  policy.resolveNode(alias, file);
  assert.equal(selections[0]?.kind, "descriptor", "ordinary value selections keep their own carrier");
  assert.equal(selections[0]?.node === alias, true, "exact selected expression node");
  assert.equal(selections[0]?.descriptor === source.effectiveTypes.get(alias)?.type &&
    selections[0]?.descriptor.kind === "callable", true, "the exact published constructor callable is not an instance");
});

test("unavailable declared instance evidence never falls back to a constructor value", () => {
  const { catalog, host } = fixture();
  const declaration = catalog.definitions.find(definition => definition.local).declaration;
  const policy = createCsharpObjectShapePolicy({ ...host,
    typeResolver: { ...host.typeResolver,
      resolveDescriptor: (descriptor, node) => {
        assert.equal(descriptor.kind === "declared" && descriptor.declaration === declaration && node === declaration,
          true, "no guessed instance evidence");
        return undefined;
      },
      resolveType: () => assert.fail("unavailable declared descriptors must not retry raw checker types"),
      resolveNode: () => { assert.fail("a constructor value is not replacement instance evidence"); },
    },
  });
  assert.equal(policy.resolveNode(declaration) === undefined, true, "unresolved declaration shape fails closed");
});

test("foreign declaration shapes are not admitted as project-owned nominal storage", () => {
  const { catalog, host } = fixture();
  const policy = createCsharpObjectShapePolicy({ ...host, navigation: { ...host.navigation,
    isProjectDeclaration: () => false,
  } });
  for (const definition of catalog.definitions) {
    assert.equal(policy.resolveNode(definition.declaration, definition.sourceFile) === undefined, true,
      "exact project declaration ownership remains mandatory");
  }
});
