import assert from "node:assert/strict";
import test from "node:test";
import { classifyCsharpSourceCallee } from "../../dist/analysis/callables/calls/source-callees.js";
import { csharpDelegateTargetType } from "../../dist/target-model/types/carriers/delegates.js";
import { csharpNullableTargetType } from "../../dist/target-model/types/carriers/nullable.js";
import { csharpRuntimeUnionTargetType } from "../../dist/target-model/types/carriers/runtime-carriers.js";

// nextgen C-2542 (run 1 C3): the classifier reads the Host call selection (`callee`, `declaration`, `receiver`,
// `optionalChain`, `use`), the Host member/element selection of the callee, `facts.navigation.identity` and the
// represented `types.value` / `types.readStorage`. Every case and expectation is the baseline one; only the fixture
// moved from the checker call info (sourceCallee / sourceCalleeAccess, navigation.sourceReferenceFor,
// types.resolveSelectedValue / resolveReadStorage) to those facts.
const expression = {};
const receiver = {};
const functionDeclaration = { kind: "function" };
const methodDeclaration = { kind: "method" };
const variableDeclaration = { kind: "variable" };
const delegate = csharpDelegateTargetType("System.Action", []);
const owner = { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "owner", csharpRender: { kind: "name", namespace: [], name: "Owner" } };

/** The authored-syntax reader of the fixture: `expression` is a property or element access when `access` says so. */
function fixtureAst(access, extra = {}) {
  const { is, ...rest } = extra;
  return {
    is: {
      IsPropertyAccessExpression: node => node === expression && access?.kind === "property",
      IsElementAccessExpression: node => node === expression && access?.kind === "element",
      IsVariableDeclaration: node => node?.kind === "variable",
      IsFunctionDeclaration: node => node?.kind === "function",
      IsMethodDeclaration: node => node?.kind === "method",
      IsClassDeclaration: node => node?.kind === "class",
      IsCallExpression: () => false,
      ...is,
    },
    parent: node => node?.parent,
    name: node => node?.name,
    kindName: node => node?.kind,
    hasModifierKind: () => false,
    questionToken: () => undefined,
    ...rest,
  };
}

/** Host facts of the fixture: the callee's identity target and its member / element selection. */
function fixtureFacts(declaration, access, isProjectDeclaration = node => node === functionDeclaration) {
  return {
    selections: { memberAccess: node => node === expression && access?.kind === "property" && declaration !== undefined
      ? { selected: { kind: "member", declarations: [declaration] } } : undefined },
    values: { elementAccess: node => {
      assert.equal(node === expression, true, "only the selected element callee has an element record");
      return { selected: declaration === undefined ? { kind: "element" } : { kind: "member", declaration, name: "member" } };
    } },
    navigation: {
      identity: { target: node => node === expression && declaration !== undefined ? { declaration } : undefined, isProjectDeclaration },
      scopes: { enclosing: () => undefined },
    },
  };
}

function callSource(selected, access, extra = {}) {
  return { use: {}, kind: "call", callee: expression, declaration: selected,
    ...(access === undefined ? {} : { receiver: access.receiver.expression }), optionalChain: false, ...extra };
}

function classify(declaration, selected, access, carrier = delegate, isStatic = false) {
  return classifyCsharpSourceCallee({
    moduleCallables: Object.freeze({ get: () => undefined }),
    ast: fixtureAst(access, { hasModifierKind: () => isStatic }),
    facts: fixtureFacts(declaration, access),
    projectTypes: { catalog: { definitionForDeclaration: () => undefined } },
    types: { value: node => node === expression ? carrier : owner,
      readStorage: node => { assert.equal(node === expression, true, "the exact fixture member owns its native storage"); return carrier; } },
  }, callSource(selected, access));
}

test("source direct functions do not become delegate operands", () => {
  const selected = classify(functionDeclaration, functionDeclaration);
  assert.equal(selected.kind, "function");
  assert.equal(selected.expression, expression);
  assert.equal(Object.isFrozen(selected), true);
});

test("exact direct functions never request a first-class delegate projection", () => {
  const selected = classifyCsharpSourceCallee({
    moduleCallables: Object.freeze({ get: () => undefined }),
    ast: fixtureAst(undefined),
    facts: fixtureFacts(functionDeclaration, undefined),
    projectTypes: { catalog: {} },
    types: { value: () => { throw new Error("unnecessary callable projection"); },
      readStorage: () => assert.fail("an exact direct function has no member-storage read") },
  }, callSource(functionDeclaration, undefined));
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
  const access = { kind: "property", expression, receiver: { expression: receiver } };
  const selected = classifyCsharpSourceCallee({
    moduleCallables: Object.freeze({ get: () => undefined }),
    ast: fixtureAst(access),
    facts: fixtureFacts(undefined, access),
    projectTypes: { catalog: { definitionForTarget: type => type === owner || type === right ? { kind: "class" } : undefined } },
    types: { value: node => {
      assert.equal(node === receiver, true, "only the exact native receiver is acquired");
      return union;
    }, readStorage: () => assert.fail("the checked class-union branch never reads a delegate member") },
  }, callSource(undefined, access));
  assert.equal(selected.kind === "union-method" && selected.receiver.type === union, true, "closed candidate awaits the existing per-arm method proof");
  assert.equal(selected.receiver.expression === receiver && selected.expression === expression, true, "exact selected AST nodes retained");
  assert.equal(Object.isFrozen(selected) && Object.isFrozen(selected.receiver), true);
});

test("composite calls do not manufacture class-union evidence for interface, foreign or scalar arms", () => {
  const right = { ...owner, id: "right", csharpRender: { kind: "name", namespace: [], name: "Right" } };
  const access = { kind: "property", expression, receiver: { expression: receiver } };
  for (const kind of ["interface", "foreign", "scalar"]) {
    const union = csharpRuntimeUnionTargetType([owner, kind === "scalar" ? { kind: "source-primitive", name: "int32" } : right]);
    const selected = classifyCsharpSourceCallee({
      moduleCallables: Object.freeze({ get: () => undefined }),
      ast: fixtureAst(access),
      facts: fixtureFacts(undefined, access),
      projectTypes: { catalog: { definitionForTarget: type => type === owner ? { kind: "class" }
        : type === right && kind === "interface" ? { kind: "interface" } : undefined } },
      types: { value: node => node === receiver ? union : { kind: "source-primitive", name: "uint32" },
        readStorage: node => { assert.equal(node === expression, true, "only the original member has fixture storage");
          return { kind: "source-primitive", name: "uint32" }; } },
    }, callSource(undefined, access));
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
    moduleCallables: Object.freeze({ get: () => undefined }),
    ast: fixtureAst(access, {
      is: {
        IsFunctionDeclaration: () => false,
        IsVariableDeclaration: () => false,
        IsCallExpression: node => node === call,
      },
      as: { AsCallExpression: node => {
        assert.equal(node === call, true, "only the original selected call owns invocation optionality");
        return call;
      } },
      name: () => undefined,
      questionToken: node => {
        assert.equal(node === method, true, "only the selected method owns optional-member evidence");
        return node.optional;
      },
    }),
    facts: fixtureFacts(method, access, node => node === method),
    projectTypes: { catalog: { definitionForDeclaration: () => undefined } },
    types: {
      readStorage: node => {
        assert.equal(node === expression, true, "the original lifted member owns its native storage");
        return carrier;
      },
      value: node => {
        assert.equal(node === receiver, true, "only the original native receiver is acquired");
        return owner;
      },
    },
  };
  const source = callSource(method, access, { use: call, optionalChain: true });
  return { policy, source, method, carrier };
}

test("optional receivers keep required nominal methods on their native declaration ABI", () => {
  for (const accessKind of ["property", "element"]) {
    const input = optionalNominalMethodFixture({ accessKind, ownerKind: "class", memberKind: "method",
      optionalMethod: false, optionalCallee: false });
    const selected = classifyCsharpSourceCallee(input.policy, input.source);
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
    const selected = classifyCsharpSourceCallee(input.policy, input.source);
    assert.equal(selected.kind === "value" && selected.expression === expression && selected.type === input.carrier, true, label);
    assert.equal(Object.isFrozen(selected), true, label);
  }
  const foreign = optionalNominalMethodFixture({ accessKind: "property", ownerKind: "class", memberKind: "method",
    optionalMethod: false, optionalCallee: false });
  foreign.source = { ...foreign.source, use: {} };
  const selected = classifyCsharpSourceCallee(foreign.policy, foreign.source);
  assert.equal(selected.kind === "value" && selected.type === foreign.carrier, true,
    "a foreign invocation node cannot prove receiver-only lifting or gain a native method ABI");
});
