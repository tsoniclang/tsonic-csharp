import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles } from "@tsonic/tsts";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { sourceValueDeclaration } from "../../../dist/analysis/source-evidence/types/resolution/calls.js";
import { resolveNode, resolveSelectedValueWithState, resolveSelectedValueResultWithState, resolveStorage } from "../../../dist/analysis/source-evidence/types/resolution/public-api.js";
import { csharpSourceValueResult } from "../../../dist/analysis/source-evidence/types/resolution/call-results.js";

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

test("selected values replace an enclosing operation owner for both syntax and checked type resolution", () => {
  for (const kind of ["identifier", "property", "element", "function"]) {
    for (const available of [true, false]) {
      const { source, file, expression: node, queries } = checkedStorage(kind);
      const type = queries.types.expressionType(node);
      const enclosing = { kind: "value", node: {}, projection: [] };
      const operand = { kind: "value", node, projection: kind === "element" ? [{ kind: "tuple-element", index: 0 }] : [] };
      const bindings = new Map();
      const state = { depth: 3, sourceStorageSubject: enclosing, sourceBindings: bindings };
      const expected = available ? operand : undefined;
      const carrier = { kind: "source-primitive", name: "int64" };
      const observed = [];
      const accept = selected => {
        assert.equal(selected.sourceStorageSubject === expected, true, `${kind}: exact operand owner or no evidence`);
        assert.equal(selected.sourceBindings === bindings && selected.depth === 4, true, kind);
      };
      const scope = {
        host: {
          ast: source.ast,
          effectiveTypes: source.effectiveTypes,
          navigation: source.navigation,
          sourceStorage: { subjectFor(selected) {
            assert.equal(selected === node, true, kind);
            return available ? { kind: "resolved", subject: operand } : { kind: "unresolved", reason: "no exact owner" };
          } },
          representations: { genericProjections: () => [], scopedTargetType: () => undefined },
          semantics: () => queries,
        },
        sourceValueDeclaration: () => undefined,
        resolveSelectedValueResultWithState: (...args) => resolveSelectedValueResultWithState(scope, ...args),
        resolveNodeValueWithState(selected, selectedFile, nested) {
          assert.equal(selected === node && selectedFile === file, true, kind);
          accept(nested); observed.push("syntax"); return undefined;
        },
        resolveTypeWithState(selected, selectedFile, nested) {
          assert.equal(selected === type && selectedFile === file, true, kind);
          accept(nested); observed.push("type"); return carrier;
        },
        resolveMemberAccessTargetType(selected, selectedQueries, nested) {
          assert.equal(selected === node && selectedQueries === queries, true, kind);
          accept(nested); observed.push("member"); return carrier;
        },
      };
      assert.equal(resolveSelectedValueWithState(scope, node, type, file, state) === carrier, true, kind);
      assert.deepEqual(observed, kind === "property" || kind === "element" ? ["member"] : ["syntax", "type"]);
      assert.equal(state.sourceStorageSubject === enclosing, true, "the enclosing operation is immutable");
    }
  }
});
