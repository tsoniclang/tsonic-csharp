import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("authored broad unions preserve their checked broad carrier across files", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", files: { "values.ts": `
export type Value = unknown | number | undefined;
export class Store {
  readonly value: unknown;
  constructor(value: unknown) { this.value = value; }
  read(): unknown | undefined | this { return this.value; }
}
export function identity(value: Value): Value { return value; }
` }, sourceText: `
import { Store, identity } from "./values.js";
export function run(): boolean {
  return new Store("kept").read() === "kept" && new Store(undefined).read() === undefined &&
    identity(3) === 3 && identity("text") === "text" && identity(undefined) === undefined;
}
` });
  assertCsharpCompilationSucceeded(compiled);
  executeCsharpConstruction(compiled, "absorbed-broad-unions");
});
