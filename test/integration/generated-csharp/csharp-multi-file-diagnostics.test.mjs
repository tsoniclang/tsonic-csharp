import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCsharpSource,
} from "../../helpers/direct-csharp-session.mjs";

test("two independently invalid source files report both diagnostics in one build", () => {
  const compiled = compileCsharpSource({
    surface: "js",
    sourceText: `
      import "./broken-a.js";
      import "./broken-b.js";
      export const combined = 1;
    `,
    files: {
      "broken-a.ts": `
        export function firstBroken(): number {
          eval("1");
          return 1;
        }
      `,
      "broken-b.ts": `
        export function secondBroken(): number {
          eval("2");
          return 2;
        }
      `,
    },
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.equal(
    compiled.result.diagnostics.length,
    2,
    `expected one diagnostic per invalid file, got: ${compiled.result.diagnostics.map((diagnostic) => diagnostic.message).join("\n")}`,
  );
  for (const diagnostic of compiled.result.diagnostics) {
    assert.equal(diagnostic.code, "TS9101002");
    assert.match(
      diagnostic.message,
      /eval requires runtime source evaluation with lexical-scope access/u,
    );
  }
  assert.deepEqual(
    compiled.result.diagnostics.map((diagnostic) =>
      compiled.source.ast.getPath(
        compiled.source.ast.getSourceFile(diagnostic.sourceNode),
      )
    ),
    ["/project/broken-a.ts", "/project/broken-b.ts"],
  );
  assert.equal(compiled.artifacts.size, 0, "no artifacts may publish from a failed build");
});

test("a fully valid multi-file build retains existing reconstruction behavior", () => {
  const compiled = compileCsharpSource({
    surface: "js",
    sourceText: `
      import { greet } from "./valid.js";
      export const message = greet("tsonic");
    `,
    files: {
      "valid.ts": `
        export function greet(name: string): string {
          return "hello " + name;
        }
      `,
    },
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.equal(compiled.result.diagnostics.length, 0);
  assert.deepEqual([...compiled.artifacts.keys()], [
    "TsonicGenerated.csproj",
    "src/Valid.cs",
    "src/Index.cs",
    "generated/TsonicModuleInitializer.cs",
  ]);
});
