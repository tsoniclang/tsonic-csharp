import assert from "node:assert/strict";
import test from "node:test";
import { formCsharpProjectThisSource, formCsharpProjectInstanceSource,
  resolveFormedCsharpProjectInstanceTargetType } from "../../../dist/analysis/source-evidence/types/resolution/project-instance-source.js";
import { resolveProjectConstructingReceiverTargetType } from "../../../dist/analysis/source-evidence/types/resolution/expressions.js";
import * as expressionQueries from "../../../dist/analysis/source-evidence/types/resolution/expressions.js";
import { resolveFormedCsharpNodeTypeSource } from "../../../dist/analysis/source-evidence/types/resolution/nodes.js";

function unitAst() {
  return {
    parent: node => node?.parent,
    kindName: node => node.kind === "this" ? "KindThisKeyword"
      : node.kind === "static-block" ? "KindClassStaticBlockDeclaration" : node.kind,
    hasModifierKind: (node, modifier) => modifier === "static" && node.static === true,
    is: {
      IsThisTypeNode: node => node.kind === "this-type",
      IsArrowFunction: node => node.kind === "arrow",
      IsFunctionDeclaration: node => node.kind === "function",
      IsFunctionExpression: node => node.kind === "function-expression",
      IsMethodDeclaration: node => node.kind === "method",
      IsGetAccessorDeclaration: node => node.kind === "getter",
      IsSetAccessorDeclaration: node => node.kind === "setter",
      IsConstructorDeclaration: node => node.kind === "constructor",
      IsPropertyDeclaration: node => node.kind === "property",
      IsClassDeclaration: node => node.kind === "class",
      IsClassExpression: node => node.kind === "class-expression",
    },
  };
}

test("synthetic project receiver capture keeps its exact class frame and the actual ABI binder vector", () => {
  const declaration = { kind: "class" };
  const member = { kind: "method", parent: declaration };
  const node = { kind: "this", parent: { kind: "arrow", parent: member } };
  const source = formCsharpProjectThisSource(unitAst(), node);
  assert.equal(source.kind === "class" && source.node === node && source.member === member &&
    source.declaration === declaration, true, "an arrow retains the original class receiver frame");
  const bindings = Object.freeze([{ kind: "type-parameter", identity: "unit:Item", name: "Item" }]);
  const owner = { declaration, typeParameterBindings: bindings };
  const target = { kind: "target-named", id: "unit:Owner", name: "Owner", typeArguments: bindings };
  const order = [];
  const selected = resolveFormedCsharpProjectInstanceTargetType({ host: { projectTypeABI() {
    order.push("abi");
    return { catalog: {
      definitionForDeclaration(value) {
        order.push("definition");
        assert.equal(value === declaration, true, "native lookup consumes the captured declaration");
        return owner;
      },
      targetTypeForDeclaration(value, arguments_) {
        order.push("target");
        assert.equal(value === declaration && arguments_ === bindings, true, "the actual physical ABI vector is not rebuilt or emptied");
        return target;
      },
    } };
  } } }, source);
  assert.equal(selected === target, true, "the owning ABI supplies the target without an AST capability");
  assert.deepEqual(order, ["abi", "definition", "target"]);
});

test("synthetic receiver selection preserves ordinary-function, static and object-literal boundaries", () => {
  const declaration = { kind: "class" };
  const member = { kind: "method", parent: declaration };
  const nodes = [
    { kind: "this", parent: { kind: "function", parent: member } },
    { kind: "this", parent: { kind: "function-expression", parent: member } },
    { kind: "this", parent: { kind: "method", static: true, parent: declaration } },
    { kind: "this", parent: { kind: "static-block", parent: declaration } },
    { kind: "this", parent: { kind: "method", parent: { kind: "object-literal" } } },
    { kind: "this", parent: { kind: "property" } },
    { kind: "this" },
  ];
  const scope = { host: { projectTypeABI: () => assert.fail("unavailable source must not request an ABI") } };
  for (const node of nodes) {
    const source = formCsharpProjectThisSource(unitAst(), node);
    assert.equal(source.kind === "unavailable" && source.node === node, true, "the original boundary is retained, not a fabricated object self target");
    assert.equal(resolveFormedCsharpProjectInstanceTargetType(scope, source), undefined);
  }
  const nonReceiver = { kind: "identifier", parent: member };
  assert.equal(formCsharpProjectThisSource({ ...unitAst(), parent: () => assert.fail("a nonreceiver must not walk parents") },
    nonReceiver).kind, "unavailable");
  for (const kind of ["getter", "setter", "constructor", "property"]) {
    const owner = { kind: "class-expression" };
    const selectedMember = { kind, parent: owner };
    const node = { kind: "this-type", parent: selectedMember };
    const source = formCsharpProjectThisSource(unitAst(), node);
    assert.equal(source.kind === "class" && source.declaration === owner && source.member === selectedMember, true,
      "all original instance-member and class-expression forms keep their selected owner");
  }
});

test("the constructing-super query uses the same Source owner and preserves actual ABI unavailability", () => {
  const declaration = { kind: "class" };
  const member = { kind: "constructor", parent: declaration };
  const superKeyword = { kind: "super", parent: member };
  const source = formCsharpProjectInstanceSource(unitAst(), superKeyword);
  assert.equal(source.kind === "class" && source.declaration === declaration && source.member === member, true);
  const target = { kind: "target-named", id: "unit:Constructing", name: "Constructing" };
  const owner = { declaration, typeParameterBindings: [] };
  const host = { ast: unitAst(), projectTypeABI: () => ({ catalog: {
    definitionForDeclaration: value => value === declaration ? owner : undefined,
    targetTypeForDeclaration: (value, arguments_) => value === declaration && arguments_ === owner.typeParameterBindings ? target : undefined,
  } }) };
  assert.equal(resolveProjectConstructingReceiverTargetType({ host }, superKeyword) === target, true,
    "super uses the enclosing instance, not the checked base-constructor function");
  assert.equal(resolveFormedCsharpProjectInstanceTargetType({ host: { projectTypeABI: () => ({ catalog: {
    definitionForDeclaration: () => undefined, targetTypeForDeclaration: () => assert.fail("a missing owner has no target"),
  } }) } }, source), undefined);
  const unavailable = new Error("synthetic actual ABI publication is unavailable");
  assert.throws(() => resolveFormedCsharpProjectInstanceTargetType({ host: { projectTypeABI: () => { throw unavailable; } } }, source),
    error => error === unavailable);
});

test("native Node input requires the same project-instance occurrence and has no retired raw this resolver", () => {
  const node = {};
  const input = { kind: "node", node, nativeParameter: { parameter: node } };
  assert.throws(() => resolveFormedCsharpNodeTypeSource({}, input), /exact retained Source node/);
  assert.throws(() => resolveFormedCsharpNodeTypeSource({}, { ...input,
    projectInstance: { kind: "unavailable", node: {} } }), /exact retained Source node/);
  assert.equal(Object.hasOwn(expressionQueries, "resolveProjectThisTargetType"), false,
    "the required Source input replaces the old raw entry instead of adding a compatibility form");
});
