import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { getCsharpDelegateSignature } from "../../../dist/target-model/types/carriers/delegates.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";

for (const surface of ["native", "js"]) {
  test(`checked tuple-rest aliases and native body inputs share one scalar vector on ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import type { int32, int64 } from "@tsonic/core/types.js";
type Parts = [int32, int64, string];
type Consumer = (...parts: Parts) => boolean;
export function run(): boolean {
  const named: Consumer = (count, wide, label) => count === 7 && wide === 9007199254740993n && label === "ready";
  const rest: Consumer = (...parts: Parts) => parts[0] === 7 && parts[1] === 9007199254740993n && parts[2] === "ready";
  const ordinary: (parts: Parts) => boolean = (parts) => parts[0] === 7 && parts[1] === 9007199254740993n && parts[2] === "ready";
  const wide: int64 = 9007199254740993n;
  return named(7, wide, "ready") && rest(7, wide, "ready") && ordinary([7, wide, "ready"]);
}` });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    const ast = program.source.ast;
    const pending = [...csharpProgramSourceFiles(program)];
    const widths = new Map();
    while (pending.length !== 0) {
      const node = pending.pop();
      const parent = ast.parent(node);
      if (ast.is.IsArrowFunction(node) && parent !== undefined && ast.is.IsVariableDeclaration(parent)) {
        const name = ast.text(ast.name(parent));
        if (name === "named" || name === "rest" || name === "ordinary") {
          const signature = getCsharpDelegateSignature(program.records.callableTarget.get(node));
          const contract = program.records.callableDeclaration.get(node)?.contract;
          assert.equal(signature !== undefined && contract !== undefined, true, "both signature and declaration are sealed");
          assert.equal(contract.nativeParameters.length, signature.parameters.length, "the native vector has one shared arity");
          assert.equal(contract.nativeParameters.every((slot, index) => targetTypeRefEquals(slot.targetParameter.type, signature.parameters[index])), true,
            "each selected parameter retains its exact native slot carrier");
          assert.equal(signature.restParameterIndex, undefined, "finite tuple rests never become a params tuple");
          widths.set(name, signature.parameters.length);
        }
      }
      ast.forEachChild(node, child => { if (child !== undefined) pending.push(child); });
    }
    assert.deepEqual([...widths.entries()].sort(), [["named", 3], ["ordinary", 1], ["rest", 3]],
      "only rest tuples expand, not ordinary tuple-valued arguments");
    const output = [...compiled.artifacts.values()].join("\n");
    assert.equal(/Convert\.ToDouble|params\s+\(|new\s+(?:global::)?Tsonic\.CSharp\.Js\.JSArray/u.test(output), false,
      "the finite native vector needs neither floating conversion nor array packing");
    executeCsharpConstruction(compiled, `tuple-rest-native-signatures-${surface}`);
  });
}
