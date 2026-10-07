import assert from "node:assert/strict";
import test from "node:test";
import { classifyCsharpNativeLocation } from "../../../dist/analysis/storage/native-locations.js";
import { classifyCsharpClassPropertyStorage } from "../../../dist/analysis/operations/class-property-storage.js";

const integer = { kind: "source-primitive", name: "int32" };
const owner = { kind: "target-named", id: "Project.Owner" };
const sourceFile = { kind: "file" };
const physical = { nativeBacking: () => undefined, nativeField: () => undefined,
  nativeArray: () => undefined, type: () => undefined };
const ast = {
  is: Object.fromEntries([
    ["ParenthesizedExpression", "parentheses"], ["Identifier", "identifier"],
    ["VariableDeclaration", "variable"], ["VariableDeclarationList", "variable-list"],
    ["VariableStatement", "variable-statement"], ["SourceFile", "file"],
    ["BindingElement", "binding"], ["ParameterDeclaration", "parameter"],
    ["CallExpression", "call"], ["PropertyAccessExpression", "property"],
    ["ElementAccessExpression", "element"], ["ClassDeclaration", "class"],
    ["ClassExpression", "class-expression"], ["PropertyDeclaration", "field"],
    ["GetAccessorDeclaration", "getter"], ["SetAccessorDeclaration", "setter"],
    ["InterfaceDeclaration", "interface"], ["PropertySignatureDeclaration", "signature"],
    ["ExpressionStatement", "expression-statement"], ["ReturnStatement", "return"],
    ["ThrowStatement", "throw"], ["IfStatement", "if"], ["WhileStatement", "while"],
    ["DoStatement", "do"], ["ForOfStatement", "for-of"], ["ForInStatement", "for-in"],
  ].map(([name, kind]) => [`Is${name}`, node => node?.kind === kind])),
  as: { AsVariableDeclaration: node => node, AsPropertyDeclaration: node => node,
    AsParenthesizedExpression: node => node, AsPropertyAccessExpression: node => node,
    AsElementAccessExpression: node => node },
  parent: node => node?.parent,
  kindName: node => ({ class: "KindClassDeclaration", "class-expression": "KindClassExpression",
    field: "KindPropertyDeclaration", identifier: "KindIdentifier", parameter: "KindParameter" })[node?.kind],
  name: node => node?.name,
  text: node => node?.text ?? "",
  members: node => node.members ?? [],
  getSourceFile: () => undefined,
  hasModifierKind: (node, kind) => node.modifiers?.includes(kind) === true,
  variableDeclarationKind: node => node.mode ?? "let",
  forEachChild: (node, visit) => node.children?.forEach(visit),
};

function fixture(kind = "identifier", options = {}) {
  const declaration = options.declaration ?? { kind: "variable" };
  const receiver = options.receiver ?? { kind: "identifier" };
  const expression = { kind, Expression: receiver };
  const storage = { expression, storageExpression: expression, declaration,
    writable: options.writable !== false };
  const source = { expression, selectedDeclaration: declaration,
    receiver: { expression: receiver, type: {} }, argument: { expression: { kind: "index" }, type: {} }, writable: storage.writable,
    accessMode: "write", optionalChain: options.optional === true };
  const semantics = { operations: {
    storage: node => node === expression ? storage : options.receiverStorage,
    propertyAccess: node => node === expression && kind === "property" ? source : undefined,
    elementAccess: node => node === expression && kind === "element" ? source : undefined,
  }, facts: { selectedSubjects: () => [declaration] },
    types: { selectIndexedAccess: () => undefined } };
  const policy = { ast,
    navigation: { referenceFor: node => ({ declaration: node === expression ? declaration : options.receiverStorage?.declaration }),
      isProjectDeclaration: () => false },
    semantics: () => semantics, semanticsFor: () => semantics,
    types: { resolveNode: node => node === receiver ? options.receiverType ?? owner : integer,
      resolveReadStorage: node => node === receiver ? options.receiverType ?? owner : options.storageType ?? integer,
      resolveStorage: () => options.receiverType ?? owner,
      resolveSelectedValue: () => options.receiverType ?? owner, nativeFlowTypes: () => undefined },
    objectShapes: { resolveTarget: () => undefined },
    providers: { findTargetBindingByTargetId: () => undefined },
  };
  return { expression, declaration, receiver, policy, storage };
}

function select(input, classStorage = "field", storage = physical) {
  return classifyCsharpNativeLocation(input.policy, input.expression, sourceFile, () => classStorage, storage);
}

for (const kind of ["variable", "parameter", "binding"]) {
  test(`native ${kind} address retains the exact original storage`, () => {
    const input = fixture("identifier", { declaration: { kind } });
    const selected = select(input);
    assert.equal(selected.kind, "resolved");
    assert.equal(selected.expression, input.expression);
    assert.equal(selected.storageType, integer);
    assert.equal(selected.assignment, "direct");
    assert.deepEqual(selected.address, { passing: "byref-readwrite", capturedReferenceCrossesSuspension: false });
    assert.ok(Object.isFrozen(selected));
    assert.ok(Object.isFrozen(selected.address));
  });
}

test("const source bindings retain mutable physical locals without allowing source reassignment", () => {
  const selected = select(fixture("identifier", { writable: false }));
  assert.equal(selected.writable, false);
  assert.equal(selected.address.passing, "byref-readwrite");
});

test("module properties and unproven names cannot manufacture managed addresses", () => {
  const declaration = { kind: "variable", parent: { kind: "variable-list", parent: {
    kind: "variable-statement", parent: sourceFile } } };
  assert.equal(select(fixture("identifier", { declaration })).address, undefined);
  assert.equal(select(fixture("identifier", { declaration: { kind: "unresolved" } })).address, undefined);
});

test("physical native backing never masquerades as an ordinary managed local", () => {
  const input = fixture();
  const selected = select(input, "field", { ...physical,
    nativeBacking: node => node === input.declaration ? { pointeeType: integer } : undefined });
  assert.equal(selected.kind, "resolved");
  assert.equal(selected.storageType, integer);
  assert.equal(selected.address, undefined);
  assert.equal(selected.nativeCell.kind, "local");
  assert.equal(selected.nativeCell.layout.pointeeType, integer);
});

test("native-backed identity retains exact layout and rejects a different physical pointee", () => {
  const input = fixture();
  const layout = Object.freeze({ pointeeType: integer });
  const selected = select(input, "field", { ...physical, nativeBacking: () => layout });
  assert.equal(selected.nativeCell.layout, layout);
  assert.ok(Object.isFrozen(selected.nativeCell));
  const rejected = select(input, "field", { ...physical,
    nativeBacking: () => ({ pointeeType: { kind: "source-primitive", name: "uint64" } }) });
  assert.equal(rejected.kind, "rejected");
  assert.match(rejected.reason, /pointee carrier/u);
});

test("native-backed array cells keep pointer-cell identity without inventing a managed address", () => {
  const input = fixture("element");
  const backing = Object.freeze({ kind: "element", layout: Object.freeze({ pointeeType: integer }), stride: 4 });
  const selected = select(input, "field", { ...physical, nativeArray: () => backing });
  assert.equal(selected.nativeCell.backing, backing);
  assert.equal(selected.address, undefined);
  assert.ok(Object.isFrozen(selected.nativeCell));
  const array = select(input, "field", { ...physical, nativeArray: () => ({ ...backing, kind: "reference" }) });
  assert.equal(array.nativeCell, undefined);
  assert.equal(array.address, undefined);
});

test("a native class field is addressable only through its sealed field representation", () => {
  const input = fixture("property", { declaration: { kind: "field" } });
  assert.equal(select(input, "field").address.passing, "byref-readwrite");
  const property = select(input, "property");
  assert.equal(property.kind, "resolved");
  assert.equal(property.assignment, "reference-receiver");
  assert.equal(property.address, undefined);
  assert.equal(select(input, null).address, undefined);
});

test("optional member selection is not a native writable location", () => {
  const selected = select(fixture("property", { declaration: { kind: "field" }, optional: true }));
  assert.equal(selected.kind, "rejected");
  assert.match(selected.reason, /optional/u);
});

test("native array element addresses require their exact element storage carrier", () => {
  const array = { kind: "array", element: integer };
  assert.equal(select(fixture("element", { receiverType: array })).address.passing, "byref-readwrite");
  assert.equal(select(fixture("element", { receiverType: owner })).address, undefined);
  assert.equal(select(fixture("element", { receiverType: array,
    storageType: { kind: "source-primitive", name: "int64" } })).address, undefined);
});

test("value receiver fields do not take an address of a copied temporary", () => {
  const value = { ...owner, csharpValueType: true };
  const input = fixture("property", { declaration: { kind: "field" }, receiverType: value });
  assert.equal(select(input).address, undefined);
  input.policy.semantics().operations.storage = node => node === input.expression ? input.storage
    : { storageExpression: input.receiver, declaration: { kind: "variable" }, writable: true };
  const selected = select(input);
  assert.equal(selected.address.passing, "byref-readwrite");
  assert.equal(selected.receiver.expression, input.receiver);
  assert.ok(Object.isFrozen(selected.receiver));
});

test("value-type setters capture their receiver storage rather than a nonexistent property address", () => {
  const value = { ...owner, csharpValueType: true };
  const input = fixture("property", { declaration: { kind: "field" }, receiverType: value });
  input.policy.semantics().operations.storage = node => node === input.expression ? input.storage
    : { storageExpression: input.receiver, declaration: { kind: "variable", mode: "const" }, writable: false };
  const selected = select(input, "property");
  assert.equal(selected.address, undefined);
  assert.equal(selected.receiver.expression, input.receiver);
  assert.equal(selected.receiver.address.passing, "byref-readwrite");
});

test("managed address proof uses sealed physical storage rather than a narrower source read", () => {
  const input = fixture();
  const optional = { kind: "target-named", id: "System.Nullable", typeArguments: [integer], csharpValueType: true };
  const selected = select(input, "field", { ...physical, type: node => node === input.declaration ? optional : undefined });
  assert.equal(selected.storageType, optional);
  assert.equal(selected.address.passing, "byref-readwrite");
});

test("readonly native fields stay readonly despite mutable reference receivers", () => {
  const selected = select(fixture("property", { declaration: { kind: "field" }, writable: false }));
  assert.equal(selected.address.passing, "byref-readonly");
});

test("missing exact carrier or storage fails closed rather than guessing a location", () => {
  const input = fixture();
  input.policy.types.resolveReadStorage = () => undefined;
  assert.equal(select(input).kind, "rejected");
  input.policy.types.resolveReadStorage = () => integer;
  input.policy.semantics().operations.storage = () => undefined;
  assert.equal(select(input).kind, "rejected");
});

test("class declaration emission and byref checking share one immutable representation authority", () => {
  const named = text => ({ kind: "identifier", text });
  const field = { kind: "field", name: named("direct") };
  const contractual = { kind: "field", name: named("contractual") };
  const inherited = { kind: "field", name: named("inherited") };
  const overridden = { kind: "field", name: named("overridden") };
  const structural = { kind: "field", name: named("structural") };
  const explicit = { kind: "field", name: named("contractual") };
  const parentInterface = { kind: "interface", members: [{ kind: "signature", name: named("inherited") }] };
  const directInterface = { kind: "interface", members: [{ kind: "signature", name: named("contractual") }] };
  const declaration = { kind: "class", members: [field, contractual, inherited, overridden, structural, explicit] };
  const root = { kind: "file", children: [declaration] };
  const heritage = node => ({ kind: "resolved", edges: node === declaration
    ? [{ kind: "implements", target: { declaration: directInterface } }]
    : node === directInterface ? [{ kind: "extends", target: { declaration: parentInterface } }]
    : node === parentInterface ? [{ kind: "extends", target: { declaration: directInterface } }] : [] });
  const policy = { ast, sourceFiles: [root], navigation: { declaredHeritage: heritage,
    memberDispatch: node => node === overridden ? { overridesBase: true } : undefined },
    objectShapes: { resolveNode: () => ({ implements: [owner], members: [
      { memberKind: "property", sourceName: "structural", targetName: "structural" } ] }) } };
  const evidence = { isCompileTimeMetadata: () => false,
    sourceField: subjects => subjects[0] === explicit ? {} : undefined };
  const selected = classifyCsharpClassPropertyStorage(policy, evidence);
  assert.equal(selected(field), "field");
  for (const node of [contractual, inherited, overridden, structural]) assert.equal(selected(node), "property");
  assert.equal(selected(explicit), "field");
  assert.equal(selected({ kind: "field", name: named("direct") }), undefined);
  policy.objectShapes.resolveNode = () => { throw Error("Sealed queries must not reconstruct emission decisions"); };
  assert.equal(selected(field), "field");
});
