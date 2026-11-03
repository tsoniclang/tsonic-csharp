import assert from "node:assert/strict";
import test from "node:test";
import { formCsharpCallableDeclaration } from "../../../dist/analysis/source-evidence/types/resolution/callable-type-parameters.js";
import { formCsharpCallableSignatureSource } from "../../../dist/analysis/source-evidence/types/resolution/callable-signature-source.js";
import { resolveCallableEvidence, resolveFormedCsharpCallableType, resolveFormedCsharpCallableDeclarationSignature,
  resolveSourceTypeComponentEvidence } from "../../../dist/analysis/source-evidence/types/resolution/source-profiles.js";
import { formCsharpSourceTypeComponentSource,
  resolveFormedCsharpSourceTypeComponent } from "../../../dist/analysis/source-evidence/types/resolution/type-component-source.js";
import { csharpSourcePrimitiveTargetType, csharpVoidTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpRuntimeLocationTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { completeCsharpCallableSignatureSource, formCsharpCallableSignatureInput,
  formCsharpCallableTypeInput } from "../../../dist/analysis/source-evidence/types/resolution/callable-signature-completion.js";

const integer = csharpSourcePrimitiveTargetType("int32");
const sourceFile = Object.freeze({});
const queries = Object.freeze({ sourceFile });
const state = Object.freeze({ depth: 3, sourceBindings: new Map(), rejectNativeResolution: () => assert.fail("these synthetic leaves have no refusal") });
const ast = Object.freeze({ typeParameters: () => Object.freeze([]) });
const parameter = () => Object.freeze({ type: Object.freeze({}), parameterKind: "required", omissionKind: "required", acceptsOmission: false });
const callable = (parameters, declaration) => Object.freeze({ parameters: Object.freeze(parameters),
  result: Object.freeze({ selectedType: Object.freeze({}), ...(declaration === undefined ? {} : { declaration }) }) });
const signatureSource = input => formCsharpCallableSignatureSource(ast, input, queries,
  formCsharpCallableDeclaration(input.result.declaration, sourceFile, ast));

test("checked signature Source retains the original tuple-rest group and declaration input", () => {
  const symbol = Object.freeze({});
  const declaration = Object.freeze({});
  const syntax = Object.freeze({});
  const tupleType = Object.freeze({});
  const tupleElements = Object.freeze([Object.freeze({}), Object.freeze({})]);
  const selected = Object.freeze({ ...parameter(), sourceSymbol: symbol });
  const input = callable([selected, Object.freeze({ ...parameter(), sourceSymbol: symbol })]);
  const checked = Object.freeze({ sourceFile, declarations: { primarySymbolDeclaration: () => declaration },
    types: { authoredType: () => tupleType, isTuple: () => true, tupleElementInfos: () => tupleElements } });
  const sourceAst = { ...ast, is: { IsParameterDeclaration: () => true },
    as: { AsParameterDeclaration: () => ({ DotDotDotToken: Object.freeze({}) }) }, typeNode: () => syntax };
  const declared = formCsharpCallableDeclaration(undefined, sourceFile, sourceAst);
  const formed = formCsharpCallableSignatureSource(sourceAst, input, checked, declared);
  assert.equal(formed.callable === input && formed.queries === checked && formed.declaration === declared, true,
    "the exact synthetic Source packet is retained");
  assert.equal(formed.parameters.length, 1, "the original tuple parameter group is retained once");
  assert.equal(formed.parameters[0].selected === selected && formed.parameters[0].index === 0, true,
    "the actual first selected parameter and original index survive");
  assert.equal(formed.parameters[0].parameter.type === tupleType && formed.parameters[0].parameter.declaration === declaration &&
    formed.parameters[0].parameter.parameterKind === "rest" && formed.parameters[0].tupleElements === tupleElements, true,
    "the same checked rest input and tuple metadata are retained before Native children");
});

test("authored signature completion keeps the original children without reading A", () => {
  const input = callable([parameter()], Object.freeze({}));
  const source = signatureSource(input);
  const children = [];
  const completed = resolveFormedCsharpCallableDeclarationSignature({
    host: { sourceStorage: { subject: () => ({ kind: "unresolved" }) },
      projectTypeCatalog: { genericProjections: () => assert.fail("the signature intermediate cannot read A") } },
    resolveSignatureParameterEvidence(value, actualQueries, actualState) {
      children.push("parameter");
      assert.equal(value === source.parameters[0].parameter && actualQueries === queries && actualState === state, true,
        "the original parameter occurrence and state reach the sole child");
      return integer;
    },
    resolveSourceTypeComponentEvidence(value, actualQueries, actualState) {
      children.push("return");
      assert.equal(value === input.result && actualQueries === queries && actualState.sourceBindings === state.sourceBindings, true,
        "the original result and bindings reach the return child");
      return csharpVoidTargetType();
    },
    resolveNodeWithState: () => assert.fail("this explicitly monomorphic declaration has no constraint child"),
  }, source, state);
  assert.deepEqual(children, ["parameter", "return"]);
  assert.equal(completed?.source === source && completed.state === state && completed.declaration.source === source.declaration, true,
    "the intermediate retains the actual Source and authored declaration receipt");
});

test("an unavailable signature child stops later Native children without compacting Source rows", () => {
  const source = signatureSource(callable([parameter(), parameter()]));
  let visited = 0;
  const completed = resolveFormedCsharpCallableDeclarationSignature({ host: { sourceStorage: { subject: () => ({ kind: "unresolved" }) } },
    resolveSignatureParameterEvidence: () => { visited += 1; return undefined; },
    resolveSourceTypeComponentEvidence: () => assert.fail("the original unavailable parameter stops the return child"),
    resolveNodeWithState: () => assert.fail("the original unavailable parameter stops constraints"),
  }, source, state);
  assert.equal(source.parameters.length, 2, "the actual Source vector is not compacted");
  assert.equal(completed === undefined && visited === 1, true, "only the original first Native child is visited");
});

test("the normal callable wrapper appends the current A only after the same signature children", () => {
  const declaration = Object.freeze({});
  const input = callable([parameter()], declaration);
  const children = [];
  const completed = resolveCallableEvidence({ host: { ast, sourceStorage: { subject: () => ({ kind: "unresolved" }) },
    projectTypeCatalog: { genericProjections(actual) {
      children.push("A");
      assert.equal(actual === declaration, true, "the real selected declaration owns the projection input");
      return Object.freeze([]);
    } }, objectShapes: { resolveCallableValue: () => assert.fail("the explicit empty synthetic ABI has no generic protocol") } },
    resolveSignatureParameterEvidence: () => { children.push("parameter"); return integer; },
    resolveSourceTypeComponentEvidence: () => { children.push("return"); return csharpVoidTargetType(); },
    resolveNodeWithState: () => assert.fail("the explicit monomorphic Source has no constraints"),
  }, input, queries, state);
  assert.deepEqual(children, ["parameter", "return", "A"]);
  assert.equal(completed?.kind === "target-named", true, "the unchanged native delegate constructor supplies the result");
});

function componentInput() {
  const declaration = Object.freeze({});
  const subject = Object.freeze({ node: declaration, kind: "return", projection: Object.freeze([]) });
  const component = Object.freeze({ selectedType: Object.freeze({}), declaration });
  const host = { ast: { is: { IsTypeAliasDeclaration: () => false, IsInterfaceDeclaration: () => false,
    IsTypeParameterDeclaration: () => false } }, sourceStorage: { storageSubjectFor: () => ({ kind: "resolved", subject }) } };
  return { declaration, subject, component, host };
}

test("formed checked components retain the exact state and have no direct pointer-body probe", () => {
  const input = componentInput();
  const source = formCsharpSourceTypeComponentSource({ host: input.host }, input.component, queries, state);
  const completed = resolveFormedCsharpSourceTypeComponent({
    resolvePointerReturn: () => assert.fail("the formed checked entry does not probe the body"),
    resolveTypeWithState(type, file, actualState) {
      assert.equal(type === input.component.selectedType && file === sourceFile && actualState === source.childState, true,
        "the actual checked type, file and retained child state reach the sole Native child");
      return integer;
    },
  }, source);
  assert.equal(source.inputState === state && source.state.sourceStorageSubject === input.subject &&
    source.childState.depth === state.depth + 1 && source.childState.sourceBindings === state.sourceBindings, true,
    "the real input and normalized Source subject bind without fabricated state");
  assert.equal(completed === integer, true, "the exact checked child result is returned");
});

test("the normal component wrapper keeps pointer-first Native order before its checked child", () => {
  const input = componentInput();
  const children = [];
  const completed = resolveSourceTypeComponentEvidence({ host: input.host,
    resolvePointerReturn(declaration, actualState) {
      children.push("pointer");
      assert.equal(declaration === input.declaration && actualState.sourceStorageSubject === input.subject, true,
        "the original pointer probe receives the actual declaration and normalized state");
      return undefined;
    }, resolveTypeWithState: () => { children.push("checked"); return integer; },
  }, input.component, queries, state);
  assert.deepEqual(children, ["pointer", "checked"]);
  assert.equal(completed === integer, true, "the same checked child wins only after the original missing pointer result");
});

test("a selected pointer result still prevents the later checked Native child", () => {
  const input = componentInput();
  const pointer = csharpRuntimeLocationTargetType(integer);
  const completed = resolveSourceTypeComponentEvidence({ host: input.host,
    resolvePointerReturn: () => ({ type: pointer, undefinedReturn: false, fallthroughUndefined: false }),
    resolveTypeWithState: () => assert.fail("the selected pointer stops the later checked Native child"),
  }, input.component, queries, state);
  assert.equal(completed === pointer, true, "the exact original pointer result is retained");
});

test("a foreign checked child state is rejected before its Native child", () => {
  const input = componentInput();
  const source = formCsharpSourceTypeComponentSource({ host: input.host }, input.component, queries, state);
  const foreign = { ...source, checked: { ...source.checked, request: { ...source.checked.request, state: { ...source.childState } } } };
  assert.throws(() => resolveFormedCsharpSourceTypeComponent({
    resolveTypeWithState: () => assert.fail("a foreign state cannot enter Native completion"),
  }, foreign), /exact retained semantic child/u);
});

test("the sole signature generator retains its exact ordered child receipts without an A capability", () => {
  const source = signatureSource(callable([parameter()]));
  const input = formCsharpCallableSignatureInput({ sourceStorage: {} }, source, state);
  const completion = completeCsharpCallableSignatureSource(input);
  const first = completion.next();
  assert.equal(first.done === false && first.value.kind === "parameter" && first.value.input === input &&
    first.value.parameter === source.parameters[0], true, "the actual Source row is visible before its Native child");
  const parameterReply = { kind: "parameter", request: first.value, type: integer };
  const second = completion.next(parameterReply);
  assert.equal(second.done === false && second.value.kind === "result" && second.value.input === input, true,
    "the return follows the original parameter child");
  const resultReply = { kind: "result", request: second.value, type: csharpVoidTargetType() };
  const last = completion.next(resultReply);
  assert.equal(last.done === true && last.value.input === input && last.value.source === source && last.value.state === state, true,
    "the actual bound Source occurrence owns the completed signature");
  assert.equal(last.value.parameters[0] === parameterReply && last.value.result === resultReply && last.value.constraints.length === 0, true,
    "the exact returned child receipts survive the one signature algorithm");
});

test("signature dependencies reject foreign replies before visiting the next child", () => {
  const source = signatureSource(callable([parameter()]));
  const input = formCsharpCallableSignatureInput({ sourceStorage: {} }, source, state);
  const foreign = completeCsharpCallableSignatureSource(input);
  const first = foreign.next();
  assert.throws(() => foreign.next({ kind: "parameter", request: { ...first.value }, type: integer }),
    /exact ordered parameter dependency/u);
  const wrongKind = completeCsharpCallableSignatureSource(input);
  const next = wrongKind.next();
  assert.throws(() => wrongKind.next({ kind: "result", request: next.value, type: integer }),
    /exact ordered parameter dependency/u);
});

test("a bound callable retains the return storage input and refuses a foreign state before Native completion", () => {
  const declaration = Object.freeze({});
  const subject = Object.freeze({ node: declaration, kind: "return", projection: Object.freeze([]) });
  const source = signatureSource(callable([], declaration));
  let reads = 0;
  const raw = Object.freeze({ kind: "callable", type: Object.freeze({}), queries, signature: source });
  const input = formCsharpCallableTypeInput({ sourceStorage: { subject(actual, kind) {
    reads += 1;
    assert.equal(actual === declaration && kind === "return", true, "the original selected return declaration owns its H0 input");
    return { kind: "resolved", subject };
  } } }, raw, state);
  assert.equal(reads === 1 && input.source === raw && input.state === state && input.signature.source === source, true,
    "the real Source wrapper binds its original state once");
  assert.equal(input.signature.returnState.sourceStorageSubject === subject &&
    input.signature.returnState.sourceBindings === state.sourceBindings && input.signature.returnState.depth === state.depth, true,
    "the selected return subject changes no binding or depth");
  assert.throws(() => resolveFormedCsharpCallableType({}, { ...input, signature: { ...input.signature, state: { ...state } } }),
    /exact bound signature Source input/u);
});
