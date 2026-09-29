import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("retained async callbacks observe mutable Promise storage", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
async function failure(): Promise<void> { throw new Error("failed"); }
function create(): () => Promise<string> {
  let processing: Promise<string> = Promise.resolve("initial");
  const finish = async (): Promise<string> => await processing;
  processing = Promise.resolve("retained");
  return finish;
}
export async function run(): Promise<boolean> {
  const retained = create();
  if (await retained() !== "retained" || await retained() !== "retained") return false;
  let processing: Promise<void> = Promise.resolve(undefined);
  const complete = async (): Promise<string> => { await processing; return "completed"; };
  if (await complete() !== "completed") return false;
  processing = failure();
  let rejected = false;
  try { await complete(); } catch { rejected = true; }
  processing = Promise.resolve(undefined);
  return rejected && await complete() === "completed";
}
` });
  assertCsharpCompilationSucceeded(compiled);
  executeCsharpConstruction(compiled, "suspended-capture-storage", true);
});
