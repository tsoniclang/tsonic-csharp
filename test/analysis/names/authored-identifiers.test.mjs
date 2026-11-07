import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { createCsharpSourceNameBuilder } from "../../../dist/analysis/names/plan.js";

test("C# source name resolution retains authored case across declarations and references", () => {
  // The name host is `{ ast, facts, sourceFiles, sourceIdentities }` over the Source facts program the C# session
  // built (nextgen C-2542: createTargetSourceProgram needs the composition's profile).
  const checked = analyzeCsharpSource({ sourceText: `
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
    ` });
  assert.equal(checked.sourceDiagnosticsText, "", "the authored names are checked source");
  const { source } = checked;
  const file = source.sourceFiles.find(candidate => source.syntax.getFileName(candidate) === "/project/index.ts");
  assert.ok(file);
  const names = createCsharpSourceNameBuilder({
    ast: source.syntax,
    facts: source.facts,
    sourceFiles: [file],
    sourceIdentities: { node: () => undefined },
  });
  const observed = new Set();
  const visit = node => {
    if (source.syntax.is.IsIdentifier(node)) {
      const authored = source.syntax.text(node);
      observed.add(authored);
      assert.deepEqual(names.resolve(node), {
        kind: "resolved", name: authored === "event" ? "@event" : authored,
      });
    }
    source.syntax.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(file);
  for (const name of ["http_response", "valueType", "URLValue", "makeValue", "unusedValue", "moduleValue", "inProgress", "HTTP_OK", "fooBar", "foo_bar", "event"]) {
    assert.ok(observed.has(name), name);
  }
  assert.equal(names.temporaryName("fooBar"), "_fooBar");
  assert.equal(names.temporaryName("moduleValue"), "_moduleValue");
  assert.equal(names.temporaryName("helperValue"), "helperValue");
  assert.equal(names.temporaryName("helperValue"), "_helperValue");
  assert.equal(names.temporaryName("helperValue"), "__helperValue");
});
