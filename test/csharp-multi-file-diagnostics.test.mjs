import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCsharpSource,
} from "./helpers/direct-csharp-session.mjs";

test("two independently invalid source files report both diagnostics in one build", () => {
  const compiled = compileCsharpSource({
    surface: "js",
    sourceText: `
      import { firstBroken } from "./broken-a.js";
      import { secondBroken } from "./broken-b.js";
      export const combined = \`\${firstBroken("x", "y")}\${secondBroken("x", "y")}\`;
    `,
    files: {
      "broken-a.ts": `
        export function firstBroken(left: string, right: string): string {
          return left || right;
        }
      `,
      "broken-b.ts": `
        export function secondBroken(left: string, right: string): string {
          return left || right;
        }
      `,
    },
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.equal(
    compiled.result.diagnostics.length,
    2,
    `expected one diagnostic per invalid file, got: ${compiled.result.diagnostics.map((d) => d.message).join("\n")}`,
  );
  for (const diagnostic of compiled.result.diagnostics) {
    assert.equal(diagnostic.code, "CSHARP_UNSUPPORTED_AST");
    assert.match(diagnostic.message, /logical operator '\|\|' requires exact bool operands/u);
  }
  assert.notEqual(
    compiled.result.diagnostics[0].sourceNode,
    compiled.result.diagnostics[1].sourceNode,
    "each failure must anchor to its own source file's node",
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
          return \`hello \${name}\`;
        }
      `,
    },
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.equal(compiled.result.diagnostics.length, 0);
  assert.ok(compiled.artifacts.size > 0);
});
