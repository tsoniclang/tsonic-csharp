import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";
import { getCsharpDelegateSignature } from "../../../dist/target-model/types/carriers/delegates.js";
import { getCsharpRuntimeUnionArms } from "../../../dist/target-model/types/carriers/runtime-carriers.js";

for (const surface of ["native", "js"]) {
  test(`an inferred constructor callback receives the selected native uint64 resolver rather than erased bigint on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import type { uint64 } from "@tsonic/core/types.js";
export async function run(): Promise<boolean> {
  const exact: uint64 = 9007199254740993n;
  const immediate = new Promise<uint64>(resolve => { resolve(exact); });
  const adopted = new Promise<uint64>(resolve => { resolve(immediate); });
  return await immediate === exact && await adopted === exact;
}
` });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    assert.equal(program !== undefined, true, "the selected native constructor publishes its checked callback contracts");
    const ast = program.source.ast;
    let checked = 0;
    const visit = node => {
      if (ast.is.IsArrowFunction(node)) {
        const contract = program.records.callableDeclaration.get(node)?.contract;
        assert.equal(contract?.kind === "source", true, "the callback retains its source declaration owner");
        const resolver = contract.nativeParameters[0]?.targetParameter.type;
        const payload = getCsharpDelegateSignature(resolver)?.parameters[0];
        const arms = getCsharpRuntimeUnionArms(payload);
        assert.equal(arms?.some(arm => arm.kind === "source-primitive" && arm.name === "uint64"), true,
          "the inferred resolver receives the selected exact uint64 union arm");
        assert.equal(arms?.some(arm => arm.kind === "target-named" && arm.id === "System.Numerics.BigInteger"), false,
          "source bigint erasure does not replace authored native constructor metadata");
        checked += 1;
      }
      ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    csharpProgramSourceFiles(program).forEach(visit);
    assert.equal(checked, 2, "both direct completion and Task adoption use the same physical resolver contract");
    const generated = [...compiled.artifacts.values()].join("\n");
    assert.equal(/TaskCompletion<ulong>\.Create/u.test(generated), true, "native completion uses the exact selected scalar");
    assert.equal(/Task<[^>]*BigInteger/u.test(generated), false, "Task completion does not round-trip through arbitrary precision");
    executeCsharpConstruction(compiled, `native-constructor-context-${surface}`, true, false, [],
      'if (!await Tsonic.Generated.Index.run()) throw new System.Exception("native uint64 callback context");');
  });
}
