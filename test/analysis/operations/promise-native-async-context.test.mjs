import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { csharpBigIntegerTargetType, csharpSourcePrimitiveTargetType, getCsharpTaskResultTargetType, targetTypeRefEquals } from "../../../dist/target-model/types/index.js";

const prefix = 'import type { int32, int64 } from "@tsonic/core/types.js"; const wide = 9007199254740993n as int64;\n';
for (const [name, body, expected] of [
  ["inferred optional rejection", 'const pending = Promise.reject<void>(new Error("source")).then(undefined, async () => wide); console.log(await pending);', csharpSourcePrimitiveTargetType("int64")],
  ["inferred identity rejection", 'const pending = Promise.reject<int64>(new Error("source")).then(undefined, async () => wide); console.log(await pending);', csharpSourcePrimitiveTargetType("int64")],
  ["authored variable", 'const callback: () => Promise<bigint> = async () => wide; console.log(await callback());', csharpBigIntegerTargetType()],
  ["authored alias", 'interface Callback<Value> { (): Promise<Value>; } const callback: Callback<bigint> = async () => wide; console.log(await callback());', csharpBigIntegerTargetType()],
  ["authored direct parameter", 'function consume(callback: () => Promise<bigint>): Promise<bigint> { return callback(); } console.log(await consume(async () => wide));', csharpBigIntegerTargetType()],
  ["authored explicit generic result", 'function consume<Value>(callback: () => Promise<Value>): Promise<Value> { return callback(); } console.log(await consume<bigint>(async () => wide));', csharpBigIntegerTargetType()],
  ["authored explicit native result", 'function consume<Value>(callback: () => Promise<Value>): Promise<Value> { return callback(); } console.log(await consume<int64>(async () => wide));', csharpSourcePrimitiveTargetType("int64")],
]) {
  test(`async Promise body retains its actual result authority: ${name}`, { timeout: 240_000 }, () => {
    const compiled = compileCsharpSource({ surface: "js", targetOptions: { outputType: "Exe" }, sourceText: prefix + body });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    assert.equal(program !== undefined, true, "the exact source contract is admitted before publication");
    const file = compiled.source.getSourceFile("/project/index.ts");
    assert.equal(file !== undefined, true, "the original source file is retained");
    const pending = [file];
    const arrows = [];
    while (pending.length !== 0) {
      const node = pending.pop();
      if (program.source.ast.is.IsArrowFunction(node)) arrows.push(node);
      program.source.ast.forEachChild(node, child => { if (child !== undefined) pending.push(child); });
    }
    assert.equal(arrows.length, 1, "one actual async source body owns this result");
    const contract = program.records.returnContract.get(arrows[0]);
    assert.equal(contract?.kind, "resolved", "the native async result is selected before sealing");
    assert.equal(targetTypeRefEquals(getCsharpTaskResultTargetType(contract.type), expected), true,
      "only the current body and a genuine authored native result contract select its payload");
  });
}
