import assert from "node:assert/strict";
import test from "node:test";
import { sourceValueDeclaration } from "../../../dist/policy/types/resolution/calls.js";
import { resolveSelectedValueWithState, resolveStorage } from "../../../dist/policy/types/resolution/public-api.js";
import { resolveSourceValueDeclaration } from "../../../dist/policy/types/resolution/source-references.js";

function fixture(kind, project) {
  const expression = { kind };
  const declaration = { kind: "variable" };
  const declarationFile = {};
  const referenceFile = {};
  const scope = {
    host: {
      ast: {
        is: {
          IsVariableDeclaration: node => node?.kind === "variable",
          IsBindingElement: () => false,
          IsParameterDeclaration: () => false,
          IsPropertyDeclaration: () => false,
          IsPropertyAccessExpression: node => node?.kind === "property",
          IsElementAccessExpression: node => node?.kind === "element",
        },
        getSourceFile: node => node === declaration ? declarationFile : undefined,
      },
      navigation: {
        referenceFor: () => ({ declaration, sourceFile: referenceFile }),
        isProjectDeclaration: node => project && node === declaration,
      },
      semanticsFor: () => ({ operations: {
        propertyAccess: () => ({ selectedDeclaration: declaration }),
        elementAccess: () => ({ selectedDeclaration: declaration }),
      } }),
    },
    catchVariableStorageCarrier: () => undefined,
  };
  scope.sourceValueDeclaration = (node, reference) => sourceValueDeclaration(scope, node, reference);
  return { scope, expression, declaration, declarationFile };
}

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
      return carrier;
    };
    assert.equal(resolveStorage(scope, expression, {}) === carrier, true, `${kind}: native carrier`);
  }
});

test("selected values replace an enclosing operation owner for both syntax and checked type resolution", () => {
  for (const kind of ["identifier", "property", "element", "function"]) {
    for (const available of [true, false]) {
      const node = { kind };
      const type = {};
      const file = {};
      const enclosing = { kind: "value", node: {}, projection: [] };
      const operand = { kind: "value", node, projection: kind === "element" ? [{ kind: "tuple-element", index: 0 }] : [] };
      const bindings = new Map();
      const state = { depth: 3, sourceStorageSubject: enclosing, sourceBindings: bindings };
      const expected = available ? operand : undefined;
      const carrier = { kind: "source-primitive", name: "int64" };
      const queries = { types: { expressionType: () => undefined } };
      const observed = [];
      const accept = selected => {
        assert.equal(selected.sourceStorageSubject === expected, true, `${kind}: exact operand owner or no evidence`);
        assert.equal(selected.sourceBindings === bindings && selected.depth === 4, true, kind);
      };
      const scope = {
        host: {
          ast: { is: { IsPropertyAccessExpression: () => kind === "property", IsElementAccessExpression: () => kind === "element",
            IsTypeAliasDeclaration: () => false, IsInterfaceDeclaration: () => false, IsTypeParameterDeclaration: () => false } },
          navigation: { referenceFor: () => undefined },
          sourceStorage: { subjectFor(selected) {
            assert.equal(selected === node, true, kind);
            return available ? { kind: "resolved", subject: operand } : { kind: "unresolved", reason: "no exact owner" };
          } },
          representations: { genericProjections: () => [], scopedTargetType: () => undefined },
          semantics: () => queries,
        },
        sourceValueDeclaration: () => undefined,
        resolveNodeWithState(selected, selectedFile, nested) {
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

function refusedArrayFixture() {
  const node = {};
  const declaration = {};
  const initializer = {};
  const sourceFile = {};
  const checkedType = {};
  const subject = { kind: "value", node: declaration, projection: [] };
  const previous = { kind: "array", element: { kind: "source-primitive", name: "float64" } };
  const rejected = Object.freeze({ kind: "rejected", reason: "The original array producer has conflicting native destinations." });
  const queries = { sourceFile, declarations: { declaredValueType: () => checkedType } };
  let selections = 0;
  const scope = {
    host: {
      ast: { is: { IsVariableDeclaration: value => value === declaration, IsBindingElement: () => false,
        IsArrayLiteralExpression: value => value === initializer },
      getSourceFile: value => value === declaration ? sourceFile : undefined,
      typeNode: () => undefined, parent: () => undefined },
      navigation: { referenceFor: value => {
        assert.equal(value === node, true, "the selected value keeps its exact checked declaration reference");
        return { declaration };
      } },
      semantics: file => {
        assert.equal(file === sourceFile, true, "the canonical source producer keeps its checked source context");
        return queries;
      },
      sourceStorage: { subjectFor: () => ({ kind: "resolved", subject }) },
      representations: { scopedTargetType: () => assert.fail("an existing physical carrier cannot rescue a rejected source producer") },
    },
    sourceValueDeclaration: () => declaration,
    sourceValueDeclarationSyntax: () => ({ initializer }),
    resolveTypeWithState: () => previous,
    resolveArrayLiteralWithState: (value, selectedQueries) => {
      assert.equal(value === initializer && selectedQueries === queries, true, "the one canonical array selector owns the actual initializer");
      selections += 1;
      return rejected;
    },
    resolveDirectSourceFacts: () => assert.fail("a rejected producer cannot become an inferred native source fact"),
    resolveSelectedExpressionType: () => assert.fail("a rejected producer cannot be reselected from its checker result"),
    resolveNodeWithState: () => assert.fail("a rejected producer has no physical fallback"),
  };
  scope.resolveSourceValueDeclaration = (...arguments_) => resolveSourceValueDeclaration(scope, ...arguments_);
  return { scope, node, queries, checkedType, sourceFile, rejected, selections: () => selections };
}

test("source-value resolution transports the original rejected array selection without a declared-carrier fallback", () => {
  const current = refusedArrayFixture();
  const selected = resolveSourceValueDeclaration(current.scope, current.node, current.queries, { depth: 0 });
  assert.equal(selected === current.rejected, true, "the same canonical rejected Result and reason are retained by identity");
  assert.equal(current.selections(), 1, "the owning source-value query performs only its one canonical selection");
});

test("selected native storage cannot rescue or revalidate a canonically rejected array producer", () => {
  const current = refusedArrayFixture();
  const selected = resolveSelectedValueWithState(current.scope, current.node, current.checkedType, current.sourceFile, { depth: 0 });
  assert.equal(selected === undefined, true, "neither previous physical storage nor checked float64 inference publishes a target carrier");
  assert.equal(current.selections(), 1, "the consumer propagates the owning Result without a second array validator");
});
