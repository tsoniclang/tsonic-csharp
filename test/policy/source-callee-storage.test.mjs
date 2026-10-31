import assert from "node:assert/strict";
import test from "node:test";
import { classifyCsharpSourceCallee } from "../../dist/analysis/callables/calls/source-callees.js";
import { csharpDelegateTargetType } from "../../dist/target-model/types/carriers/delegates.js";
import { csharpNullableTargetType } from "../../dist/target-model/types/carriers/nullable.js";
import { csharpRuntimeUnionTargetType } from "../../dist/target-model/types/carriers/runtime-carriers.js";

const expression = {};
const receiver = {};
const functionDeclaration = { kind: "function" };
const methodDeclaration = { kind: "method" };
const variableDeclaration = { kind: "variable" };
const delegate = csharpDelegateTargetType("System.Action", []);
const owner = { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "owner", csharpRender: { kind: "name", namespace: [], name: "Owner" } };
function classify(declaration, selected, access, carrier = delegate, isStatic = false) {
  return classifyCsharpSourceCallee({
    ast: { is: { IsVariableDeclaration: node => node?.kind === "variable",
      IsFunctionDeclaration: node => node?.kind === "function", IsMethodDeclaration: node => node?.kind === "method",
      IsClassDeclaration: node => node?.kind === "class" }, parent: node => node.parent, name: node => node.name,
      kindName: node => node.kind, hasModifierKind: () => isStatic },
    navigation: { sourceReferenceFor: () => declaration === undefined ? undefined : { declaration },
      isProjectDeclaration: node => node === functionDeclaration },
    projectTypes: { catalog: { definitionForDeclaration: () => undefined } },
    types: { resolveSelectedValue: node => node === expression ? carrier : owner,
      resolveReadStorage: node => { assert.equal(node === expression, true, "the exact fixture member owns its native storage"); return carrier; } },
  }, { sourceCallee: { expression, selectedDeclaration: selected }, sourceCalleeAccess: access }, {});
}

test("source direct functions do not become delegate operands", () => {
  const selected = classify(functionDeclaration, functionDeclaration);
  assert.equal(selected.kind, "function");
  assert.equal(selected.expression, expression);
  assert.equal(Object.isFrozen(selected), true);
});

test("exact direct functions never request a first-class delegate projection", () => {
  const selected = classifyCsharpSourceCallee({
    ast: { is: { IsFunctionDeclaration: node => node === functionDeclaration,
      IsVariableDeclaration: node => node === variableDeclaration } },
    navigation: { sourceReferenceFor: () => ({ declaration: functionDeclaration }),
      isProjectDeclaration: node => node === functionDeclaration },
    projectTypes: { catalog: {} },
    types: { resolveSelectedValue: () => { throw new Error("unnecessary callable projection"); },
      resolveReadStorage: () => assert.fail("an exact direct function has no member-storage read") },
  }, { sourceCallee: { expression, selectedDeclaration: functionDeclaration } }, {});
  assert.equal(selected.kind, "function");
});

test("function-selected alias storage remains a real callable value", () => {
  for (const declaration of [variableDeclaration, { kind: "parameter" }, { kind: "property" }]) {
    const selected = classify(declaration, functionDeclaration);
    assert.equal(selected.kind, "value");
    assert.equal(selected.type, delegate);
  }
});

test("direct methods supply receiver acquisition without delegate construction", () => {
  for (const kind of ["property", "element"]) {
    const selected = classify(methodDeclaration, methodDeclaration, { kind, expression, receiver: { expression: receiver } });
    assert.equal(selected.kind, "method");
    assert.equal(selected.receiver.expression, receiver);
    assert.equal(selected.receiver.type, owner);
    assert.equal(Object.isFrozen(selected.receiver), true);
  }
});

test("static nominal methods use their exact native member receiver rather than module linkage", () => {
  const method = { kind: "method", parent: { kind: "class" } };
  for (const kind of ["property", "element"]) {
    const selected = classify(method, method, { kind, expression, receiver: { expression: receiver } }, delegate, true);
    assert.equal(selected.kind, "method");
    assert.equal(selected.receiver.expression === receiver, true, "exact static declaring type expression");
    assert.equal(selected.receiver.type === owner, true, "native receiver carrier");
  }
});

test("method-value protocols and optional delegates retain their physical storage", () => {
  const methodValue = { ...owner, csharpMethodValue: { owner, contract: delegate, method: "Invoke", identity: "method", typeParameters: [] } };
  assert.equal(classify(methodDeclaration, methodDeclaration, { kind: "property", receiver: { expression: receiver } }, methodValue).kind, "value");
  assert.equal(classify(variableDeclaration, functionDeclaration, undefined, csharpNullableTargetType(delegate)).kind, "value");
});

test("missing native callee storage evidence rejects without printed-name guessing", () => {
  assert.equal(classify(variableDeclaration, functionDeclaration, undefined, { kind: "source-primitive", name: "uint64" }).kind, "rejected");
  assert.equal(classify(undefined, undefined, undefined, { kind: "source-primitive", name: "uint64" }).kind, "rejected");
});

test("nominal generic class methods retain native calls rather than structural callable storage", () => {
  const method = { kind: "method", parent: { kind: "class" } };
  const methodValue = { ...owner, csharpMethodValue: { owner, contract: delegate, method: "Invoke", identity: "method", typeParameters: ["Item"] } };
  const selected = classify(method, method, { kind: "property", receiver: { expression: receiver } }, methodValue);
  assert.equal(selected.kind, "method", "native nominal method call");
  assert.equal(selected.receiver.expression === receiver, true, "exact native receiver");
  assert.equal(classify(methodDeclaration, methodDeclaration,
    { kind: "property", receiver: { expression: receiver } }, methodValue).kind, "value", "structural callable protocol remains distinct");
});

test("a checked composite class method selects its closed receiver without acquiring a delegate", () => {
  const right = { ...owner, id: "right", csharpRender: { kind: "name", namespace: [], name: "Right" } };
  const union = csharpRuntimeUnionTargetType([owner, right]);
  const selected = classifyCsharpSourceCallee({
    ast: { is: {}, parent: () => undefined },
    navigation: { sourceReferenceFor: () => undefined },
    projectTypes: { catalog: { definitionForTarget: type => type === owner || type === right ? { kind: "class" } : undefined } },
    types: { resolveSelectedValue: node => {
      assert.equal(node === receiver, true, "only the exact native receiver is acquired");
      return union;
    }, resolveReadStorage: () => assert.fail("the checked class-union branch never reads a delegate member") },
  }, { sourceCallee: { expression }, sourceCalleeAccess: { kind: "property", expression, receiver: { expression: receiver } } }, {});
  assert.equal(selected.kind === "union-method" && selected.receiver.type === union, true, "closed candidate awaits the existing per-arm method proof");
  assert.equal(selected.receiver.expression === receiver && selected.expression === expression, true, "exact selected AST nodes retained");
  assert.equal(Object.isFrozen(selected) && Object.isFrozen(selected.receiver), true);
});

test("composite calls do not manufacture class-union evidence for interface, foreign or scalar arms", () => {
  const right = { ...owner, id: "right", csharpRender: { kind: "name", namespace: [], name: "Right" } };
  for (const kind of ["interface", "foreign", "scalar"]) {
    const union = csharpRuntimeUnionTargetType([owner, kind === "scalar" ? { kind: "source-primitive", name: "int32" } : right]);
    const selected = classifyCsharpSourceCallee({
      ast: { is: {}, parent: () => undefined },
      navigation: { sourceReferenceFor: () => undefined },
      projectTypes: { catalog: { definitionForTarget: type => type === owner ? { kind: "class" }
        : type === right && kind === "interface" ? { kind: "interface" } : undefined } },
      types: { resolveSelectedValue: node => node === receiver ? union : { kind: "source-primitive", name: "uint32" },
        resolveReadStorage: node => { assert.equal(node === expression, true, "only the original member has fixture storage");
          return { kind: "source-primitive", name: "uint32" }; } },
    }, { sourceCallee: { expression }, sourceCalleeAccess: { kind: "property", expression, receiver: { expression: receiver } } }, {});
    assert.equal(selected.kind === "rejected", true, kind);
  }
});

function optionalNominalMethodFixture({ accessKind, ownerKind, memberKind, optionalMethod, optionalCallee }) {
  const classOwner = { kind: ownerKind };
  const method = { kind: memberKind, parent: classOwner, optional: optionalMethod ? {} : undefined };
  const call = { QuestionDotToken: optionalCallee ? {} : undefined };
  const access = { kind: accessKind, expression, receiver: { expression: receiver } };
  const carrier = csharpNullableTargetType(delegate);
  const policy = {
    ast: {
      is: {
        IsFunctionDeclaration: () => false,
        IsVariableDeclaration: () => false,
        IsMethodDeclaration: node => node?.kind === "method",
        IsClassDeclaration: node => node?.kind === "class",
        IsCallExpression: node => node === call,
      },
      as: { AsCallExpression: node => {
        assert.equal(node === call, true, "only the original selected call owns invocation optionality");
        return call;
      } },
      parent: node => node?.parent,
      name: () => undefined,
      kindName: node => node?.kind,
      hasModifierKind: () => false,
      questionToken: node => {
        assert.equal(node === method, true, "only the selected method owns optional-member evidence");
        return node.optional;
      },
    },
    navigation: {
      sourceReferenceFor: node => {
        assert.equal(node === expression, true, "the original member keeps its declaration identity");
        return { declaration: method };
      },
      isProjectDeclaration: node => node === method,
    },
    projectTypes: { catalog: { definitionForDeclaration: () => undefined } },
    types: {
      resolveReadStorage: node => {
        assert.equal(node === expression, true, "the original lifted member owns its native storage");
        return carrier;
      },
      resolveSelectedValue: node => {
        assert.equal(node === receiver, true, "only the original native receiver is acquired");
        return owner;
      },
    },
  };
  const source = { call, optionalChain: true, sourceCallee: { expression, selectedDeclaration: method },
    sourceCalleeAccess: access, sourceReceiver: access.receiver };
  return { policy, source, method, carrier };
}

test("optional receivers keep required nominal methods on their native declaration ABI", () => {
  for (const accessKind of ["property", "element"]) {
    const input = optionalNominalMethodFixture({ accessKind, ownerKind: "class", memberKind: "method",
      optionalMethod: false, optionalCallee: false });
    const selected = classifyCsharpSourceCallee(input.policy, input.source, {});
    assert.equal(selected.kind === "method" && selected.declaration === input.method, true, accessKind);
    assert.equal(selected.expression === expression && selected.receiver.expression === receiver &&
      selected.receiver.type === owner, true, "the present native receiver and original method stay exact");
    assert.equal(selected.type === undefined && Object.isFrozen(selected) && Object.isFrozen(selected.receiver), true,
      "receiver lifting does not create a first-class delegate or change the native method contract");
  }
});

test("receiver lifting cannot promote optional callees, optional methods, fields or structural protocols to native methods", () => {
  for (const [label, ownerKind, memberKind, optionalMethod, optionalCallee] of [
    ["optional invocation", "class", "method", false, true],
    ["optional method", "class", "method", true, false],
    ["callable field", "class", "property", false, false],
    ["structural protocol", "interface", "method", false, false],
  ]) {
    const input = optionalNominalMethodFixture({ accessKind: "property", ownerKind, memberKind, optionalMethod, optionalCallee });
    const selected = classifyCsharpSourceCallee(input.policy, input.source, {});
    assert.equal(selected.kind === "value" && selected.expression === expression && selected.type === input.carrier, true, label);
    assert.equal(Object.isFrozen(selected), true, label);
  }
  const foreign = optionalNominalMethodFixture({ accessKind: "property", ownerKind: "class", memberKind: "method",
    optionalMethod: false, optionalCallee: false });
  foreign.source.call = {};
  const selected = classifyCsharpSourceCallee(foreign.policy, foreign.source, {});
  assert.equal(selected.kind === "value" && selected.type === foreign.carrier, true,
    "a foreign invocation node cannot prove receiver-only lifting or gain a native method ABI");
});
