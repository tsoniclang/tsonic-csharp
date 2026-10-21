import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { selectCsharpAccessorReturnContext, selectCsharpCallableReturnContext } from "../../../dist/policy/types/callables/return-contexts.js";
import { csharpDelegateTargetType, csharpTaskTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { csharpGeneratorTargetType, csharpAsyncGeneratorTargetType } from "../../../dist/target-model/types/carriers/generators.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../dist/target-model/types/equality.js";

const integer = csharpSourcePrimitiveTargetType("int32");
const number = csharpSourcePrimitiveTargetType("float64");
const asyncDeclaration = {};
const getter = {};
const setter = {};
const policy = { ast: {
  hasModifier: (node) => node === asyncDeclaration,
  is: { IsGetAccessorDeclaration: (node) => node === getter },
} };
const evidence = { generator: { get: () => undefined } };
const callable = (sourceDeclaration, returnType) => ({ sourceDeclaration, returnType });

test("a declaration body returns to its exact callable contract, unwrapping only an async Task result", () => {
  const plain = selectCsharpCallableReturnContext(policy, evidence, callable({}, integer));
  assert.equal(plain !== undefined && targetTypeRefEquals(plain.target, integer) && Object.isFrozen(plain), true,
    "plain declaration reads the contract return type as one frozen datum");
  const awaited = selectCsharpCallableReturnContext(policy, evidence, callable(asyncDeclaration, csharpTaskTargetType(integer)));
  assert.equal(awaited !== undefined && targetTypeRefEquals(awaited.target, integer), true, "async declaration returns the Task result");
  assert.equal(selectCsharpCallableReturnContext(policy, evidence, callable(asyncDeclaration, integer)) === undefined, true,
    "an async declaration without a Task contract has no return context");
});

test("a contextual delegate selects the body return target before the declaration contract", () => {
  const contextual = csharpDelegateTargetType("System.Func", [], number);
  const selected = selectCsharpCallableReturnContext(policy, evidence, callable({}, integer), contextual);
  assert.equal(selected !== undefined && targetTypeRefEquals(selected.target, number), true, "delegate return target wins");
  const asyncContextual = csharpDelegateTargetType("System.Func", [], csharpTaskTargetType(number));
  const awaited = selectCsharpCallableReturnContext(policy, evidence, callable(asyncDeclaration, integer), asyncContextual);
  assert.equal(awaited !== undefined && targetTypeRefEquals(awaited.target, number), true, "async delegate returns its Task result");
});

for (const [asynchronous, factory] of [[false, csharpGeneratorTargetType], [true, csharpAsyncGeneratorTargetType]]) {
  test(`a contextual ${asynchronous ? "async" : "sync"} generator body uses its protocol return type`, () => {
    const declaration = {};
    const generatorPolicy = { ast: { hasModifier: () => asynchronous } };
    const generatorEvidence = { generator: { get: node => node === declaration ? {} : undefined } };
    const declared = factory({ yieldType: integer, returnType: integer, nextType: integer });
    const contextual = factory({ yieldType: integer, returnType: number, nextType: integer });
    const contract = callable(declaration, declared);
    const ordinary = selectCsharpCallableReturnContext(generatorPolicy, generatorEvidence, contract);
    assert.equal(ordinary !== undefined && targetTypeRefEquals(ordinary.target, integer), true);
    const selected = selectCsharpCallableReturnContext(generatorPolicy, generatorEvidence, contract,
      csharpDelegateTargetType("System.Func", [], contextual));
    assert.equal(selected !== undefined && targetTypeRefEquals(selected.target, number), true,
      "the context chooses the protocol before projecting its body result, never the wrapper or a Task result");
  });
}

test("a get accessor returns to its resolved return contract; other accessors have no body return target", () => {
  const resolved = selectCsharpAccessorReturnContext(policy, getter, { kind: "resolved", type: number });
  assert.equal(resolved !== undefined && targetTypeRefEquals(resolved.target, number), true, "getter reads its return contract");
  assert.equal(selectCsharpAccessorReturnContext(policy, getter, { kind: "rejected", reason: "x" }) === undefined, true,
    "a rejected contract has no return context");
  assert.equal(selectCsharpAccessorReturnContext(policy, setter, { kind: "resolved", type: number }) === undefined, true,
    "a setter body has no return target");
});

test("the published return context is the target the planner writes return expressions to", () => {
  const compiled = compileCsharpSource({ sourceText: `
    import type { int32 } from "@tsonic/core/types.js";
    export class Box {
      get size(): int32 { return 3 as int32; }
    }
    export function total(value: int32): int32 { return value; }
    export async function later(value: int32): Promise<int32> { return value; }
    export const read = (): number => 1.5;
    export const view = { get count(): number { return 2; } };
  ` });
  const program = compiled.result.program;
  assert.equal(program !== undefined, true, "the program publishes");
  const ast = program.source.ast;
  const found = new Map();
  const visit = (node) => {
    const name = ast.kindName(node);
    if (["KindGetAccessor", "KindFunctionDeclaration", "KindArrowFunction"].includes(name)) {
      const context = program.records.returnContext.get(node);
      found.set(`${name}@${ast.pos(node)}`, context === undefined ? undefined : targetTypeRefKey(context.target));
    }
    ast.forEachChild(node, (child) => { if (child !== undefined) visit(child); });
  };
  for (const file of program.sourceFiles) visit(file);
  const keys = [...found.values()];
  assert.equal(keys.filter((key) => key === "source:int32").length, 3, "class getter, plain and async function return int32");
  assert.equal(keys.filter((key) => key === "source:float64").length, 2, "arrow and object-literal getter return float64");
  assert.equal(keys.every((key) => key !== undefined), true, "every body in this program has one return context");
});
