import assert from "node:assert/strict";
import test from "node:test";
import { analyzeSourceLiteralValues, createTargetSourceProgram } from "@tsonic/target-api/source";
import { targetUseSiteIdentity } from "@tsonic/target-api/analysis";
import { checkCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { selectCsharpNativeUseRepresentation } from "../../../dist/policy/conversions/native-use-representation.js";
import { csharpNativeUseSite } from "../../../dist/target-model/records/native-demand.js";
import { csharpRuntimeUnionTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { selectCsharpExactLiteralConversion } from "../../../dist/policy/conversions/literals.js";
import { csharpObjectTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpTsValueTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";

const integer = Object.freeze({ kind: "source-primitive", name: "int32" });
const floating = Object.freeze({ kind: "source-primitive", name: "float64" });
const checked = checkCsharpSource({ sourceText: `
  export const binary = 7 / 2;
  export const wrapped = (binary);
  export const list = [binary];
  export const callback = () => binary;
  export const choice = true ? binary : binary;
  export const wide = 1e40;
  export const wideWrapped = (1e40);
  export const wideSatisfied = 1e40 satisfies number;
` });
assert.equal(checked.sourceDiagnosticsText === "", true, checked.sourceDiagnosticsText);
const source = createTargetSourceProgram(checked.source);
const ast = source.ast;
const nodes = [];
const walk = node => { nodes.push(node); ast.forEachChild(node, child => { if (child !== undefined) walk(child); }); };
for (const file of source.sourceFiles) walk(file);
const initializer = name => {
  const declaration = nodes.find(node => ast.is.IsVariableDeclaration(node) && ast.text(ast.name(node)) === name);
  return ast.as.AsVariableDeclaration(declaration).Initializer;
};
const base = expression => ({ ast, expression, target: integer, source: floating, mode: "implicit", absent: false,
  literal: { kind: "not-applicable" }, sourceLiteral: { kind: "not-applicable" }, storage: undefined,
  callable: undefined, binary: undefined, children: new Map() });
const edge = (input, expression, slot, target) => {
  const site = csharpNativeUseSite(input.expression, slot, { target, mode: input.mode });
  input.children.set(targetUseSiteIdentity(site), { site, expression, target });
  return site;
};

test("binary physical carriers come from the selected operation, not requested results or integer summaries", () => {
  for (const [name, carrier, target] of [["float to integer", floating, integer], ["integer to float", integer, floating]]) {
    const input = { ...base(initializer("binary")), target, literal: { kind: "source-representation" } };
    const expression = ast.as.AsBinaryExpression(input.expression);
    input.binary = { kind: "resolved", sourceOperator: "/", targetOperation: { kind: "operator", operator: "/" },
      left: expression.Left, right: expression.Right, leftType: carrier, rightType: carrier,
      leftInputType: carrier, rightInputType: carrier, resultType: carrier };
    edge(input, expression.Left, { kind: "operand", position: "left" }, carrier);
    edge(input, expression.Right, { kind: "operand", position: "right" }, carrier);
    const selected = selectCsharpNativeUseRepresentation(input);
    assert.equal(selected.kind === "selected" && selected.representation === "convert" && selected.carrier === carrier && selected.children.length === 2,
      true, name);
    input.children.clear();
    assert.equal(selectCsharpNativeUseRepresentation(input).reason, "forwarding-child-unresolved", "no positional/target fallback");
  }
});

test("forwarding requires the exact child, target and mode", () => {
  const input = base(initializer("wrapped"));
  const child = ast.as.AsParenthesizedExpression(input.expression).Expression;
  edge(input, child, { kind: "operand", position: "only" }, floating);
  assert.equal(selectCsharpNativeUseRepresentation(input).reason, "forwarding-child-unresolved", "native-use-representations:57: selectCsharpNativeUseRepresentation(input).reason");
  const expected = edge(input, child, { kind: "operand", position: "only" }, integer);
  const selected = selectCsharpNativeUseRepresentation(input);
  assert.equal(selected.kind === "selected" && selected.representation === "forward" && selected.children[0] === expected, true, "native-use-representations:60: selected.kind === \"selected\" && selected.representation === \"forward\" && selected.children");
});

test("constructing C then converting to T retains the physical carrier independently", () => {
  const carrier = Object.freeze({ kind: "array", element: integer });
  const target = Object.freeze({ kind: "array", element: floating });
  const input = { ...base(initializer("list")), target, constructionCarrier: carrier };
  const element = ast.elements(input.expression)[0];
  const site = edge(input, element, { kind: "element", index: 0 }, integer);
  const selected = selectCsharpNativeUseRepresentation(input);
  assert.equal(selected.kind === "selected" && selected.representation === "convert" && selected.carrier === carrier &&
    selected.construction.carrier === carrier && selected.construction.children[0] === site && selected.children[0] === selected.construction.site, true, "native-use-representations:71: selected.kind === \"selected\" && selected.representation === \"convert\" && selected.carrier ");
  assert.equal(Object.isFrozen(selected) && Object.isFrozen(selected.construction) && Object.isFrozen(selected.children), true, "native-use-representations:72: Object.isFrozen(selected) && Object.isFrozen(selected.construction) && Object.isFrozen(sel");
});

test("an authored numeric union contribution keeps its selected physical construction carrier", () => {
  const literal = ast.as.AsBinaryExpression(initializer("binary")).Left;
  const target = csharpRuntimeUnionTargetType([integer, floating]);
  const selected = selectCsharpNativeUseRepresentation({ ...base(literal), source: integer, target,
    constructionCarrier: floating, literal: Object.freeze({ kind: "source-representation" }) });
  assert.equal(selected.kind === "selected" && selected.representation === "convert" && selected.carrier === floating &&
    selected.construction.carrier === floating && selected.construction.children.length === 0 && selected.children.length === 1 &&
    selected.children[0] === selected.construction.site && selected.construction.site.subject === literal &&
    selected.construction.site.role === "constructed-result", true,
  "the actual floating literal arm is constructed before union injection, not chosen from the integer source default");
  assert.equal(Object.isFrozen(selected) && Object.isFrozen(selected.construction) && Object.isFrozen(selected.children), true,
    "the selected scalar stage is immutable data in the existing native-use contract");
});

test("an explicit native float32 cast constructs the finite double literal before conversion", () => {
  const expression = initializer("wide");
  const single = Object.freeze({ kind: "source-primitive", name: "float32" });
  const values = analyzeSourceLiteralValues(ast, source.sourceFiles);
  const literal = values.literalValue.get(expression);
  const input = { ...base(expression), target: single, mode: "explicit",
    literal: selectCsharpExactLiteralConversion(literal, single),
    sourceLiteral: selectCsharpExactLiteralConversion(literal, floating) };
  assert.equal(input.literal.kind === "rejected" && input.sourceLiteral.kind === "source-representation", true,
    "the actual token exceeds the direct float32 literal range but remains a finite native double literal");
  const selected = selectCsharpNativeUseRepresentation(input);
  assert.equal(selected.kind === "selected" && selected.representation === "convert" && selected.carrier === floating &&
    selected.literal === undefined && selected.construction?.carrier === floating &&
    selected.children[0] === selected.construction.site, true,
  "one actual double construction precedes the admitted native explicit cast; no out-of-range F token is emitted");
  const implicit = selectCsharpNativeUseRepresentation({ ...input, mode: "implicit" });
  assert.equal(implicit.kind === "pending" && implicit.reason === "literal-rejected" &&
    implicit.message === input.literal.reason, true, "implicit native float32 construction still refuses the exact overflow");
  const missing = selectCsharpNativeUseRepresentation({ ...input, sourceLiteral: undefined });
  assert.equal(missing.kind === "pending" && missing.reason === "literal-unrequested", true,
    "the cast cannot borrow an unrequested source literal endpoint");
  const sourceRefusal = Object.freeze({ kind: "rejected", reason: "The actual double source literal is out of range." });
  const rejected = selectCsharpNativeUseRepresentation({ ...input, sourceLiteral: sourceRefusal });
  assert.equal(rejected.kind === "pending" && rejected.reason === "literal-rejected" &&
    rejected.message === sourceRefusal.reason, true, "a rejected source construction is never rescued by its destination cast");
});

test("an explicit floating cast retains exact wrapper children instead of a direct target literal", () => {
  const single = Object.freeze({ kind: "source-primitive", name: "float32" });
  const values = analyzeSourceLiteralValues(ast, source.sourceFiles);
  for (const name of ["wideWrapped", "wideSatisfied"]) {
    const expression = initializer(name);
    const operand = ast.is.IsParenthesizedExpression(expression) ? ast.as.AsParenthesizedExpression(expression).Expression
      : ast.as.AsSatisfiesExpression(expression).Expression;
    const literal = values.literalValue.get(expression);
    const input = { ...base(expression), target: single, mode: "explicit",
      literal: selectCsharpExactLiteralConversion(literal, single),
      sourceLiteral: selectCsharpExactLiteralConversion(literal, floating) };
    assert.equal(selectCsharpNativeUseRepresentation(input).reason, "forwarding-child-unresolved", name);
    const child = edge(input, operand, { kind: "operand", position: "only" }, single);
    const selected = selectCsharpNativeUseRepresentation(input);
    assert.equal(selected.kind === "selected" && selected.representation === "forward" && selected.carrier === single &&
      selected.literal === undefined && selected.children.length === 1 && selected.children[0] === child, true,
    `${name}: the actual admitted child performs the native cast once, never a substituted out-of-range F literal`);
  }
});

test("the exact native consumer selects raw storage once without undoing unrelated value refinement", () => {
  const source = csharpObjectTargetType();
  const storage = csharpTsValueTargetType();
  const expression = ast.as.AsParenthesizedExpression(initializer("wrapped")).Expression;
  const input = { ...base(expression), source, storage, target: storage };
  const raw = selectCsharpNativeUseRepresentation(input);
  assert.equal(raw.kind === "selected" && raw.representation === "forward" && raw.carrier === storage &&
    raw.readProjection === "storage", true,
  "the actual physical carrier is reused when and only when the admitted destination is that same carrier");
  const projected = selectCsharpNativeUseRepresentation({ ...input, target: source });
  assert.equal(projected.kind === "selected" && projected.representation === "forward" && projected.carrier === source &&
    projected.readProjection === "projected", true,
  "a distinct value consumer keeps its checked refinement rather than a raw-storage fallback");
});

test("a parenthesized physical contribution forwards to its exact construction carrier before injection", () => {
  const input = { ...base(initializer("wrapped")), target: csharpRuntimeUnionTargetType([integer, floating]),
    constructionCarrier: floating, literal: { kind: "source-representation" } };
  const operand = ast.as.AsParenthesizedExpression(input.expression).Expression;
  edge(input, operand, { kind: "operand", position: "only" }, input.target);
  assert.equal(selectCsharpNativeUseRepresentation(input).reason, "forwarding-child-unresolved",
    "the target union is not a substitute for the selected physical literal arm");
  const physical = edge(input, operand, { kind: "operand", position: "only" }, floating);
  const selected = selectCsharpNativeUseRepresentation(input);
  assert.equal(selected.kind === "selected" && selected.representation === "convert" && selected.carrier === floating &&
    selected.construction.children.length === 1 && selected.construction.children[0] === physical, true,
  "a transparent wrapper keeps the actual operand-to-physical and physical-to-union boundaries");
});

test("unrequested, rejected and callable physical data never acquire the requested carrier by inference", () => {
  const expression = initializer("callback");
  for (const [literal, callable, reason] of [
    [undefined, undefined, "literal-unrequested"],
    [{ kind: "rejected", reason: "range" }, undefined, "literal-rejected"],
    [{ kind: "not-applicable" }, undefined, "callable-creation"],
    [{ kind: "not-applicable" }, { kind: "discarded" }, "callable-discarded"],
  ]) assert.equal(selectCsharpNativeUseRepresentation({ ...base(expression), literal, callable }).reason, reason, "native-use-representations:82: selectCsharpNativeUseRepresentation({ ...base(expression), literal, callable }).reason");
  const selected = selectCsharpNativeUseRepresentation({ ...base(expression), callable: { kind: "selected", carrier: floating } });
  assert.equal(selected.kind === "selected" && selected.carrier === floating && selected.representation === "convert", true, "native-use-representations:84: selected.kind === \"selected\" && selected.carrier === floating && selected.representation =");
});

test("conditional result forwarding retains both alternative uses without treating either as an unconditional evaluation", () => {
  const input = base(initializer("choice"));
  const conditional = ast.as.AsConditionalExpression(input.expression);
  const whenTrue = edge(input, conditional.WhenTrue, { kind: "branch", branch: "true" }, integer);
  const whenFalse = edge(input, conditional.WhenFalse, { kind: "branch", branch: "false" }, integer);
  const selected = selectCsharpNativeUseRepresentation(input);
  assert.equal(selected.kind === "selected" && selected.representation === "forward" && selected.children[0] === whenTrue &&
    selected.children[1] === whenFalse && selected.children.length === 2, true, "native-use-representations:94: selected.kind === \"selected\" && selected.representation === \"forward\" && selected.children");
});
