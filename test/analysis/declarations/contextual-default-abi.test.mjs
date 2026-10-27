import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";

for (const surface of ["native", "js"]) {
  test(`contextual method default ABI keeps required and optional native inputs distinct on ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
let events = "";
function fallback(): number { events += "D"; return 5; }
export function run(): boolean {
  const required: { m(value: number): number } = { m(value: number = fallback()): number { return value; } };
  const optional: { m(value?: number): number } = { m(value: number = fallback()): number { return value; } };
  events = "";
  if (required.m(3) !== 3 || events !== "") return false;
  if (optional.m(0) !== 0 || events !== "") return false;
  if (optional.m() !== 5 || events !== "D") return false;
  return optional.m() === 5 && events === "DD";
}` });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    const ast = program.source.ast;
    const records = [];
    const pending = [...csharpProgramSourceFiles(program)];
    while (pending.length > 0) {
      const node = pending.pop();
      if (ast.is.IsParameterDeclaration(node) && ast.as.AsParameterDeclaration(node).Initializer !== undefined &&
        ast.is.IsMethodDeclaration(ast.parent(node))) {
        const selected = program.records.runtimeDefault.get(node);
        const dispatch = program.records.callableDispatch.get(ast.parent(node));
        assert.equal(selected !== undefined && dispatch?.kind === "method", true, "one sealed native method input authority");
        const parameter = dispatch.implementation.nativeParameters.find(parameter => parameter.sourceParameter === node)?.targetParameter;
        assert.equal(parameter !== undefined && targetTypeRefEquals(parameter.type, selected.parameterType), true,
          "callable ABI and default entry retain exactly the same physical native parameter");
        assert.equal(parameter.optional === true, selected.acceptsOmission, "omission belongs to the selected native input");
        records.push(selected.kind);
      }
      ast.forEachChild(node, child => { if (child !== undefined) pending.push(child); });
    }
    assert.deepEqual(records.sort(), ["nullable", "present"], "the required input never acquires optional native storage");
    executeCsharpConstruction(compiled, `contextual-default-abi-${surface}`);
  });
}
