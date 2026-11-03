import assert from "node:assert/strict";
import test from "node:test";
import { functionPointerFactKey } from "@tsonic/tsts";
import { formCsharpDirectSourceCapture, bindCsharpDirectSourceCapture,
  resolveFormedCsharpDirectSourceFacts } from "../../../dist/analysis/source-evidence/types/resolution/direct-source-evidence.js";
import { formCsharpEvidenceNodesCapture, bindCsharpEvidenceNodesCapture,
  resolveFormedCsharpEvidenceNodesToCommonTarget } from "../../../dist/analysis/source-evidence/types/resolution/evidence-node-source.js";
import { formCsharpConditionalApplicationSource, completeCsharpConditionalApplicationSource,
  resolveFormedCsharpConditionalApplication } from "../../../dist/analysis/source-evidence/types/resolution/conditional-application-source.js";
import { formCsharpSemanticConditionalSource, resolveFormedCsharpSemanticConditionalType } from "../../../dist/analysis/source-evidence/types/resolution/semantic-conditional-source.js";
import { csharpSourcePrimitiveTargetType, csharpVoidTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";

function conditionalUnit() {
  const type = {};
  const sourceFile = {};
  const declaration = {};
  const conditional = {};
  const authoredRoot = {};
  const selectedNode = {};
  const argument = { declaration: {}, parameter: {}, argument: {} };
  const inferred = { declarations: [{}], parameter: {}, argument: {} };
  const selectedArgument = { declarations: [{}], parameter: {}, argument: {}, applicationParameter: argument.parameter };
  const step = { conditional, branch: "true", selectedNode, selectedType: {}, bindings: [inferred, selectedArgument] };
  const application = { kind: "conditional", declaration, typeNode: conditional, bindings: [argument], result: {}, conditionalSteps: [step] };
  const observations = [];
  const queries = { sourceFile, facts: {
    typeSubjects(sourceType) {
      assert.equal(sourceType === inferred.argument, true);
      observations.push("subjects");
      return [];
    },
    authoredTypeNodes(root) {
      assert.equal(root === authoredRoot || root === conditional, true);
      observations.push("evidence");
      return [];
    },
  }, types: {
    isNumberLike: sourceType => { assert.equal(sourceType === inferred.argument, true); observations.push("number"); return false; },
    isBigIntLike: sourceType => { assert.equal(sourceType === inferred.argument, true); observations.push("bigint"); return false; },
  } };
  const host = { ast: {
    getSourceFile: () => sourceFile,
    parent: node => node === conditional ? declaration : undefined,
    typeNode: node => node === declaration ? conditional : undefined,
    is: { IsConditionalTypeNode: node => node === conditional, IsParenthesizedTypeNode: () => false,
      IsTypeAliasDeclaration: node => node === declaration },
  }, navigation: { isProjectDeclaration: node => node === declaration } };
  const state = { depth: 3, sourceStorageSubject: {}, sourceStorageBindings: {},
    rejectNativeResolution: () => assert.fail("synthetic child leaves have no Native rejection") };
  return { type, sourceFile, declaration, conditional, authoredRoot, selectedNode, argument, inferred,
    selectedArgument, step, application, observations, queries, host, state };
}

function capture(unit) {
  return formCsharpConditionalApplicationSource({ host: unit.host }, unit.application, unit.queries,
    unit.state.sourceStorageSubject, unit.authoredRoot);
}

function forbidSource(unit) {
  unit.host.ast = undefined;
  unit.host.navigation = undefined;
  for (const methods of [unit.queries.facts, unit.queries.types]) {
    for (const key of Object.keys(methods)) methods[key] = () => assert.fail("formed conditional completion cannot query Source again");
  }
}

test("synthetic direct-fact capture binds actual states and keeps ALL function-pointer children after an unavailable parameter", () => {
  const subject = {};
  const sourceFile = {};
  const parameters = [{}, {}];
  const resultNode = {};
  let captures = 0;
  const host = { ast: {}, sourceFacts: { getFact(node, key) {
    if (node !== subject || key !== functionPointerFactKey) return undefined;
    captures += 1;
    return { parameters, result: resultNode, abi: [] };
  } } };
  const source = formCsharpDirectSourceCapture({ host }, [subject], sourceFile);
  assert.equal(source.candidates[0].kind === "function-pointer" && !Object.hasOwn(source, "state") && captures === 1, true);
  host.sourceFacts.getFact = () => assert.fail("binding a retained direct capture has no Source capability");
  host.ast = undefined;
  const integer = csharpSourcePrimitiveTargetType("int32");
  const voidType = csharpVoidTargetType();
  for (const depth of [2, 6]) {
    const state = { depth, sourceBindings: new Map(), sourceStorageBindings: {}, sourceStorageSubject: {},
      rejectNativeResolution: () => assert.fail("explicit synthetic Native leaves have no rejection") };
    const input = bindCsharpDirectSourceCapture(source, state);
    assert.equal(input.capture === source && input.state === state && input.subjects === source.subjects, true);
    assert.equal(input.candidates[0].parameters.every((child, index) => child.source === source.candidates[0].parameters[index] &&
      child.state.depth === depth + 1 && child.state.sourceBindings === state.sourceBindings &&
      child.state.sourceStorageBindings === state.sourceStorageBindings && child.state.sourceStorageSubject === state.sourceStorageSubject &&
      child.state.rejectNativeResolution === state.rejectNativeResolution), true);
    const order = [];
    const completed = resolveFormedCsharpDirectSourceFacts({ resolveNodeWithState(node, file, childState) {
      assert.equal(file === sourceFile && childState.depth === depth + 1 && childState.sourceBindings === state.sourceBindings, true);
      const index = node === resultNode ? 2 : parameters.indexOf(node);
      assert.equal(index >= 0, true);
      order.push(index);
      return index === 2 ? voidType : depth === 2 && index === 0 ? undefined : integer;
    } }, input);
    assert.deepEqual(order, [0, 1, 2]);
    assert.equal(depth === 2 ? completed === undefined : completed?.kind === "function-pointer" &&
      completed.args[0] === integer && completed.args[1] === integer && completed.result === voidType, true);
  }
  const candidates = [...source.candidates];
  delete candidates[0];
  assert.throws(() => bindCsharpDirectSourceCapture({ ...source, candidates }, { depth: 0 }), /every ordered captured candidate/u);
  assert.equal(captures === 1, true);
});

test("synthetic evidence-node capture deduplicates once and purely binds the same authored rows to each actual state", () => {
  const nodes = [{}, {}];
  const selectedType = {};
  const sourceFile = {};
  const subject = { node: {}, kind: "storage", projection: [] };
  let captures = 0;
  const host = { ast: { getSourceFile: () => sourceFile, is: { IsTypeAliasDeclaration: () => false,
    IsInterfaceDeclaration: () => false, IsTypeParameterDeclaration: () => false } },
    hasSemantics: file => { assert.equal(file === sourceFile, true); captures += 1; return false; } };
  const queries = { sourceFile };
  const inputNodes = [nodes[0], nodes[0], nodes[1]];
  const source = formCsharpEvidenceNodesCapture({ host }, inputNodes, selectedType, queries, subject);
  assert.equal(source.inputNodes === inputNodes && source.nodes.length === 2 && captures === 2 && !Object.hasOwn(source, "state"), true);
  host.ast = undefined;
  host.hasSemantics = () => assert.fail("pure evidence binding cannot collect authored Source again");
  const integer = csharpSourcePrimitiveTargetType("int32");
  for (const depth of [2, 7]) {
    const state = { depth, sourceStorageSubject: subject, sourceBindings: new Map(), sourceStorageBindings: {},
      rejectNativeResolution: () => assert.fail("synthetic evidence leaves have no rejection") };
    const input = bindCsharpEvidenceNodesCapture(source, state);
    assert.equal(input.capture === source && input.state === state && input.requests.every((request, index) =>
      request.capture === source.requests[index] && request.source.source === source.requests[index].source &&
      request.source.inputState === request.state && request.state.depth === depth + 1), true);
    let children = 0;
    const completed = resolveFormedCsharpEvidenceNodesToCommonTarget({ resolveTypeWithState(type, file, childState) {
      assert.equal(type === selectedType && file === sourceFile && childState.depth === depth + 2 &&
        childState.sourceBindings === state.sourceBindings && childState.sourceStorageSubject === subject &&
        childState.sourceStorageBindings === state.sourceStorageBindings &&
        childState.rejectNativeResolution === state.rejectNativeResolution, true);
      children += 1;
      return depth === 2 && children === 1 ? undefined : integer;
    } }, input);
    assert.equal(children === 2 && (depth === 2 ? completed === undefined : completed === integer), true);
  }
  const requests = [...source.requests];
  delete requests[1];
  assert.throws(() => bindCsharpEvidenceNodesCapture({ ...source, requests }, { depth: 0, sourceStorageSubject: subject }), /exact captured Source/u);
  assert.throws(() => bindCsharpEvidenceNodesCapture(source, { depth: 0, sourceStorageSubject: { ...subject } }), /exact captured Source/u);
  assert.equal(captures === 2, true);
});

test("synthetic conditional keeps actual inferred and selected-argument Source ahead of its original Native child order", () => {
  const unit = conditionalUnit();
  const source = capture(unit);
  assert.equal(source.application === unit.application && source.bindings[0] === unit.argument && source.authoredRoot === unit.authoredRoot &&
    source.steps[0].bindings[0].binding === unit.inferred && source.steps[0].bindings[1].argument === unit.argument &&
    !Object.hasOwn(source.steps[0].bindings[0].direct, "state") && !Object.hasOwn(source.steps[0].bindings[0].evidence, "state"), true);
  assert.deepEqual(unit.observations, ["subjects", "evidence", "number", "bigint"]);
  forbidSource(unit);
  const actualArgument = csharpSourcePrimitiveTargetType("int64");
  const inferred = csharpSourcePrimitiveTargetType("int32");
  const order = [];
  const result = resolveFormedCsharpConditionalApplication({ host: unit.host,
    resolveTypeWithState(type, file, state) {
      assert.equal(type === unit.inferred.argument && file === unit.sourceFile && state.depth === unit.state.depth + 1 &&
        state.sourceBindings.get(unit.argument.declaration).targetType === actualArgument &&
        state.sourceStorageSubject === unit.state.sourceStorageSubject && state.rejectNativeResolution === unit.state.rejectNativeResolution, true);
      order.push("inferred");
      return inferred;
    },
    resolveNodeWithState(node, file, state) {
      assert.equal(node === unit.selectedNode && file === unit.sourceFile && state.depth === unit.state.depth + 1 &&
        state.sourceBindings.get(unit.inferred.declarations[0]).sourceType === unit.inferred.argument &&
        state.sourceBindings.get(unit.inferred.declarations[0]).targetType === inferred &&
        state.sourceBindings.get(unit.selectedArgument.declarations[0]).sourceType === unit.argument.argument &&
        state.sourceBindings.get(unit.selectedArgument.declarations[0]).targetType === actualArgument &&
        state.sourceStorageBindings === unit.state.sourceStorageBindings, true);
      order.push("branch");
      return inferred;
    },
  }, source, [actualArgument], unit.state);
  assert.equal(result === inferred && unit.state.sourceBindings === undefined, true);
  assert.deepEqual(order, ["inferred", "branch"]);
  assert.deepEqual(unit.observations, ["subjects", "evidence", "number", "bigint"]);
});

test("synthetic conditional chosen-child replies keep the numeric stop and reject sparse, foreign or retired Source before children", () => {
  const unit = conditionalUnit();
  unit.queries.types.isNumberLike = () => true;
  const source = capture(unit);
  const arguments_ = [csharpSourcePrimitiveTargetType("int64")];
  const completion = completeCsharpConditionalApplicationSource(source, arguments_, unit.state);
  const direct = completion.next();
  assert.equal(direct.done === false && direct.value.kind === "direct" &&
    direct.value.source.capture === source.steps[0].bindings[0].direct, true);
  const evidence = completion.next({ kind: "direct", request: direct.value, type: undefined });
  assert.equal(evidence.done === false && evidence.value.kind === "evidence" &&
    evidence.value.source.capture === source.steps[0].bindings[0].evidence, true);
  const last = completion.next({ kind: "evidence", request: evidence.value, type: undefined });
  assert.equal(last.done === true && last.value === undefined, true, "an inferred numeric absence never falls back to a checked Type child");
  const foreignReply = completeCsharpConditionalApplicationSource(source, arguments_, unit.state);
  const chosen = foreignReply.next();
  assert.throws(() => foreignReply.next({ kind: "direct", request: { ...chosen.value }, type: undefined }), /exact chosen native dependency/u);
  const wrongKind = completeCsharpConditionalApplicationSource(source, arguments_, unit.state);
  const request = wrongKind.next();
  assert.throws(() => wrongKind.next({ kind: "type", request: request.value, type: undefined }), /exact chosen native dependency/u);
  const sparse = [...source.steps];
  delete sparse[0];
  assert.throws(() => completeCsharpConditionalApplicationSource({ ...source, steps: sparse }, arguments_, unit.state).next(), /every exact retained Source step/u);
  assert.throws(() => completeCsharpConditionalApplicationSource({ ...source,
    steps: [{ ...source.steps[0], bindings: [source.steps[0].bindings[1], source.steps[0].bindings[0]] }] }, arguments_, unit.state).next(),
    /every exact retained Source step/u);
  assert.throws(() => completeCsharpConditionalApplicationSource({ queries: unit.queries }, arguments_, unit.state).next(), /exact retained Source application/u);
  assert.throws(() => completeCsharpConditionalApplicationSource(source, arguments_,
    { ...unit.state, sourceStorageSubject: {} }).next(), /exact retained Source application/u);
});

test("synthetic conditional keeps per-step fresh inference bindings, conditional continuation and original branch equality stops", () => {
  const unit = conditionalUnit();
  unit.application.conditionalSteps = [{ ...unit.step, selectedNode: unit.conditional }, { ...unit.step, bindings: [] }];
  const source = capture(unit);
  forbidSource(unit);
  const integer = csharpSourcePrimitiveTargetType("int32");
  let types = 0;
  let nodes = 0;
  const completed = resolveFormedCsharpConditionalApplication({ host: unit.host,
    resolveTypeWithState: () => { types += 1; return integer; },
    resolveNodeWithState(node, file, state) {
      assert.equal(node === unit.selectedNode && file === unit.sourceFile && !state.sourceBindings.has(unit.inferred.declarations[0]) &&
        state.sourceBindings.get(unit.argument.declaration).targetType === integer, true);
      nodes += 1;
      return integer;
    },
  }, source, [integer], unit.state);
  assert.equal(completed === integer && types === 1 && nodes === 1, true);
  const branches = conditionalUnit();
  const second = {};
  branches.application.conditionalSteps = [{ ...branches.step, bindings: [] }, { ...branches.step, selectedNode: second, bindings: [] }];
  const branchSource = capture(branches);
  forbidSource(branches);
  for (const mode of ["equal", "conflict", "missing"]) {
    const order = [];
    const result = resolveFormedCsharpConditionalApplication({ resolveNodeWithState(node) {
      order.push(node === branches.selectedNode ? "first" : "second");
      return mode === "missing" ? undefined : mode === "conflict" && node === second ? csharpSourcePrimitiveTargetType("int64") : integer;
    } }, branchSource, [integer], branches.state);
    assert.deepEqual(order, mode === "missing" ? ["first"] : ["first", "second"]);
    assert.equal(mode === "equal" ? result === integer : result === undefined, true);
  }
});

test("synthetic deferred conditional retains exact declaration metadata before the unchanged Native projection constructor", () => {
  const unit = conditionalUnit();
  unit.application.conditionalSteps = [{ conditional: unit.conditional, branch: "deferred", bindings: [] }];
  unit.host.ast.typeParameters = () => [{}];
  unit.host.ast.getPath = () => "/synthetic.ts";
  unit.host.ast.kind = () => 12;
  unit.host.ast.pos = () => 1;
  unit.host.ast.end = () => 9;
  unit.host.ast.name = () => ({});
  unit.host.ast.text = () => "Choice";
  const source = capture(unit);
  assert.equal(source.steps[0].kind === "deferred" && source.steps[0].projection.declaration === unit.declaration &&
    source.steps[0].projection.sourceArguments[0] === unit.argument.argument && !Object.hasOwn(source.steps[0].projection, "arguments"), true);
  forbidSource(unit);
  const integer = csharpSourcePrimitiveTargetType("int32");
  const noChildren = { resolveTypeWithState: () => assert.fail("a deferred projection has no ordinary Type child"),
    resolveNodeWithState: () => assert.fail("a deferred projection has no selected Node child") };
  const projected = resolveFormedCsharpConditionalApplication(noChildren, source, [integer], unit.state);
  assert.equal(projected?.kind === "type-parameter" && projected.csharpProjection.declaration === unit.declaration &&
    projected.csharpProjection.identity === "/synthetic.ts\u000012\u00001\u00009" &&
    projected.csharpProjection.sourceArguments[0] === unit.argument.argument && projected.csharpProjection.arguments[0] === integer, true);
  assert.equal(resolveFormedCsharpConditionalApplication(noChildren, source, [], unit.state) === undefined, true);
});

test("synthetic semantic entry retains its conditional child Source before any Native argument and uses that same plan", () => {
  const unit = conditionalUnit();
  const source = formCsharpSemanticConditionalSource({ host: unit.host }, unit.type, unit.queries, unit.state, unit.application);
  assert.equal(source.kind === "application" && source.completion.application === unit.application &&
    source.completion.authoredRoot === unit.conditional && source.completion.steps[0].bindings[0].binding === unit.inferred, true);
  assert.deepEqual(unit.observations, ["subjects", "evidence", "number", "bigint"]);
  forbidSource(unit);
  const integer = csharpSourcePrimitiveTargetType("int32");
  const order = [];
  const result = resolveFormedCsharpSemanticConditionalType({ host: unit.host,
    resolveTypeWithState(type) {
      assert.equal(type === unit.argument.argument || type === unit.inferred.argument, true);
      order.push(type === unit.argument.argument ? "argument" : "inferred");
      return integer;
    },
    resolveNodeWithState(node) { assert.equal(node === unit.selectedNode, true); order.push("branch"); return integer; },
  }, source);
  assert.equal(result.type === integer && source.completion.application === unit.application, true);
  assert.deepEqual(order, ["argument", "inferred", "branch"]);
});
