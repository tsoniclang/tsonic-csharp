import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles } from "@tsonic/tsts";
import { createTargetSourceProgram, sourceCallableValueParameters } from "@tsonic/target-api/source";
import { createSourceStorageQuery } from "@tsonic/target-api/analysis";
import { resolveCallableEvidence, resolveFormedCsharpCallableEvidence, resolveSignatureParameterEvidence,
  resolveFormedCsharpSignatureParameterEvidence, resolveSourceProfileType,
  resolveSourceTypeComponentEvidence, resolveFormedCsharpSourceTypeComponentEvidence } from "../../../dist/analysis/source-evidence/types/resolution/source-profiles.js";
import { formCsharpSourceTypeComponentSource } from "../../../dist/analysis/source-evidence/types/resolution/type-component-source.js";
import { csharpSourceStorageComponentContext } from "../../../dist/analysis/source-evidence/types/resolution/source-storage-projection.js";
import { createSourceErrorProviderFixture } from "../../fixtures/dotnet-provider/source-error-bindings.mjs";
import { getCsharpDelegateSignature, targetTypeRefEquals } from "../../../dist/target-model/types/index.js";

const typeOnlyPredicates = { IsTypeAliasDeclaration: () => false, IsInterfaceDeclaration: () => false,
  IsTypeParameterDeclaration: () => false };
const subject = (node, kind = "value", projection = []) => Object.freeze({ node, kind, projection: Object.freeze(projection) });

test("implementation signature evidence uses the original contextual tuple parameter before erased semantic storage", () => {
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/project", files: {
    "/project/index.ts": "const consume: (...values: [number, bigint, string]) => boolean = (...values) => values[0] > 0;",
  }, compilerOptions: { strict: true, target: "es2022", module: "esnext" } }).checkSource();
  assert.equal(checked.diagnostics.length, 0, "the source supplies one checked contextual tuple");
  const source = createTargetSourceProgram(checked);
  const file = checked.getSourceFile("/project/index.ts");
  const storage = createSourceStorageQuery(source, [file]);
  let implementation;
  const visit = node => {
    if (source.ast.is.IsArrowFunction(node)) implementation = node;
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(file);
  assert.equal(implementation !== undefined, true, "one actual implementation owns the parameter");
  const queries = source.semantics.forFile(file);
  const incoming = sourceCallableValueParameters(source.ast, implementation, queries)[0];
  const callable = queries.types.callable(queries.types.expressionType(implementation));
  assert.equal(callable.parameters.length, 3, "the checked metadata expands the one original rest parameter into three effective slots");
  const native = Object.freeze({ kind: "tuple", elements: Object.freeze([
    Object.freeze({ kind: "source-primitive", name: "int32" }),
    Object.freeze({ kind: "source-primitive", name: "int64" }),
    Object.freeze({ kind: "source-primitive", name: "string" }),
  ]) });
  let formalSelections = 0;
  let physicalSelections = 0;
  const scope = {
    host: { ast: source.ast, sourceStorage: storage,
      hasSemantics: selectedFile => selectedFile === file,
      semantics: selectedFile => source.semantics.forFile(selectedFile), objectShapes: {
      resolveNativeParameter(owner, parameter, type) {
        assert.equal(owner === implementation && parameter === incoming && targetTypeRefEquals(type, native), true,
          "physical input selection consumes the same complete contextual tuple");
        physicalSelections += 1;
        return { kind: "resolved", type };
      },
    } },
    sourceValueDeclarationSyntax: node => ({ type: source.ast.typeNode(node),
      initializer: source.ast.as.AsParameterDeclaration(node).Initializer }),
    resolveFormedSourceTypeComponentEvidence(componentSource) {
      const component = componentSource.component;
      if (component.declaration === implementation || component.authoredTypeNode !== undefined &&
        source.ast.kindName(component.authoredTypeNode) === "KindBooleanKeyword") return { kind: "source-primitive", name: "bool" };
      assert.equal(component.declaration !== incoming && component.authoredTypeNode !== undefined &&
        source.ast.is.IsTupleTypeNode(component.authoredTypeNode), true,
        "only the original contextual formal owns native tuple metadata, not the erased implementation tuple");
      formalSelections += 1;
      return native;
    },
  };
  scope.host.projectTypeCatalog = { genericProjections: () => [] };
  scope.resolveFormedSignatureParameterEvidence = input => resolveFormedCsharpSignatureParameterEvidence(scope, input);
  scope.resolveFormedCallableEvidence = input => resolveFormedCsharpCallableEvidence(scope, input);
  const selected = resolveCallableEvidence(scope, callable, queries, { depth: 0 });
  const signature = getCsharpDelegateSignature(selected);
  assert.equal(signature?.parameters.length === 3 && signature.parameters.every((type, index) =>
    targetTypeRefEquals(type, native.elements[index])) && formalSelections === 1 && physicalSelections === 1, true,
    "callable ABI evidence retains the one contextual native tuple without semantic reselection");
});

test("type transformations retain the selected value owner independently of metadata declarations", () => {
  for (const mode of ["parameter", "result", "unavailable"]) {
    const owner = { kind: mode };
    const imported = subject({ kind: "import" }, "member", [{ kind: "array-element" }, { kind: "tuple-element", index: 0 }]);
    const syntax = {};
    const type = {};
    const file = {};
    const bindings = new Map([[{}, { sourceType: {}, targetType: { kind: "source-primitive", name: "int64" } }]]);
    const state = { depth: 4, sourceStorageSubject: imported, sourceBindings: bindings };
    const expected = mode === "unavailable" ? undefined : { kind: "source-primitive", name: "int64" };
    let selections = 0;
    const assertOwner = selected => {
      assert.equal(selected.sourceStorageSubject === imported, true, mode);
      assert.equal(selected.sourceStorageSubject.projection === imported.projection, true, mode);
      assert.equal(selected.sourceBindings === bindings, true, mode);
    };
    const host = { ast: { getSourceFile: () => file, is: typeOnlyPredicates },
      hasSemantics(selectedFile) {
        assert.equal(selectedFile === file, true, mode);
        return false;
      },
      semantics: () => assert.fail("the synthetic metadata file has no owned checked Source queries"),
    };
    const componentSource = formCsharpSourceTypeComponentSource({ host },
      { declaration: owner, authoredTypeNode: syntax, selectedType: type }, { sourceFile: file }, state);
    assert.equal(componentSource.checked.kind === "authored" &&
      componentSource.checked.source.dependencies.authored === undefined, true,
      "the explicit unavailable authored Source keeps its metadata, not an invented Native node request");
    const result = resolveFormedCsharpSourceTypeComponentEvidence({
      host,
      resolvePointerReturn(declaration, selected) {
        assert.equal(declaration === owner, true, mode);
        assertOwner(selected);
        assert.equal(selected.depth, 4, mode);
        return undefined;
      },
      resolveNodeWithState: () => assert.fail("the unavailable authored Source cannot acquire a Native node child"),
      resolveTypeWithState(selectedType, selectedFile, childState) {
        const { authoredTypeNode: authored, authoredSourceFile: authoredFile,
          inputState: selected } = componentSource.checked.source;
        selections += 1;
        assert.equal(authored === syntax && authoredFile === file, true, mode);
        assert.equal(selectedType === type && selectedFile === file, true, mode);
        assertOwner(selected);
        assert.equal(selected.depth, 5, mode);
        assert.equal(selected === componentSource.childState &&
          childState === componentSource.checked.source.dependencies.selected.state, true, mode);
        assertOwner(childState);
        assert.equal(childState.depth, selected.depth + 1, mode);
        return expected;
      },
    }, componentSource);
    assert.equal(result === expected, true, mode);
    assert.equal(selections, 1, mode);
    assert.equal(state.sourceStorageSubject === imported && imported.projection.length === 2, true, mode);
  }
});

test("callable parameters establish their exact entry input while tuple transformations retain theirs", () => {
  const owner = {};
  const input = subject(owner, "input");
  const imported = subject({}, "member", [{ kind: "tuple-element", index: 0 }]);
  const type = {};
  const file = {};
  const syntax = {};
  const carrier = { kind: "source-primitive", name: "int64" };
  const state = { depth: 2, sourceStorageSubject: imported };
  for (const use of ["callable", "parameter-list"]) {
    const resolved = resolveSignatureParameterEvidence({
      host: { ast: { typeNode: () => syntax, parent: () => undefined, getSourceFile: () => file,
        is: typeOnlyPredicates }, hasSemantics: () => false, sourceStorage: { subject(node, kind) {
        assert.equal(node === owner && kind === "input", true, "signature entry is not a mutable binding or physical member");
        return { kind: "resolved", subject: input };
      } } },
      resolveFormedSourceTypeComponentEvidence(componentSource) {
        const { component, queries, inputState: selected } = componentSource;
        assert.equal(component.declaration === owner && component.selectedType === type && component.authoredTypeNode === syntax, true);
        assert.equal(queries.sourceFile === file, true);
        assert.equal(selected.sourceStorageSubject === (use === "callable" ? input : imported), true, use);
        return carrier;
      },
    }, { declaration: owner, type, parameterKind: "required", omissionKind: "none" }, { sourceFile: file }, state, use);
    assert.equal(resolved === carrier, true, use);
  }
});

test("recognized Error profiles retain exact native identity without a storage-history owner", () => {
  const scope = { host: { providers: createSourceErrorProviderFixture() } };
  const identity = { kind: "error", sourceName: "Error", errorName: "Error", baseException: true };
  assert.equal(resolveSourceProfileType(scope, identity, [])?.id, "System.Exception");
  for (const kind of ["missing", "rejected"]) {
    scope.host.providers = { publishNativeIdentities: () => ({ kind }) };
    assert.equal(resolveSourceProfileType(scope, identity, []) === undefined, true,
      "missing or rejected native publication cannot manufacture an Error carrier");
  }
});

test("callable results establish their own storage owner rather than retaining the enclosing delegate owner", () => {
  const owner = {};
  const resultSubject = subject(owner, "return");
  const file = {};
  const bindings = new Map();
  const enclosing = subject({}, "input", [{ kind: "array-element" }]);
  const state = { depth: 2, sourceStorageSubject: enclosing,
    sourceBindings: bindings };
  const carrier = { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "System.String" };
  const callable = { parameters: [], result: { declaration: owner, selectedType: {} } };
  const resolved = resolveCallableEvidence({
    host: { ast: { typeParameters: node => { assert.equal(node === owner, true); return []; }, is: typeOnlyPredicates },
      projectTypeCatalog: { genericProjections: node => { assert.equal(node === owner, true); return []; } },
      sourceStorage: { subject(node, kind) { assert.equal(node === owner && kind === "return", true);
        return { kind: "resolved", subject: resultSubject }; } } },
    resolveFormedSignatureParameterEvidence() { assert.fail("the callable has no parameters"); },
    resolveFormedSourceTypeComponentEvidence(componentSource) {
      const { component, queries, inputState: selected } = componentSource;
      assert.equal(component === callable.result && queries.sourceFile === file, true);
      assert.equal(selected.sourceStorageSubject === resultSubject, true);
      assert.equal(selected.sourceBindings === bindings && selected.depth === state.depth, true);
      return carrier;
    },
  }, callable, { sourceFile: file }, state);
  assert.equal(resolved !== undefined, true);
  assert.equal(enclosing.projection.length, 1, "the enclosing owner's state is never mutated");
});

test("declaration-free transformations retain the current exact storage component", () => {
  const owner = subject({}, "member", [{ kind: "array-element" }, { kind: "tuple-element", index: 1 }]);
  const type = {};
  const file = {};
  const state = { depth: 2, sourceStorageSubject: owner };
  const carrier = { kind: "source-primitive", name: "uint64" };
  const result = resolveSourceTypeComponentEvidence({
    host: { ast: { is: typeOnlyPredicates } },
    resolvePointerReturn() { assert.fail("a declaration-free transformation has no new pointer return owner"); },
    resolveTypeWithState(selectedType, selectedFile, selected) {
      assert.equal(selectedType === type && selectedFile === file, true);
      assert.equal(selected.sourceStorageSubject === owner, true);
      assert.equal(selected.depth, 3);
      return carrier;
    },
  }, { selectedType: type }, { sourceFile: file }, state);
  assert.equal(result === carrier, true);
});

test("component context preserves each exact source role through only the owning subject interner", () => {
  for (const kind of ["input", "value", "member", "return", "receiver"]) {
    const owner = subject({}, kind, [{ kind: "array-element" }]);
    const component = { kind: "tuple-element", index: 1 };
    const projected = subject(owner.node, kind, [...owner.projection, component]);
    let calls = 0;
    const host = { sourceStorage: { subject(node, selectedKind, projection) {
      calls += 1;
      assert.equal(node === owner.node && selectedKind === owner.kind, true, kind);
      assert.deepEqual(projection, projected.projection);
      return { kind: "resolved", subject: projected };
    } } };
    const state = { depth: 2, sourceStorageSubject: owner };
    assert.equal(csharpSourceStorageComponentContext(host, state, component).sourceStorageSubject === projected, true, kind);
    assert.equal(state.sourceStorageSubject === owner && owner.projection.length === 1, true, kind);
    assert.equal(calls, 1, kind);
  }
});
