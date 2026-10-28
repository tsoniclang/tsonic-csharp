import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";
import { getCsharpNullableElementTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { isCsharpJsValueTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";

for (const surface of ["native", "js"]) {
  test(`contextual native defaults retain input storage and one broad body conversion on ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import type { int32 } from "@tsonic/core/types.js";
let defaults: int32 = 0;
function observedDefaults(): int32 { return defaults; }
function fallback(): unknown { defaults += 1; return { count: 11 as int32 }; }
function required(callback: (value: { count: int32 }) => boolean): boolean {
  return callback({ count: 7 as int32 });
}
function optional(callback: (value?: { count: int32 }) => boolean): boolean {
  return callback() && callback({ count: 0 as int32 });
}
export function run(): boolean {
  defaults = 0;
  const present = required((value: unknown = fallback()): boolean => typeof value === "object");
  if (!present || observedDefaults() !== 0) return false;
  const omitted = optional((value: unknown = fallback()): boolean => typeof value === "object");
  return omitted && observedDefaults() === 1;
}` });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    const ast = program.source.ast;
    const pending = [...csharpProgramSourceFiles(program)];
    let present = 0;
    let optional = 0;
    while (pending.length > 0) {
      const node = pending.pop();
      if (ast.is.IsArrowFunction(node)) {
        const declaration = program.records.callableDeclaration.get(node)?.contract;
        const parameter = declaration?.parameters[0];
        assert.equal(parameter !== undefined, true, "one actual checked default input");
        const selected = program.records.runtimeDefault.get(parameter);
        assert.equal(selected !== undefined, true, "the same declaration owns its default and body storage");
        assert.equal(isCsharpJsValueTargetType(selected.valueType), true, "authored unknown remains the broad body carrier");
        assert.equal(targetTypeRefEquals(selected.parameterType, selected.valueType), false,
          "native incoming storage is not replaced with broad body storage");
        assert.equal(targetTypeRefEquals(declaration.nativeParameters[0].targetParameter.type, selected.parameterType), true,
          "the body ABI uses the actual native incoming storage");
        assert.equal(targetTypeRefEquals(selected.native.source, selected.parameterType), true,
          "default entry starts with the same canonical native input");
        if (selected.kind === "present") {
          const entry = program.records.lambdaParameterEntry.get(parameter);
          assert.equal(selected.acceptsOmission, false, "a required native input cannot take the absence initializer");
          assert.equal(entry?.kind === "conversion" && entry.conversion.kind === "js-value-box", true,
            "one admitted conversion owns the native input's broad body view");
          assert.equal(targetTypeRefEquals(entry.source, selected.parameterType), true,
            "the admitted conversion consumes the exact physical input");
          assert.equal(program.records.jsValueBoxing.get(parameter, entry.source)?.kind, "wrap",
            "the existing boxing owner publishes the exact input conversion before the seal");
          present += 1;
        } else {
          assert.equal(getCsharpNullableElementTargetType(selected.parameterType) !== undefined, true,
            "the optional native input retains its actual one-state absence representation");
          assert.equal(program.records.lambdaParameterEntry.get(parameter)?.kind, "default",
            "the actual absence branch, not a synthetic present conversion, owns the initializer");
          optional += 1;
        }
      }
      ast.forEachChild(node, child => { if (child !== undefined) pending.push(child); });
    }
    assert.equal(present, 1, "one required native entry");
    assert.equal(optional, 1, "one optional native entry");
    executeCsharpConstruction(compiled, `contextual-native-default-storage-${surface}`);
  });
}
