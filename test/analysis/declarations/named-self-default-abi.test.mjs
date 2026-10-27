import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { getCsharpDelegateSignature } from "../../../dist/target-model/types/carriers/delegates.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";

for (const surface of ["native", "js"]) {
  test(`a required external callable preserves omitted named-self defaults on ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
let hits = 0;
function fallback(): number { hits += 1; return 7; }
export function run(): boolean {
  hits = 0;
  const f: (x: number) => number = function inner(x: number = fallback()): number {
    return x === 0 ? inner() : x;
  };
  const alias = f;
  return alias(0) === 7 && hits === 1 && f(3) === 3 && hits === 1;
}` });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    const ast = program.source.ast;
    const pending = [...csharpProgramSourceFiles(program)];
    let defaults = 0;
    while (pending.length !== 0) {
      const node = pending.pop();
      const owner = ast.parent(node);
      if (ast.is.IsParameterDeclaration(node) && owner !== undefined && ast.is.IsFunctionExpression(owner) &&
        ast.as.AsParameterDeclaration(node).Initializer !== undefined) {
        const selected = program.records.runtimeDefault.get(node);
        const carrier = program.records.callableTarget.get(owner);
        const signature = getCsharpDelegateSignature(carrier);
        assert.equal(selected?.kind === "nullable" && selected.acceptsOmission, true,
          "the canonical body retains actual authored omission and its initializer");
        assert.equal(signature !== undefined && targetTypeRefEquals(signature.parameters[0], selected.parameterType), true,
          "external creation and internal self calls use one exact native input carrier");
        defaults += 1;
      }
      ast.forEachChild(node, child => { if (child !== undefined) pending.push(child); });
    }
    assert.equal(defaults, 1, "one canonical default body");
    const output = [...compiled.artifacts.values()].join("\n");
    assert.equal([...output.matchAll(/\bdouble __tsonic_self_\w+\(/gu)].length, 1,
      "required exposure and omitted recursion share exactly one authored native body");
    assert.equal(/DynamicInvoke|System\.Reflection|__tsonic_callable_adapter/u.test(output), false,
      "native participation does not introduce reflective invocation or a forwarding adapter");
    executeCsharpConstruction(compiled, `named-self-default-abi-${surface}`);
  });

  test(`named-self default entry retains parameter dependencies and observed identity on ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
let events = "";
function fallback(): number { events += "D"; return 7; }
export function run(): boolean {
  events = "";
  const dependent: (left: number, value: number) => number = function inner(
    left: number, value: number = left + fallback(),
  ): number {
    return value === 0 ? inner(3) : value;
  };
  if (dependent(1, 0) !== 10 || events !== "D") return false;
  const observed: (value: number) => number = function original(value: number = fallback()): number {
    const alias: (value?: number) => number = original;
    if (alias !== original) return -1;
    return value === 0 ? alias() : value;
  };
  return observed(0) === 7 && events === "DD" && observed(3) === 3 && events === "DD";
}` });
    assertCsharpCompilationSucceeded(compiled);
    const output = [...compiled.artifacts.values()].join("\n");
    assert.equal([...output.matchAll(/\bdouble __tsonic_self_\w+\(/gu)].length, 2,
      "each authored named function retains exactly one native body");
    assert.equal(/DynamicInvoke|System\.Reflection|__tsonic_callable_adapter/u.test(output), false,
      "dependent defaults and observed self use ordinary native calls without new adapters");
    executeCsharpConstruction(compiled, `named-self-dependent-default-abi-${surface}`);
  });
}
