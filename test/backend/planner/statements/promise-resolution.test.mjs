import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../../helpers/native-construction.mjs";

test("Promise.resolve preserves exact values, absence, evaluation and existing promise failure", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    import type { uint64 } from "@tsonic/core/types.js";
    function value(calls: number[]): string { calls.push(1); return "ready"; }
    async function fail(): Promise<number> { throw new Error("rejected"); }
    export async function run(): Promise<boolean> {
      const absent = Promise.resolve(undefined);
      if (await absent !== undefined || await absent !== null) throw new Error("absence");
      const calls: number[] = [];
      const text = Promise.resolve(value(calls));
      if (calls.length !== 1 || await text !== "ready" || await text !== "ready") throw new Error("evaluation");
      const wide: uint64 = 9007199254740993n;
      if (await Promise.resolve(wide) !== wide) throw new Error("native width");
      if (await Promise.resolve(Promise.resolve(7)) !== 7) throw new Error("promise value");
      let rejected = false;
      try { await Promise.resolve(fail()); } catch { rejected = true; }
      if (!rejected) throw new Error("promise rejection");
      return true;
    }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  executeCsharpConstruction(compiled, "promise-resolution", true);
});
