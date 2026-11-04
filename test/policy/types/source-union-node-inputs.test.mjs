import assert from "node:assert/strict";
import test from "node:test";
import { formCsharpUnionTypeNodeSource } from "../../../dist/analysis/source-evidence/types/resolution/union-node-source.js";
import { resolveFormedCsharpUnionTypeNode } from "../../../dist/analysis/source-evidence/types/resolution/nodes.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";

function fixture(kinds = ["member", "member"], typeKind = "ordinary", union = true) {
  const unit = { node: {}, file: {}, type: typeKind === "absent" ? undefined : { kind: typeKind }, observations: [], children: [],
    syntax: kinds.map(kind => kind === undefined ? undefined : {}), checked: kinds.map(kind => kind === undefined ? undefined : {}),
    carriers: [], index: 0, structural: { kind: "not-applicable" }, retained: undefined };
  unit.state = { depth: 5, sourceBindings: new Map(), sourceStorageBindings: {}, sourceStorageSubject: {},
    rejectNativeResolution: () => assert.fail("synthetic union leaves have no rejection") };
  unit.queries = { sourceFile: unit.file, types: {
    authoredType(node) {
      assert.equal(node !== unit.node && node !== undefined, true, "the caller already supplied the checked root row");
      const index = unit.syntax.indexOf(node);
      assert.equal(index >= 0, true);
      unit.observations.push(`checked:${index}`);
      return unit.checked[index];
    },
    isAny(type) { assert.equal(type === unit.type, true); unit.observations.push("any"); return type.kind === "any"; },
    isUnknown(type) { assert.equal(type === unit.type, true); unit.observations.push("unknown"); return type.kind === "unknown"; },
  } };
  unit.host = { ast: { is: { IsUnionTypeNode(node) {
    assert.equal(node === unit.node, true); unit.observations.push("union"); return union;
  } }, children(node) {
    assert.equal(node === unit.node, true); unit.observations.push("syntax"); return unit.syntax;
  } } };
  return unit;
}

function capture(unit) {
  unit.source = formCsharpUnionTypeNodeSource({ host: unit.host }, unit.node, unit.queries, unit.state, unit.type);
  return unit.source;
}

function forbidSource(unit) {
  unit.host.ast = undefined;
  unit.queries.types = undefined;
}

function nativeScope(unit) {
  return { host: { structuralTypes: {
    resolveUnion(type, file, state) {
      assert.equal(type === unit.type && file === unit.file && state === unit.state, true);
      unit.children.push("structural"); return unit.structural;
    },
    resolveTarget: () => undefined,
  } },
  resolveNodeWithState(node, file, state) {
    const index = unit.index++;
    const request = unit.source.members[index];
    assert.equal(node === request.node && node === unit.syntax[index] && file === unit.file && state === request.state, true);
    unit.children.push(`node:${index}`); return unit.carriers[index];
  },
  resolveTypeWithState(type, file, state) {
    assert.equal(type === unit.type && file === unit.file && state === unit.source.child.state, true);
    unit.children.push("type"); return unit.carriers[0];
  },
  sourceUnionDefinitions: { resolve(type, queries, state, complete) {
    assert.equal(type === unit.type && queries === unit.queries && state === unit.state, true);
    unit.children.push("definition"); return complete().carrier;
  } },
  sourceUnions: { retain(carrier, members, queries, state) {
    assert.equal(queries === unit.queries && state === unit.state, true);
    unit.children.push("retain"); unit.retained = { carrier, members }; return carrier;
  } } };
}

test("synthetic union Source keeps the already-checked root, ordered syntax and original child state", () => {
  const unit = fixture(["member", undefined, "member"]);
  const source = capture(unit);
  assert.equal(source.kind === "members" && source.type === unit.type && source.node === unit.node &&
    source.queries === unit.queries && source.state === unit.state && source.syntaxMembers === unit.syntax, true);
  assert.equal(source.checkedMembers.length === 3 && source.members.length === 3, true);
  for (const member of source.members) {
    assert.equal(member.node === unit.syntax[member.index] && member.type === unit.checked[member.index] &&
      member.type === source.checkedMembers[member.index] && member.sourceFile === unit.file, true);
    assert.equal(member.state.depth === unit.state.depth + 1 && member.state.sourceBindings === unit.state.sourceBindings &&
      member.state.sourceStorageBindings === unit.state.sourceStorageBindings && member.state.sourceStorageSubject === unit.state.sourceStorageSubject &&
      member.state.rejectNativeResolution === unit.state.rejectNativeResolution, true);
  }
  assert.deepEqual(unit.observations, ["union", "any", "unknown", "syntax", "checked:0", "checked:2"]);
  assert.deepEqual(unit.children, []);
  const absent = fixture([], "absent", false);
  const ignored = capture(absent);
  assert.equal(ignored.kind === "not-union", true);
  assert.deepEqual(absent.observations, ["union"]);
  assert.equal(resolveFormedCsharpUnionTypeNode({}, ignored) === undefined, true);
});

test("synthetic union keeps selected any or unknown and structural priority before missing members", () => {
  const carrier = csharpSourcePrimitiveTargetType("int64");
  for (const kind of ["any", "unknown"]) {
    const unit = fixture(["member"], kind);
    const source = capture(unit);
    assert.equal(source.kind === "selected" && source.child.type === unit.type && source.child.state.depth === unit.state.depth + 1, true);
    assert.deepEqual(unit.observations, kind === "any" ? ["union", "any"] : ["union", "any", "unknown"]);
    unit.carriers = [carrier];
    forbidSource(unit);
    const result = resolveFormedCsharpUnionTypeNode(nativeScope(unit), source);
    assert.equal(result.nativeType === carrier && result.selectedType === carrier, true);
    assert.deepEqual(unit.children, ["type"]);
  }
  for (const structural of [{ kind: "resolved", type: carrier }, { kind: "rejected" }, { kind: "not-applicable" }]) {
    const unit = fixture([undefined]);
    unit.structural = structural;
    const source = capture(unit);
    forbidSource(unit);
    const result = resolveFormedCsharpUnionTypeNode(nativeScope(unit), source);
    assert.equal(structural.kind === "resolved" ? result.nativeType === carrier : result === undefined, true);
    assert.deepEqual(unit.children, ["structural"]);
  }
  const missing = fixture(["member"], "absent");
  const source = capture(missing);
  forbidSource(missing);
  assert.equal(resolveFormedCsharpUnionTypeNode(nativeScope(missing), source) === undefined, true);
  assert.deepEqual(missing.children, []);
});

test("synthetic union keeps all Native children after failure and the same checked retention rows", () => {
  const carrier = csharpSourcePrimitiveTargetType("int32");
  for (const failed of [true, false]) {
    const unit = fixture(["member", "member", "member"]);
    unit.carriers = [failed ? undefined : carrier, carrier, carrier];
    const source = capture(unit);
    const observations = [...unit.observations];
    forbidSource(unit);
    const result = resolveFormedCsharpUnionTypeNode(nativeScope(unit), source);
    assert.equal(failed ? result === undefined : targetTypeRefEquals(result.nativeType, carrier), true);
    assert.deepEqual(unit.children, ["structural", "definition", "node:0", "node:1", "node:2", "retain"]);
    assert.equal(unit.retained.members.length, 3);
    assert.equal(unit.retained.members.every((member, index) => member.source === source.checkedMembers[index] &&
      member.carrier === unit.carriers[index]), true);
    assert.deepEqual(unit.observations, observations);
  }
});

test("synthetic union rejects sparse, foreign or retired retained requests before Native owners", () => {
  const unit = fixture();
  const source = capture(unit);
  const scope = { get host() { assert.fail("invalid union Source cannot read a Native owner"); },
    resolveTypeWithState: () => assert.fail("invalid union Source cannot complete a Type child"),
    resolveNodeWithState: () => assert.fail("invalid union Source cannot complete a Node child") };
  const sparse = new Array(source.members.length);
  const sparseSyntax = [...source.syntaxMembers];
  delete sparseSyntax[0];
  const sparseChecked = [...source.checkedMembers];
  delete sparseChecked[0];
  for (const invalid of [undefined, { ...source, kind: "retired" }, { ...source, members: sparse },
    { ...source, syntaxMembers: sparseSyntax }, { ...source, checkedMembers: sparseChecked },
    { ...source, members: [source.members[1], source.members[0]] },
    { ...source, members: [{ ...source.members[0], node: {} }, source.members[1]] },
    { ...source, members: [{ ...source.members[0], type: {} }, source.members[1]] },
    { ...source, members: [{ ...source.members[0], sourceFile: {} }, source.members[1]] },
    { ...source, members: [{ ...source.members[0], state: unit.state }, source.members[1]] },
  ]) assert.throws(() => resolveFormedCsharpUnionTypeNode(scope, invalid), /exact retained Source children/);
  const selected = capture(fixture([], "any"));
  assert.throws(() => resolveFormedCsharpUnionTypeNode(scope, { ...selected, child: { ...selected.child, type: {} } }),
    /exact retained Source children/);
});
