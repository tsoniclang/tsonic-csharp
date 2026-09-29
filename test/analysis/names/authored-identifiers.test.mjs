import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles, formatDiagnostics } from "@tsonic/tsts";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { createCsharpSourceNameResolver } from "../../../dist/analysis/names/source-names.js";

test("C# source name resolution retains authored case across declarations and references", () => {
  const checked = createCompilerSessionFromFiles({
    currentDirectory: "/project",
    files: { "/project/index.ts": `
      export class http_response<valueType> {
        URLValue: valueType;
        constructor(inputValue: valueType) { this.URLValue = inputValue; }
        makeValue(unusedValue: boolean): valueType { return this.URLValue; }
      }
      export enum http_status { inProgress = 1, HTTP_OK = 2 }
      export const moduleValue = 3;
      export function makeValue(inputValue: number, unusedValue: string): number {
        const fooBar = inputValue;
        const foo_bar = 1;
        const event = fooBar + foo_bar;
        return event;
      }
    ` },
    compilerOptions: { strict: true, target: "es2022", module: "esnext" },
  }).checkSource();
  assert.equal(checked.diagnostics.length, 0, formatDiagnostics(checked.diagnostics));
  const source = createTargetSourceProgram(checked);
  const file = checked.getSourceFile("/project/index.ts");
  assert.ok(file);
  const names = createCsharpSourceNameResolver({
    ast: source.ast,
    navigation: source.navigation,
    sourceFiles: [file],
    sourceIdentities: { node: () => undefined },
  });
  const observed = new Set();
  const visit = node => {
    if (source.ast.is.IsIdentifier(node)) {
      const authored = source.ast.text(node);
      observed.add(authored);
      assert.deepEqual(names.resolve(node), {
        kind: "resolved", name: authored === "event" ? "@event" : authored,
      });
    }
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(file);
  for (const name of ["http_response", "valueType", "URLValue", "makeValue", "unusedValue", "moduleValue", "inProgress", "HTTP_OK", "fooBar", "foo_bar", "event"]) {
    assert.ok(observed.has(name), name);
  }
  assert.equal(names.temporaryName("fooBar"), "_fooBar");
  assert.equal(names.temporaryName("moduleValue"), "_moduleValue");
  assert.equal(names.temporaryName("helperValue"), "helperValue");
});
