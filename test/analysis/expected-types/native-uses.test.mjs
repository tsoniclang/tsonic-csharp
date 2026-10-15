import assert from "node:assert/strict";
import test from "node:test";
import { createCsharpExpectedUseCollection } from "../../../dist/analysis/expected-types/collection.js";
import { admitCsharpExpectedNativeUses } from "../../../dist/analysis/expected-types/native-uses.js";
import { csharpNativeUseSite } from "../../../dist/target-model/records/native-demand.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { targetTypeRefKey } from "../../../dist/target-model/types/equality.js";

const int32 = csharpSourcePrimitiveTargetType("int32");
const int64 = csharpSourcePrimitiveTargetType("int64");
const float64 = csharpSourcePrimitiveTargetType("float64");

function syntheticAst() {
  const kinds = ["ParenthesizedExpression", "SatisfiesExpression", "ConditionalExpression", "BinaryExpression",
    "ArrayLiteralExpression", "ObjectLiteralExpression", "AsExpression", "PropertyAssignment",
    "ShorthandPropertyAssignment", "SpreadAssignment", "ArrowFunction", "FunctionExpression", "Block"];
  return {
    is: Object.fromEntries(kinds.map((kind) => [`Is${kind}`, (node) => node.kind === kind])),
    as: {
      AsParenthesizedExpression: (node) => ({ Expression: node.expression }),
      AsSatisfiesExpression: (node) => ({ Expression: node.expression }),
      AsAsExpression: (node) => ({ Expression: node.expression }),
      AsTypeAssertion: (node) => ({ Expression: node.expression }),
      AsConditionalExpression: (node) => ({ Condition: node.condition, WhenTrue: node.whenTrue, WhenFalse: node.whenFalse }),
      AsPropertyAssignment: (node) => ({ Initializer: node.initializer }),
      AsSpreadAssignment: (node) => ({ Expression: node.expression }),
      AsArrowFunction: (node) => ({ Body: node.body }),
    },
    isConstAssertion: (node) => node.constAssertion === true,
    children: (node) => node.children ?? [],
    name: (node) => node.name,
    kindName: (node) => `Kind${node.kind}`,
  };
}

const leaf = (name) => ({ kind: "Identifier", name });

function admit(build, options = {}) {
  const ast = syntheticAst();
  const collection = createCsharpExpectedUseCollection({ ast });
  build(collection.record);
  const projection = collection.seal();
  const admission = admitCsharpExpectedNativeUses({
    ast,
    sites: projection.sites,
    sitesOf: projection.sitesOf,
    expectedBinary: options.expectedBinary ?? (() => undefined),
    intrinsicTarget: options.intrinsicTarget ?? (() => false),
    callableTarget: options.callableTarget ?? (() => undefined),
    absentValue: options.absentValue ?? (() => false),
  });
  return { projection, admission, read: (owner, slot) => admission.expectedUse.get(csharpNativeUseSite(owner, slot)) };
}

const same = (left, right) => targetTypeRefKey(left) === targetTypeRefKey(right);
const sameSites = (actual, expected) => actual.length === expected.length &&
  actual.every((site, index) => site.subject === expected[index].subject && site.role === expected[index].role);

test("a forwarding chain publishes one exact use per consuming slot and ignores stale forwarded targets", () => {
  const call = { kind: "CallExpression" };
  const first = leaf("first");
  const second = leaf("second");
  const flag = leaf("flag");
  const conditional = { kind: "ConditionalExpression", condition: flag, whenTrue: first, whenFalse: second };
  const group = { kind: "ParenthesizedExpression", expression: conditional };
  const argument = { kind: "argument", sourceIndex: 0, effectiveIndex: 0, parameterIndex: 0 };
  const { projection, admission, read } = admit((record) => {
    record(group, int32, "required", { owner: call, slot: argument });
    record(conditional, int32, "required", { owner: group, slot: { kind: "operand", position: "only" }, forwardedFrom: int32 });
    record(first, int32, "required", { owner: conditional, slot: { kind: "branch", branch: "true" }, forwardedFrom: int32 });
    record(second, int32, "required", { owner: conditional, slot: { kind: "branch", branch: "false" }, forwardedFrom: int32 });
    record(first, int64, "contextual", { owner: conditional, slot: { kind: "branch", branch: "true" }, forwardedFrom: int64 });
    record(first, float64, "contextual", undefined);
  });
  const outer = read(call, argument);
  assert.equal(outer?.representation === "forward" && outer.expression === group && same(outer.target, int32) &&
    outer.strength === "required" && outer.mode === "implicit" &&
    sameSites(outer.children, [csharpNativeUseSite(group, { kind: "operand", position: "only" })]), true,
  "the argument slot forwards its parameter target through the parentheses");
  const inner = read(group, { kind: "operand", position: "only" });
  assert.equal(inner?.representation === "forward" && sameSites(inner.children, [
    csharpNativeUseSite(conditional, { kind: "condition" }),
    csharpNativeUseSite(conditional, { kind: "branch", branch: "true" }),
    csharpNativeUseSite(conditional, { kind: "branch", branch: "false" }),
  ]), true, "the conditional forwards to its branches and keeps its condition as an ordered child use");
  const branch = read(conditional, { kind: "branch", branch: "true" });
  assert.equal(branch?.representation === "convert" && branch.expression === first && same(branch.target, int32) &&
    branch.children.length === 0, true, "the branch converts to the forwarded target, not to the stale or candidate targets");
  assert.equal(read(conditional, { kind: "condition" }), undefined, "the condition has no expected use of its own");
  assert.equal(projection.expectedType(first).length === 3 && projection.requiredExpectedType(first).length === 1, true,
    "the views remain projections of every recorded target, including candidates without a consuming slot");
  assert.equal(admission.unresolved.length, 0, "no site is ambiguous");
});

test("a binary constructs its target only when its expected selection produces exactly that target", () => {
  const widened = { kind: "BinaryExpression" };
  const narrowed = { kind: "BinaryExpression" };
  const plain = { kind: "BinaryExpression" };
  const declarations = [{ kind: "VariableDeclaration" }, { kind: "VariableDeclaration" }, { kind: "VariableDeclaration" }];
  const initializer = { kind: "initializer" };
  const { read } = admit((record) => {
    record(widened, int64, "required", { owner: declarations[0], slot: initializer });
    record(narrowed, float64, "required", { owner: declarations[1], slot: initializer });
    record(plain, float64, "required", { owner: declarations[2], slot: initializer });
  }, {
    expectedBinary: (expression, target) =>
      expression === widened ? { kind: "resolved", resultType: target, targetOperation: { kind: "generic-numeric" } }
      : expression === narrowed ? { kind: "resolved", resultType: int32, targetOperation: { kind: "generic-numeric" } }
      : undefined,
  });
  const construction = read(declarations[0], initializer);
  assert.equal(construction?.representation === "construct" && sameSites(construction.children, [
    csharpNativeUseSite(widened, { kind: "operand", position: "left" }), csharpNativeUseSite(widened, { kind: "operand", position: "right" })]),
  true, "a binary whose expected selection yields the expected target constructs it from both operands");
  assert.equal(read(declarations[1], initializer)?.representation === "convert", true,
    "a binary whose expected selection yields another result converts that result");
  assert.equal(read(declarations[2], initializer)?.representation === "convert", true,
    "a binary without an expected selection converts its own result");
  assert.equal(read(widened, { kind: "operand", position: "left" }), undefined,
    "operand uses belong to the operation owner, not to the expected-use collection");
});

test("absent values and callables created at their delegate target are constructed in place", () => {
  const absent = leaf("undefined");
  const arrow = { kind: "ArrowFunction", body: leaf("value") };
  const block = { kind: "ArrowFunction", body: { kind: "Block" } };
  const other = { kind: "ArrowFunction", body: leaf("other") };
  const owners = [{ kind: "ReturnStatement" }, { kind: "VariableDeclaration" }, { kind: "VariableDeclaration" }, { kind: "VariableDeclaration" }];
  const delegate = csharpDelegateTargetType("System.Func", [], int32);
  const slot = (owner) => owner.kind === "ReturnStatement" ? { kind: "return" } : { kind: "initializer" };
  const { read } = admit((record) => {
    record(absent, int32, "required", { owner: owners[0], slot: slot(owners[0]) });
    record(arrow, delegate, "required", { owner: owners[1], slot: slot(owners[1]) });
    record(block, delegate, "required", { owner: owners[2], slot: slot(owners[2]) });
    record(other, delegate, "required", { owner: owners[3], slot: slot(owners[3]) });
  }, {
    absentValue: (expression) => expression === absent,
    callableTarget: (expression) => expression === other ? int32 : delegate,
  });
  const nothing = read(owners[0], { kind: "return" });
  assert.equal(nothing?.representation === "construct" && nothing.children.length === 0, true,
    "the absent value is constructed in the target representation with no child use");
  const lambda = read(owners[1], { kind: "initializer" });
  assert.equal(lambda?.representation === "construct" && sameSites(lambda.children, [csharpNativeUseSite(arrow, { kind: "return" })]), true,
    "an expression-bodied lambda created at its delegate target returns through its body use");
  assert.equal(read(owners[2], { kind: "initializer" })?.representation === "construct" &&
    read(owners[2], { kind: "initializer" }).children.length === 0, true, "a block-bodied lambda has no expression child use");
  assert.equal(read(owners[3], { kind: "initializer" })?.representation === "convert", true,
    "a lambda whose callable target differs from the expected delegate converts");
});

test("intrinsic literal demands apply only to a literal that has no admitted expected construction", () => {
  const first = leaf("first");
  const second = leaf("second");
  const standalone = { kind: "ArrayLiteralExpression", children: [first] };
  const expected = { kind: "ArrayLiteralExpression", children: [second] };
  const declaration = { kind: "VariableDeclaration" };
  const element = { kind: "element", index: 0 };
  const { read } = admit((record) => {
    record(first, int32, "contextual", { owner: standalone, slot: element, forwardedFrom: int32 });
    record(expected, int64, "required", { owner: declaration, slot: { kind: "initializer" } });
    record(second, int32, "contextual", { owner: expected, slot: element, forwardedFrom: int32 });
    record(second, int64, "required", { owner: expected, slot: element, forwardedFrom: int64 });
  }, { intrinsicTarget: (expression, target) => same(target, int32) });
  assert.equal(same(read(standalone, element)?.target, int32), true, "a literal planned on its own uses its intrinsic element target");
  const construction = read(declaration, { kind: "initializer" });
  assert.equal(construction?.representation === "construct" && sameSites(construction.children, [csharpNativeUseSite(expected, element)]),
    true, "an expected array literal constructs its target from each element slot");
  assert.equal(same(read(expected, element)?.target, int64), true, "its element takes the admitted construction's target");
});

test("a slot with two required targets publishes no use, and a required target outranks contextual ones", () => {
  const statement = { kind: "SwitchStatement" };
  const subject = leaf("subject");
  const declaration = { kind: "VariableDeclaration" };
  const value = leaf("value");
  const { admission, read } = admit((record) => {
    record(subject, int32, "required", { owner: statement, slot: { kind: "condition" } });
    record(subject, int64, "required", { owner: statement, slot: { kind: "condition" } });
    record(value, int32, "contextual", { owner: declaration, slot: { kind: "initializer" } });
    record(value, int64, "required", { owner: declaration, slot: { kind: "initializer" } });
  });
  assert.equal(read(statement, { kind: "condition" }), undefined, "an ambiguous slot is not admitted");
  assert.equal(admission.unresolved.length === 1 && admission.unresolved[0].subject === statement, true, "the ambiguous slot is reported");
  const admitted = read(declaration, { kind: "initializer" });
  assert.equal(same(admitted.target, int64) && admitted.strength === "required", true, "the required target is the admitted one");
});

test("each selected argument binding of one shared spread operand has its own use", () => {
  const call = { kind: "CallExpression" };
  const spread = leaf("values");
  const firstSlot = { kind: "argument", sourceIndex: 0, effectiveIndex: 0, parameterIndex: 0 };
  const secondSlot = { kind: "argument", sourceIndex: 0, effectiveIndex: 1, parameterIndex: 1 };
  const { admission, read } = admit((record) => {
    record(spread, int32, "required", { owner: call, slot: firstSlot });
    record(spread, int64, "required", { owner: call, slot: secondSlot });
  });
  const first = read(call, firstSlot);
  const second = read(call, secondSlot);
  assert.equal(first?.expression === spread && second?.expression === spread && same(first.target, int32) && same(second.target, int64),
    true, "one operand expression feeds two distinct effective argument uses");
  assert.equal(read(call, { kind: "argument", sourceIndex: 0, effectiveIndex: 1, parameterIndex: 0 }), undefined,
    "a wrong parameter identity reads no use");
  assert.equal(read(call, { kind: "argument", sourceIndex: 0, effectiveIndex: 2, parameterIndex: 1 }), undefined,
    "a wrong effective identity reads no use");
  assert.equal(admission.entries.length, 2, "exactly the two bound slots are admitted");
});

test("published expected uses are frozen and read by exact lookup", () => {
  const owner = { kind: "ReturnStatement" };
  const value = leaf("value");
  const object = { kind: "ObjectLiteralExpression", children: [
    { kind: "PropertyAssignment", initializer: leaf("a") }, { kind: "MethodDeclaration" }, { kind: "ShorthandPropertyAssignment", name: leaf("b") },
  ] };
  const declaration = { kind: "VariableDeclaration" };
  const { admission, read } = admit((record) => {
    record(value, int32, "required", { owner, slot: { kind: "return" } });
    record(object, int32, "required", { owner: declaration, slot: { kind: "initializer" } });
  });
  const use = read(owner, { kind: "return" });
  assert.equal(Object.isFrozen(use) && Object.isFrozen(use.children) && Object.isFrozen(admission.entries), true, "the use and its children are frozen");
  assert.equal(read(owner, { kind: "return" }) === use, true, "repeated reads return the one published use");
  assert.equal(read(owner, { kind: "thrown" }), undefined, "another slot of the same construct reads nothing");
  const construction = read(declaration, { kind: "initializer" });
  assert.equal(construction?.representation === "construct" && sameSites(construction.children, [
    csharpNativeUseSite(object, { kind: "member", index: 0 }), csharpNativeUseSite(object, { kind: "member", index: 2 })]), true,
  "an object literal constructs from its value members at their source positions");
});
