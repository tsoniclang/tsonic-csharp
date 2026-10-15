import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("private indexed records preserve their authored closed values and aliasing", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
class Settings {
  readonly #values: Record<string, unknown> = {};
  set(key: string, value: unknown): void { this.#values[key] = value; }
  get(key: string): unknown { return this.#values[key]; }
}
export function run(): boolean {
  const settings = new Settings();
  settings.set("label", "before");
  const alias = settings;
  alias.set("label", "after");
  settings.set("empty", undefined);
  return settings.get("label") === "after" && alias.get("missing") === undefined &&
    settings.get("empty") === undefined;
}
` });
  assertCsharpCompilationSucceeded(compiled);
  executeCsharpConstruction(compiled, "private-indexed-records");
});
