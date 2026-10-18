import assert from "node:assert/strict";
import test from "node:test";
import { classifyCsharpSourceCallee } from "../../dist/policy/types/callables/source-callees.js";
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
function classify(declaration, selected, access, carrier = delegate, isStatic = false, project = true) {
  return classifyCsharpSourceCallee({
    ast: { is: { IsFunctionDeclaration: node => node?.kind === "function", IsMethodDeclaration: node => node?.kind === "method",
      IsClassDeclaration: node => node?.kind === "class" }, parent: node => node.parent,
      kindName: node => node.kind, hasModifierKind: () => isStatic },
    navigation: { sourceReferenceFor: () => declaration === undefined ? undefined : { declaration },
      isProjectDeclaration: node => node === selected ? project : node === declaration },
    projectTypes: { catalog: { definitionForDeclaration: () => undefined } },
    types: { resolveSelectedValue: node => node === expression ? carrier : owner },
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
    ast: { is: { IsFunctionDeclaration: node => node === functionDeclaration } },
    navigation: { sourceReferenceFor: () => ({ declaration: functionDeclaration }),
      isProjectDeclaration: node => node === functionDeclaration },
    projectTypes: { catalog: {} },
    types: { resolveSelectedValue: () => { throw new Error("unnecessary callable projection"); } },
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

test("external direct function shapes stay available to type and profile queries before admission", () => {
  const selected = classify(functionDeclaration, functionDeclaration, undefined, delegate, false, false);
  assert.equal(selected.kind === "function" && selected.declaration === functionDeclaration && selected.expression === expression, true,
    "shape selection is not executable implementation admission");
  assert.equal(Object.isFrozen(selected), true);
});

test("external direct method and signature shapes stay available to exact native profile selection", () => {
  for (const declaration of [methodDeclaration, { kind: "KindMethodSignature" },
    { kind: "method", parent: { kind: "class" } }]) {
    for (const kind of ["property", "element"]) {
      const selected = classify(declaration, declaration, { kind, expression, receiver: { expression: receiver } },
        delegate, declaration.parent !== undefined, false);
      assert.equal(selected.kind === "method" && selected.declaration === declaration &&
        selected.receiver.expression === receiver && selected.receiver.type === owner, true,
      `${declaration.kind}/${kind}: pure shape data does not prematurely refuse a native or JS target relation`);
    }
  }
});

test("project callable storage is not rejected merely because its selected signature is external", () => {
  for (const declaration of [variableDeclaration, { kind: "parameter" }, { kind: "property" }]) {
    for (const carrier of [delegate, csharpNullableTargetType(delegate)]) {
      const selected = classify(declaration, functionDeclaration, undefined, carrier, false, false);
      assert.equal(selected.kind === "value" && selected.type === carrier && selected.expression === expression, true,
        `${declaration.kind}: actual native storage is distinct from an external direct callee`);
    }
  }
});

test("project method signatures retain their exact callable protocol without a spelling exception", () => {
  const declaration = { kind: "KindMethodSignature", name: "then" };
  for (const kind of ["property", "element"]) {
    const selected = classify(declaration, declaration, { kind, expression, receiver: { expression: receiver } });
    assert.equal(selected.kind === "method" && selected.declaration === declaration &&
      selected.receiver.expression === receiver && selected.receiver.type === owner, true,
    `${kind}: checked project ownership, not the name then, decides the native method`);
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
    } },
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
      types: { resolveSelectedValue: node => node === receiver ? union : { kind: "source-primitive", name: "uint32" } },
    }, { sourceCallee: { expression }, sourceCalleeAccess: { kind: "property", expression, receiver: { expression: receiver } } }, {});
    assert.equal(selected.kind === "rejected", true, kind);
  }
});
