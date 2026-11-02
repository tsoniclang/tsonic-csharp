import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles } from "@tsonic/tsts";
import { createTargetSourceProgram, sourceCallableValueParameters } from "@tsonic/target-api/source";
import { createSourceStorageQuery } from "@tsonic/target-api/analysis";
import { resolveCallableEvidence, resolveSignatureParameterEvidence, resolveSourceProfileType, resolveSourceTypeComponentEvidence } from "../../../dist/analysis/source-evidence/types/resolution/source-profiles.js";
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
    host: { ast: source.ast, sourceStorage: storage, objectShapes: {
      resolveNativeParameter(owner, parameter, type) {
        assert.equal(owner === implementation && parameter === incoming && targetTypeRefEquals(type, native), true,
          "physical input selection consumes the same complete contextual tuple");
        physicalSelections += 1;
        return { kind: "resolved", type };
      },
    } },
    sourceValueDeclarationSyntax: node => ({ type: source.ast.typeNode(node),
      initializer: source.ast.as.AsParameterDeclaration(node).Initializer }),
    resolveSourceTypeComponentEvidence(component) {
      if (component.declaration === implementation || component.authoredTypeNode !== undefined &&
        source.ast.kindName(component.authoredTypeNode) === "KindBooleanKeyword") return { kind: "source-primitive", name: "bool" };
      assert.equal(component.declaration !== incoming && component.authoredTypeNode !== undefined &&
        source.ast.is.IsTupleTypeNode(component.authoredTypeNode), true,
        "only the original contextual formal owns native tuple metadata, not the erased implementation tuple");
      formalSelections += 1;
      return native;
    },
  };
  scope.host.representations = { genericProjections: () => [] };
  scope.resolveSignatureParameterEvidence = (...arguments_) => resolveSignatureParameterEvidence(scope, ...arguments_);
  scope.resolveCallableEvidence = (...arguments_) => resolveCallableEvidence(scope, ...arguments_);
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
    const result = resolveSourceTypeComponentEvidence({
      host: { ast: { getSourceFile: () => file, is: typeOnlyPredicates }, hasSemantics: selected => selected === file },
      resolvePointerReturn(declaration, selected) {
        assert.equal(declaration === owner, true, mode);
        assertOwner(selected);
        assert.equal(selected.depth, 4, mode);
        return undefined;
      },
      resolveAuthoredAndSelectedSourceType(authored, authoredFile, selectedType, selectedFile, selected) {
        selections += 1;
        assert.equal(authored === syntax && authoredFile === file, true, mode);
        assert.equal(selectedType === type && selectedFile === file, true, mode);
        assertOwner(selected);
        assert.equal(selected.depth, 5, mode);
        return expected;
      },
    }, { declaration: owner, authoredTypeNode: syntax, selectedType: type }, { sourceFile: file }, state);
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
      host: { ast: { typeNode: () => syntax, parent: () => undefined }, sourceStorage: { subject(node, kind) {
        assert.equal(node === owner && kind === "input", true, "signature entry is not a mutable binding or physical member");
        return { kind: "resolved", subject: input };
      } } },
      resolveSourceTypeComponentEvidence(component, queries, selected) {
        assert.equal(component.declaration === owner && component.selectedType === type && component.authoredTypeNode === syntax, true);
        assert.equal(queries.sourceFile === file, true);
        assert.equal(selected.sourceStorageSubject === (use === "callable" ? input : imported), true, use);
        return carrier;
      },
    }, { declaration: owner, type, parameterKind: "required", omissionKind: "none" }, { sourceFile: file }, state, use);
    assert.equal(resolved === carrier, true, use);
  }
});

test("recognized Error profiles retain exact native identity without consulting checked storage", () => {
  const file = {};
  const owner = subject({}, "input");
  let queries = 0;
  const scope = { host: { providers: createSourceErrorProviderFixture(), ast: { getSourceFile(node) { assert.equal(node === owner.node, true); return file; }, parent: () => undefined,
    is: { IsExpressionWithTypeArguments: () => false } }, hasSemantics: () => true,
    errorStorageDemands: { storageFor(selected) { queries += 1; assert.equal(selected === owner, true);
      return { kind: "unresolved", reason: "exact storage unavailable" }; } } } };
  const identity = { kind: "error", sourceName: "Error", errorName: "Error", baseException: true };
  assert.equal(resolveSourceProfileType(scope, identity, [])?.id, "System.Exception");
  assert.equal(queries, 0, "source history cannot select the native Error representation");
  scope.host.hasSemantics = () => false;
  assert.equal(resolveSourceProfileType(scope, identity, [])?.id, "System.Exception");
  assert.equal(queries, 0, "provider signature evidence is not a checked runtime storage subject");
  for (const kind of ["missing", "rejected"]) {
    scope.host.providers = { publishNativeIdentities: () => ({ kind }) };
    assert.equal(resolveSourceProfileType(scope, identity, []) === undefined, true,
      "missing or rejected physical native identity never manufactures an Error carrier");
  }
  assert.equal(queries, 0, "native refusal still does not query storage origins");
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
      representations: { genericProjections: node => { assert.equal(node === owner, true); return []; } },
      sourceStorage: { subject(node, kind) { assert.equal(node === owner && kind === "return", true);
        return { kind: "resolved", subject: resultSubject }; } } },
    resolveSignatureParameterEvidence() { assert.fail("the callable has no parameters"); },
    resolveSourceTypeComponentEvidence(component, queries, selected) {
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
    host: { ast: { is: typeOnlyPredicates }, hasSemantics: selected => selected === file },
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

test("authored component provenance preserves the original selected instantiation and its real contexts", () => {
  for (const declared of [false, true]) {
    const authored = {};
    const defining = {};
    const importer = {};
    const type = { instantiated: true };
    const declaration = {};
    const bindings = new Map();
    const state = { depth: 3, sourceBindings: bindings };
    const carrier = { kind: "target-named", id: "native.exact-instantiation", typeArguments: [] };
    let reads = 0;
    const result = resolveSourceTypeComponentEvidence({
      host: { ast: { getSourceFile: node => node === authored ? defining : undefined, is: typeOnlyPredicates },
        hasSemantics: file => file === defining || file === importer },
      resolvePointerReturn: () => undefined,
      resolveAuthoredAndSelectedSourceType(node, file, selected, selectedFile, selectedState) {
        reads++;
        assert.equal(node === authored && file === defining && selected === type, true,
          "the original authored node and already instantiated selected Type are unchanged");
        assert.equal(selectedFile === (declared ? importer : defining), true,
          "signature-derived and declaration-free authored selections keep their distinct actual contexts");
        assert.equal(selectedState.sourceBindings === bindings, true, "generic bindings retain identity");
        return carrier;
      },
    }, { authoredTypeNode: authored, selectedType: type, ...(declared ? { declaration } : {}) },
    { sourceFile: importer }, state);
    assert.equal(result === carrier && reads === 1, true, "one canonical selected component is consumed");
  }
});

test("authored component provenance rejects missing and foreign owners without importer fallback", () => {
  for (const missing of [false, true]) {
    const authored = {};
    const foreign = {};
    const importer = {};
    const result = resolveSourceTypeComponentEvidence({
      host: { ast: { getSourceFile: () => missing ? undefined : foreign, is: typeOnlyPredicates },
        hasSemantics: file => file === importer },
      resolveAuthoredAndSelectedSourceType() { assert.fail("unproved authored ownership cannot reach selection"); },
    }, { authoredTypeNode: authored, selectedType: {} }, { sourceFile: importer }, { depth: 0 });
    assert.equal(result === undefined, true, "missing or foreign authored facts remain unresolved");
  }
});

test("checked declaration components retain selected context without requiring authored declaration-file semantics", () => {
  const authored = {};
  const defining = {};
  const selectedFile = {};
  const declaration = {};
  const selectedType = { instantiated: true };
  const bindings = new Map();
  const carrier = { kind: "source-primitive", name: "int32" };
  let reads = 0;
  const result = resolveSourceTypeComponentEvidence({
    host: { ast: { getSourceFile: node => node === authored ? defining : undefined, is: typeOnlyPredicates },
      hasSemantics: file => file === selectedFile },
    resolvePointerReturn: () => undefined,
    resolveAuthoredAndSelectedSourceType(node, authoredFile, type, context, state) {
      reads++;
      assert.equal(node === authored && authoredFile === defining, true, "the original declaration's authored location is retained");
      assert.equal(type === selectedType && context === selectedFile, true, "the checked selected Type and its supplied context are not replaced");
      assert.equal(state.sourceBindings === bindings, true, "actual generic bindings retain identity");
      return carrier;
    },
  }, { authoredTypeNode: authored, declaration, selectedType }, { sourceFile: selectedFile },
  { depth: 0, sourceBindings: bindings });
  assert.equal(result === carrier && reads === 1, true, "one existing canonical selected-value owner resolves the declaration");
});

test("inferred components without authored evidence retain the supplied selected Type and context", () => {
  const selectedType = { instantiated: true };
  const selectedFile = {};
  const bindings = new Map();
  const carrier = { kind: "source-primitive", name: "uint32" };
  let reads = 0;
  const result = resolveSourceTypeComponentEvidence({
    host: { ast: { is: typeOnlyPredicates }, hasSemantics: () => false },
    resolveTypeWithState(type, context, state) {
      reads++;
      assert.equal(type === selectedType && context === selectedFile, true, "no-authored evidence keeps its actual selected authority");
      assert.equal(state.sourceBindings === bindings, true, "original source bindings are unchanged");
      return carrier;
    },
  }, { selectedType }, { sourceFile: selectedFile }, { depth: 0, sourceBindings: bindings });
  assert.equal(result === carrier && reads === 1, true, "the existing selected-type resolver is used once");
});
