import assert from "node:assert/strict";
import test from "node:test";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { targetUseSiteIdentity } from "@tsonic/target-api/analysis";
import { checkCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { selectCsharpNativeUseRepresentation } from "../../../dist/policy/conversions/native-use-representation.js";
import { csharpNativeUseSite } from "../../../dist/target-model/records/native/native-demand.js";
import { csharpAbsenceTargetType, csharpRuntimeUnionTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";

const integer = Object.freeze({ kind: "source-primitive", name: "int32" });
const floating = Object.freeze({ kind: "source-primitive", name: "float64" });
const checked = checkCsharpSource({ sourceText: `
  export const literal = 1.0;
  export const binary = 7 / 2;
  export const wrapped = (binary);
  export const list = [binary];
  export const callback = () => binary;
  export const choice = true ? binary : binary;
  export const nothing = null;
  export const missing = undefined;
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
  literal: { kind: "not-applicable" }, callable: undefined, binary: undefined, children: new Map() });
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

test("a selected literal recipe retains its physical construction carrier before conversion", () => {
  const literal = initializer("literal");
  const recipe = Object.freeze({ kind: "float", precision: "float64", target: floating,
    token: Object.freeze({ significand: "1.0" }), negative: false });
  const selected = selectCsharpNativeUseRepresentation({ ...base(literal), target: integer,
    constructionCarrier: floating, literal: Object.freeze({ kind: "resolved", recipe }) });
  assert.equal(selected.kind === "selected" && selected.representation === "convert" && selected.carrier === floating &&
    selected.construction.carrier === floating && selected.literal === recipe && selected.construction.children.length === 0,
  true, "the requested integer cannot replace the literal's selected native floating construction");
  assert.equal(selected.children.length === 1 && selected.children[0] === selected.construction.site &&
    selected.construction.site.subject === literal && selected.construction.site.role === "constructed-result", true,
  "the existing constructed-result boundary owns the conversion without a new carrier or recipe");
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

test("one native absence input cannot substitute for the exact admitted writable storage", () => {
  const target = csharpNullableTargetType(integer);
  const foreign = csharpNullableTargetType(floating);
  for (const name of ["nothing", "missing"]) {
    const input = { ...base(initializer(name)), source: csharpAbsenceTargetType(), target, absent: true, literal: undefined };
    const selected = selectCsharpNativeUseRepresentation(input);
    assert.equal(selected.kind === "selected" && selected.representation === "convert" && selected.carrier === input.source &&
      selected.children.length === 0 && selected.construction === undefined, true,
    `${name}: absence remains a physical input converted to the requested native storage, not a fabricated construction`);
    const stored = selectCsharpNativeUseRepresentation({ ...input, projection: "storage", source: target, absent: false });
    assert.equal(stored.kind === "selected" && stored.representation === "forward" && stored.carrier === target, true,
      `${name}: an exact storage read retains its completed physical carrier`);
    for (const source of [undefined, foreign, input.source]) {
      const missing = selectCsharpNativeUseRepresentation({ ...input, projection: "storage", source });
      assert.equal(missing.kind === "pending" && missing.reason === "source-unresolved", true,
        `${name}:${source === undefined ? "missing" : source === foreign ? "foreign" : "absence"}: no writable storage is invented`);
    }
  }
});
