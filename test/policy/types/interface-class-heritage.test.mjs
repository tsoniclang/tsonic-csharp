import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

const header = `import type { int32 } from "@tsonic/core/types.js";\n`;
const refused = [
  ["Error", "CodedError", "System.Exception'.",
    "export interface CodedError extends Error { code: int32; }\nexport function f(e: CodedError): void { throw e; }\n"],
  ["Promise<int32>", "Pending", "System.Threading.Tasks.Task'.",
    "export interface Pending extends Promise<int32> { tag: string; }\nexport function f(v: Pending): string { return v.tag; }\n"],
  ["Base", "Extended", "Base'.",
    "export class Base { x: int32 = 0; }\nexport interface Extended extends Base { y: int32; }\nexport function f(v: Extended): int32 { return v.y; }\n"],
];
const refusedOnJs = [
  ["Date", "Stamp", "Tsonic.CSharp.Js.Date'.",
    "export interface Stamp extends Date { tag: string; }\nexport function f(v: Stamp): string { return v.tag; }\n"],
  ["RegExp", "Pattern", "Tsonic.CSharp.Js.RegExp'.",
    "export interface Pattern extends RegExp { tag: string; }\nexport function f(v: Pattern): string { return v.tag; }\n"],
  ["RangeError", "Ranged", "Tsonic.CSharp.Runtime.RangeError'.",
    "export interface Ranged extends RangeError { code: int32; }\nexport function f(v: Ranged): int32 { return v.code; }\n"],
];

for (const surface of ["native", "js"]) {
  for (const [heritage, name, target, body] of [...refused, ...(surface === "js" ? refusedOnJs : [])]) {
    test(`an interface extending the class carrier of ${heritage} is refused at its heritage (${surface})`, () => {
      const sourceText = header + body;
      const compiled = compileCsharpSource({ surface, sourceText });
      const ast = compiled.source.ast;
      const diagnostics = compiled.result.diagnostics;
      const prefix = `Project interface '${name}' cannot inherit the non-interface C# type '${target}`;
      assert.equal(compiled.result.artifacts.length === 0, true, "no C# is emitted for a class in an interface base list");
      assert.equal(diagnostics.length === 1, true, `exactly one diagnostic: ${diagnostics.map(entry => entry.code).join(",")}`);
      assert.equal(diagnostics[0]?.code === "CSHARP_PROJECT_HERITAGE_KIND_UNSUPPORTED" && diagnostics[0]?.category === "error",
        true, "the refusal is the heritage kind error");
      assert.equal(diagnostics[0]?.message.startsWith(prefix) === true, true,
        `the refusal names the class carrier: ${diagnostics[0]?.message}`);
      const node = diagnostics[0]?.sourceNode;
      assert.equal(node !== undefined && ast.kindName(node) === "KindExpressionWithTypeArguments", true,
        "the refusal points at the heritage clause type");
      assert.equal(node !== undefined && sourceText.slice(ast.pos(node), ast.end(node)).trim() === heritage, true,
        "the refusal covers the authored heritage");
    });
  }

  test(`an interface extending interfaces and an object type alias still compiles and runs (${surface})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: header + `export type Seed = { a: int32 };
export interface Counted { c: int32; }
export interface Box<T> { value: T; }
export interface Named<T> extends Box<T>, Counted, Seed { name: string; }
export function total(v: Named<int32>): int32 {
  return v.a + v.c + v.value;
}
export function run(): boolean {
  return total({ a: 1, c: 3, value: 4, name: "n" }) === 8;
}
` });
    assert.equal(compiled.result.diagnostics.length === 0, true,
      `interface heritage compiles: ${compiled.result.diagnostics.map(entry => entry.message).join(" | ")}`);
    executeCsharpConstruction(compiled, `interface-class-heritage-control-${surface}`);
  });
}
