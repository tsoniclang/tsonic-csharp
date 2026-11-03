import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpLiteralDeclarationContext } from "../../../dist/analysis/objects/native-construction-demand.js";

function fixture() {
  const contexts = new Map();
  const references = new Map();
  const signatures = new Map();
  const flows = new Map();
  const calls = new Map();
  const sourceFile = {};
  const authored = {};
  const node = (kind, fields = {}) => ({ kind, ...fields });
  const child = (parent, selected) => { selected.parent = parent; return selected; };
  const ast = {
    parent: selected => selected?.parent,
    kindName: selected => `Kind${selected.kind}`,
    is: Object.fromEntries(["ParenthesizedExpression", "VariableDeclaration", "ObjectLiteralExpression",
      "PropertyAssignment", "ObjectBindingPattern", "ReturnStatement", "ArrowFunction", "FunctionExpression",
      "VariableDeclarationList", "VariableStatement", "Block", "CallExpression", "ExpressionStatement",
      "Identifier", "ArrayLiteralExpression", "SatisfiesExpression", "NewExpression", "SpreadElement"].map(kind => [`Is${kind}`, selected => selected?.kind === kind])),
    as: Object.fromEntries(["VariableDeclaration", "PropertyAssignment", "ReturnStatement", "CallExpression",
      "ExpressionStatement", "VariableStatement"].map(kind => [`As${kind}`, selected => selected?.kind === kind ? selected : undefined])),
    typeNode: selected => selected?.Type,
    name: selected => selected?.Name,
    body: selected => selected?.Body,
    children: selected => selected?.children ?? [],
    variableDeclarationKind: () => "const",
    arguments: selected => selected?.Arguments?.Nodes ?? [],
    getSourceFile: () => sourceFile,
  };
  const queries = { sourceFile, operations: { call: selected => calls.get(selected) }, types: {
    contextualValueSelection: selected => contexts.has(selected)
      ? { kind: "selected", component: contexts.get(selected) } : { kind: "unavailable" },
    authoredType: () => authored,
    callable: selected => signatures.get(selected),
    isUnion: () => false,
    isNullish: () => false,
  } };
  const host = { ast, navigation: { referenceFor: selected => references.get(selected),
    expressionValueFlow: expression => flows.get(expression),
    declarationUseSummary: () => ({ bindingWritten: false, exported: false }),
  }, semanticsFor: () => queries };
  const declaration = expression => {
    const binding = node("VariableDeclaration", { Initializer: expression });
    child(binding, expression);
    const list = node("VariableDeclarationList");
    child(list, binding);
    const statement = node("VariableStatement", { DeclarationList: list });
    child(statement, list);
    return { binding, statement };
  };
  return { node, child, contexts, references, signatures, authored, declaration, flows, calls,
    select: expression => selectCsharpLiteralDeclarationContext(expression, queries, host) };
}

test("an authored initializer owns its existing selected literal context", () => {
  const state = fixture();
  const expression = state.node("NumericLiteral");
  const { binding } = state.declaration(expression);
  const component = { selectedType: {}, authoredTypeNode: {}, declaration: binding };
  state.contexts.set(expression, component);
  const selected = state.select(expression);
  assert.equal(selected.authority === "own" && selected.component === component &&
    selected.declarations.length === 1 && selected.declarations[0] === binding, true);
});

test("a checker-inferred parameter default is not authored literal authority", () => {
  const state = fixture();
  const expression = state.node("NumericLiteral");
  state.child(state.node("ParameterDeclaration", { Initializer: expression }), expression);
  const component = { selectedType: {} };
  state.contexts.set(expression, component);
  const selected = state.select(expression);
  assert.equal(selected.authority === "inferred" && selected.component === component, true,
    "the default's inferred number cannot declare its own representation");
});

test("a callable created into its own authored signature retains creation authority", () => {
  const state = fixture();
  const expression = state.node("ArrowFunction");
  const { binding } = state.declaration(expression);
  state.contexts.set(expression, { selectedType: {}, authoredTypeNode: {}, declaration: binding });
  assert.equal(state.select(expression).authority, "own",
    "own-created int32 defaults can consume the same creation fact as the signature");
});

test("a direct literal return retains its callable's authored return authority", () => {
  const state = fixture();
  const expression = state.node("NumericLiteral");
  const returning = state.node("ReturnStatement", { Expression: expression });
  state.child(returning, expression);
  const callable = state.node("FunctionDeclaration", { Type: {} });
  state.child(callable, returning);
  const selected = state.select(expression);
  assert.equal(selected.authority === "own" && selected.returnedFrom === callable &&
    selected.component.selectedType === state.authored, true);
});

test("returning an earlier unannotated binding is later-use authority", () => {
  const state = fixture();
  const expression = state.node("ArrayLiteralExpression");
  const { binding, statement } = state.declaration(expression);
  const reference = state.node("Identifier");
  state.references.set(reference, { declaration: binding });
  const returning = state.node("ReturnStatement", { Expression: reference });
  const block = state.node("Block", { children: [statement, returning] });
  state.child(block, statement);
  state.child(block, returning);
  state.child(returning, reference);
  state.child(state.node("FunctionDeclaration", { Type: {} }), block);
  state.flows.set(expression, { aliasDeclarations: [binding], exported: false, storedOutsideBinding: false,
    uses: [{ reference, kind: "first-class", role: "return", captured: false, throughMember: false }] });
  const selected = state.select(expression);
  assert.equal(selected.authority === "later-use" && selected.declarations[0] === binding, true,
    "nonliteral destination evidence stays available without retyping earlier integer contributions");
});

test("passing an earlier binding to a declared parameter stays a later use", () => {
  const state = fixture();
  const expression = state.node("ArrayLiteralExpression");
  const { binding, statement } = state.declaration(expression);
  const reference = state.node("Identifier");
  state.references.set(reference, { declaration: binding });
  const component = { selectedType: {}, authoredTypeNode: {} };
  state.contexts.set(reference, component);
  const call = state.node("CallExpression", { Arguments: { Nodes: [reference] } });
  state.child(call, reference);
  const selectedCall = { call, sourceSelectedSignatureKind: "resolved",
    sourceArguments: [{ expression: reference }],
    sourceSelectedSignatureParameters: [{ parameterIndex: 0, parameterDeclaration: state.node("ParameterDeclaration"),
      authoredTypeNode: component.authoredTypeNode }],
    sourceArgumentBindings: [{ sourceArgumentIndex: 0, effectiveArgumentIndex: 0, sourceParameterIndex: 0,
      sourceForm: "value", selectedParameterType: component.selectedType }],
  };
  component.contextualCall = selectedCall;
  state.calls.set(call, selectedCall);
  state.flows.set(expression, { aliasDeclarations: [binding], exported: false, storedOutsideBinding: false,
    uses: [{ reference, kind: "first-class", role: "argument", captured: false, throughMember: false }] });
  const following = state.node("ExpressionStatement", { Expression: call });
  const block = state.node("Block", { children: [statement, following] });
  state.child(block, statement);
  state.child(block, following);
  const selected = state.select(expression);
  assert.equal(selected.authority === "later-use" && selected.component === component && selected.source === reference, true);
});

test("a direct checked argument keeps its parameter-creation authority", () => {
  const state = fixture();
  const expression = state.node("NumericLiteral");
  const component = { selectedType: {}, contextualCall: {} };
  state.contexts.set(expression, component);
  const selected = state.select(expression);
  assert.equal(selected.authority === "own" && selected.component === component, true,
    "native parameter completion still uses the existing checked call correspondence");
});

test("an inferred callback result does not manufacture an authored return type", () => {
  const state = fixture();
  const expression = state.node("NumericLiteral");
  const callable = state.node("ArrowFunction", { Body: expression });
  state.child(callable, expression);
  const selectedType = {};
  const result = { selectedType: {} };
  state.contexts.set(callable, { selectedType });
  state.signatures.set(selectedType, { result });
  const selected = state.select(expression);
  assert.equal(selected.authority === "inferred" && selected.component === result, true,
    "checker inference is provenance, not an authored numeric destination");
});
