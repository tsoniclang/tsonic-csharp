import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("retained async callables preserve owned capture and repeated invocation", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
async function failure(): Promise<void> { throw new Error("failed"); }
async function retained<Value>(value: Value): Promise<Value> {
  const read = async (previous: Promise<void>): Promise<Value> => {
    await previous;
    return value;
  };
  return await read(Promise.resolve(undefined));
}
export async function run(): Promise<boolean> {
  if (await retained("generic") !== "generic") return false;
  const prefix = "kept:";
  const continueWith = async (previous: Promise<void>, value: string): Promise<string> => {
    await previous;
    return prefix + value;
  };
  if (await continueWith(Promise.resolve(undefined), "first") !== "kept:first") return false;
  if (await continueWith(Promise.resolve(undefined), "second") !== "kept:second") return false;
  let rejected = false;
  try { await continueWith(failure(), "unused"); } catch { rejected = true; }
  return rejected;
}
` });
  assertCsharpCompilationSucceeded(compiled);
  executeCsharpConstruction(compiled, "suspended-input-lifetimes", true);
});
