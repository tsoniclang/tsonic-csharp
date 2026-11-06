import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles } from "@tsonic/tsts";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { sourceValueDeclaration } from "../../../dist/analysis/source-evidence/types/resolution/calls.js";
import { resolveNode, resolveSelectedValueWithState, resolveSelectedValueResultWithState, resolveStorage } from "../../../dist/analysis/source-evidence/types/resolution/public-api.js";
import { csharpSourceValueResult } from "../../../dist/analysis/source-evidence/types/resolution/call-results.js";
import { selectCsharpPublishedParameterCarrier } from "../../../dist/analysis/source-evidence/types/resolution/source-references.js";
import { csharpTsValueTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { resolveSelectedDeclarationResult } from "../../../dist/analysis/source-evidence/types/resolution/declarations.js";
import { selectCsharpClassFactoryType } from "../../../dist/analysis/project-types/class-factory-types.js";
import { getCsharpClassFactory } from "../../../dist/target-model/types/carriers/class-factories.js";

function checkedStorage(kind) {
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/src", files: {
    "/src/index.ts": "class Container { value: unknown; } declare const container: Container; declare const value: unknown; void container.value; void container['value']; void value; void function(value: unknown): unknown { return value; };",
  }, compilerOptions: { strict: true, target: "es2022", module: "esnext" } }).checkSource();
  assert.equal(checked.diagnostics.length, 0);
  const source = createTargetSourceProgram(checked);
  const file = checked.getSourceFile("/src/index.ts");
  const nodes = [];
  const visit = node => { nodes.push(node); source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); }); };
  visit(file);
  const expression = nodes.find(node => kind === "property" ? source.ast.is.IsPropertyAccessExpression(node)
    : kind === "element" ? source.ast.is.IsElementAccessExpression(node)
      : kind === "function" ? source.ast.is.IsFunctionExpression(node)
        : source.ast.is.IsIdentifier(node) && source.ast.is.IsVoidExpression(source.ast.parent(node)));
  assert.equal(expression !== undefined, true, "the Native storage control uses its original checked value occurrence");
  return { source, file, expression, queries: source.semantics.forFile(file) };
}

function fixture(kind, project) {
  const { source, file: declarationFile, expression, queries } = checkedStorage(kind);
  const access = kind === "property" ? queries.operations.propertyAccess(expression) : queries.operations.elementAccess(expression);
  const declaration = access.selectedDeclaration;
  const scope = {
    host: {
      ast: source.ast,
      effectiveTypes: source.effectiveTypes,
      navigation: {
        ...source.navigation,
        isProjectDeclaration: node => project && node === declaration,
      },
      semanticsFor: node => source.semantics.forNode(node),
    },
    catchVariableStorageCarrier: () => undefined,
  };
  scope.sourceValueDeclaration = (node, reference) => sourceValueDeclaration(scope, node, reference);
  return { scope, expression, declaration, declarationFile };
}

test("parameter carrier selection has one publication owner for every outcome state", () => {
  const { source, expression, file } = checkedStorage("function");
  const parameter = source.ast.parameters(expression)[0];
  assert.equal(parameter !== undefined, true, "the boundary input is a real checked parameter");
  const actual = source.effectiveTypes.get(parameter);
  assert.equal(actual !== undefined && actual.kind !== "refused" && actual.provenance.occurrence === parameter &&
    actual.type.kind === "intrinsic" && actual.type.intrinsic === "unknown", true,
    "the Native boundary consumes the real checked unknown parameter's publication");
  const descriptor = actual.type;
  const provenance = Object.freeze({ group: parameter, occurrence: parameter, sourceFile: file });
  const refusal = Object.freeze({ kind: "refused", source: "tsonic", code: "TSONIC_LOCAL_TYPE_SIGNATURE",
    site: parameter, reason: "The source signature has no chosen type." });
  const cases = [
    ["resolved", { kind: "resolved", type: descriptor, provenance }, "resolved"],
    ["default", { kind: "default", type: descriptor, provenance }, "resolved"],
    ["missing", undefined, "unresolved"],
    ["refused", refusal, "unresolved"],
    ["unrepresentable", { kind: "resolved", type: { kind: "union", types: [] }, provenance }, "unresolved"],
  ];
  for (const [label, publication, expected] of cases) {
    const rejections = [];
    const scope = { host: { ast: source.ast, target: { id: "csharp" }, effectiveTypes: { get(node) {
      assert.equal(node === parameter, true, label);
      return publication;
    } } }, sourceValueDeclarationSyntax: () => assert.fail("annotation syntax is not a parameter type owner"),
    resolveCallableEvidence: () => assert.fail("Native delegate context cannot infer a missing Source parameter"),
    semanticsFor: () => assert.fail("a missing publication cannot invoke checker queries") };
    const selected = selectCsharpPublishedParameterCarrier(scope, parameter,
      { depth: 0, rejectNativeResolution: rejection => rejections.push(rejection) });
    assert.equal(selected.kind, expected, label);
    if (selected.kind === "resolved") assert.equal(targetTypeRefEquals(selected.type, csharpTsValueTargetType()), true, label);
    assert.equal(rejections.length, label === "refused" ? 1 : 0, label);
    if (label === "refused") assert.equal(rejections[0].subject === parameter && rejections[0].code === refusal.code, true, label);
    scope.host.effectiveTypes.get = () => assert.fail("a non-parameter has no parameter lookup");
    assert.equal(selectCsharpPublishedParameterCarrier(scope, expression, { depth: 0 }).kind, "not-applicable", label);
  }
  const foreign = { host: { ast: source.ast, target: { id: "csharp" }, effectiveTypes: {
    get: () => ({ kind: "resolved", type: descriptor, provenance: { ...provenance, occurrence: expression } }),
  } } };
  assert.throws(() => selectCsharpPublishedParameterCarrier(foreign, parameter, { depth: 0 }),
    error => error.diagnostic?.code === "TSONIC_INTERNAL_ANALYSIS_INVARIANT" && error.diagnostic.sourceNode === parameter,
    "a foreign occurrence is rejected rather than typed through another path");
});

test("a dependent native node retains the original selected rejection without a carrier fallback", () => {
  const expression = {};
  const array = {};
  const file = {};
  const selected = Object.freeze({ kind: "rejected", subject: array, code: "CSHARP_ARRAY_ELEMENT_CARRIER_MISMATCH",
    reason: "The original native element destination is inconsistent." });
  const carrier = { kind: "source-primitive", name: "int32" };
  const result = resolveNode({ resolveNodeValueWithState(node, sourceFile, state) {
    assert.equal(node === expression && sourceFile === file, true, "the actual dependent use retains its source context");
    assert.equal("rejectNativeParameter" in state, false, "the superseded parameter-only callback is not another API");
    state.rejectNativeResolution(selected);
    return csharpSourceValueResult(carrier);
  } }, expression, file);
  assert.equal(result === selected && Object.isFrozen(result), true, "the actual immutable owner result is transported unchanged");
  assert.equal(result.subject === array && result.code === selected.code && result.reason === selected.reason, true,
    "the original array subject, precise public code and reason survive its dependent use");
});

test("project storage selection excludes checked external and virtual provider members", () => {
  for (const kind of ["property", "element"]) {
    for (const project of [true, false]) {
      const { scope, expression, declaration } = fixture(kind, project);
      const selected = sourceValueDeclaration(scope, expression, declaration);
      assert.equal(selected === declaration, project, `${kind}: exact project ownership`);
      assert.equal(selected === undefined, !project, `${kind}: provider owns external members`);
    }
  }
});

test("project storage queries use the selected declaration's file, not another reference owner", () => {
  for (const kind of ["property", "element"]) {
    const { scope, expression, declaration, declarationFile } = fixture(kind, true);
    const carrier = { kind: "source-primitive", name: "int32" };
    scope.resolveNode = (selected, file) => {
      assert.equal(selected === declaration, true, `${kind}: exact storage declaration`);
      assert.equal(file === declarationFile, true, `${kind}: exact checked declaration file`);
      return { kind: "resolved", sourceResult: csharpSourceValueResult(carrier) };
    };
    assert.equal(resolveStorage(scope, expression, {}) === carrier, true, `${kind}: native carrier`);
  }
});

test("selected values consume the exact occurrence publication without a checked type or member retry", () => {
  for (const kind of ["identifier", "property", "element", "function"]) {
    for (const available of [true, false]) {
      const { source, file, expression: node, queries } = checkedStorage(kind);
      const type = queries.types.expressionType(node);
      const enclosing = { kind: "value", node: {}, projection: [] };
      const bindings = new Map();
      const state = { depth: 3, sourceStorageSubject: enclosing, sourceBindings: bindings };
      const carrier = { kind: "source-primitive", name: "int64" };
      const observed = [];
      const accept = selected => {
        assert.equal(selected === state && selected.sourceStorageSubject === enclosing, true, `${kind}: the immutable caller context is retained`);
        assert.equal(selected.sourceBindings === bindings && selected.depth === 3, true, kind);
      };
      const scope = {
        host: {
          ast: source.ast,
          effectiveTypes: source.effectiveTypes,
          navigation: source.navigation,
          sourceStorage: { subjectFor: () => assert.fail("published value selection does not infer a replacement storage owner") },
          representations: { genericProjections: () => [], scopedTargetType: () => undefined },
          structuralTypes: { resolveTarget: () => assert.fail("these exact unknown/primitive Native unit operands have no structural union member") },
          semantics: () => queries,
        },
        sourceValueDeclaration: () => undefined,
        resolveSelectedValueResultWithState: (...args) => resolveSelectedValueResultWithState(scope, ...args),
        resolveNodeValueWithState(selected, selectedFile, nested) {
          assert.equal(selected === node && selectedFile === file, true, kind);
          accept(nested); observed.push("publication"); return available ? csharpSourceValueResult(carrier) : undefined;
        },
        resolveTypeWithState(selected, selectedFile, nested) {
          assert.equal(selected === type && selectedFile === file, true, kind);
          assert.fail("missing publications cannot invoke checked type resolution");
        },
        resolveMemberAccessTargetType(selected, selectedQueries, nested) {
          assert.equal(selected === node && selectedQueries === queries, true, kind);
          assert.fail("missing publications cannot invoke member retyping");
        },
      };
      assert.equal(resolveSelectedValueWithState(scope, node, type, file, state) === (available ? carrier : undefined), true, kind);
      assert.deepEqual(observed, ["publication"]);
      assert.equal(state.sourceStorageSubject === enclosing, true, "the enclosing operation is immutable");
    }
  }
});

test("member storage consumes its published declaration without checked symbol or read-type reconstruction", () => {
  const { source, queries, expression } = checkedStorage("property");
  const declaration = queries.operations.propertyAccess(expression).selectedDeclaration;
  assert.equal(declaration !== undefined, true);
  const actual = source.effectiveTypes.get(declaration);
  assert.equal(actual !== undefined && actual.kind !== "refused", true);
  const receiver = Object.freeze({ kind: "target-named", id: "fixture.Container" });
  const refusal = Object.freeze({ kind: "refused", source: "tsonic", code: "TSONIC_LOCAL_TYPE_CONFLICT",
    site: declaration, reason: "The original declaration is refused." });
  for (const [label, publication, available] of [["resolved", { ...actual, kind: "resolved" }, true],
    ["default", { ...actual, kind: "default" }, true], ["missing", undefined, false], ["refused", refusal, false],
    ["unrepresentable", { ...actual, type: { kind: "union", types: [] } }, false]]) {
    const forbidden = () => assert.fail(label + ": no second Source storage decision");
    const instantiated = [];
    const rejections = [];
    const scope = { host: { ast: source.ast, target: { id: "csharp" },
      effectiveTypes: { get(node) { assert.equal(node === declaration, true); return publication; } },
      semanticsFor: forbidden, semantics: forbidden,
      projectTypes: () => ({ instantiateMemberType(node, selected, type) {
        assert.equal(node === declaration && selected === receiver, true);
        instantiated.push(type);
        return { kind: "resolved", type };
      } }),
    }, resolveNodeWithState: forbidden, resolveAuthoredAndSelectedSourceType: forbidden,
    resolveProjectEnumMemberTarget: () => undefined };
    const result = resolveSelectedDeclarationResult(scope, declaration,
      { depth: 0, rejectNativeResolution: rejection => rejections.push(rejection) }, receiver);
    assert.equal(result !== undefined, available, label);
    assert.equal(instantiated.length, available ? 1 : 0, label);
    if (available) assert.equal(result === instantiated[0] && targetTypeRefEquals(result, csharpTsValueTargetType()), true, label);
    assert.equal(rejections.length, label === "refused" ? 1 : 0, label);
    if (label === "refused") assert.equal(rejections[0].subject === declaration && rejections[0].reason === refusal.reason, true);
  }
});

test("local class factories derive their metadata only from the published instance and original class members", () => {
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/src", files: {
    "/src/index.ts": "function outer() { class Local { Create: unknown; _Create: unknown; IsInstance: unknown; } return Local; }",
  }, compilerOptions: { strict: true, target: "es2022", module: "esnext" } }).checkSource();
  assert.equal(checked.diagnostics.length, 0);
  const source = createTargetSourceProgram(checked);
  const nodes = [];
  const visit = node => { if (source.ast.is.IsClassDeclaration(node)) nodes.push(node);
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); }); };
  visit(checked.getSourceFile("/src/index.ts"));
  const owner = nodes[0];
  const publication = source.effectiveTypes.get(owner);
  assert.equal(publication !== undefined && publication.kind !== "refused" && publication.type.kind === "declared", true);
  const instance = Object.freeze({ kind: "target-named", id: "fixture.Local", typeArguments: Object.freeze([]) });
  const definition = { kind: "class", declaration: owner, local: true, abstract: false, factoryName: "LocalFactory",
    outerTypeParameters: [], outerTypeProjections: [] };
  const catalog = { definitionForTarget(type) { return type === instance ? definition : undefined; } };
  const factory = selectCsharpClassFactoryType(source.ast, catalog, instance);
  const contract = getCsharpClassFactory(factory);
  assert.equal(contract?.declaration === owner && contract.instance === instance, true);
  assert.equal(contract.createMethodName, "__Create");
  assert.equal(contract.instanceTestMethodName, "_IsInstance");
  assert.equal(selectCsharpClassFactoryType(source.ast, catalog, undefined), undefined);
  assert.equal(selectCsharpClassFactoryType(source.ast, catalog, { ...instance }), undefined);
  definition.abstract = true;
  assert.equal(selectCsharpClassFactoryType(source.ast, catalog, instance), undefined);
});
