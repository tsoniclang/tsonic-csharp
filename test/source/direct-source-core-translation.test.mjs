import assert from "node:assert/strict";
import test from "node:test";
import { argumentPassingFactKey } from "@tsonic/tsts";
import {
  assertCsharpCompilationSucceeded,
  compileCsharpSource,
} from "../helpers/direct-csharp-session.mjs";
import { csharpProgramSourceFiles } from "../helpers/program-source-files.mjs";
import {
  csharpSourceArgumentPassingMode,
  selectCsharpSourceArgument,
} from "../../dist/source/extension/arguments.js";

function projectNodes(program, predicate) {
  const pending = [...csharpProgramSourceFiles(program)];
  const nodes = [];
  while (pending.length > 0) {
    const node = pending.pop();
    if (predicate(node, program.source.syntax)) nodes.push(node);
    program.source.syntax.forEachChild(node, child => { if (child !== undefined) pending.push(child); });
  }
  return nodes;
}

// WP0 A4: one discriminated passing fact. The real provider parameter of Int32.TryParse carries the declaration role
// (mode only); the out(value) marker call and its target carry the argument role with the exact storage occurrence.
test("complete argument facts and provider declaration modes have separate exact roles", () => {
  const compiled = compileCsharpSource({ sourceText: `
    import type { int32 } from "@tsonic/core/types.js";
    import { writeonlyref as out } from "@tsonic/core/lang.js";
    import { Int32 } from "@tsonic/dotnet/System.js";
    export function run(): boolean { let value: int32 = 0; return Int32.TryParse("1", out(value)); }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  assert.match(compiled.artifacts.get("src/Index.cs"), /Int32\.TryParse\("1", out value\)/u);
  const program = compiled.result.program;
  const { syntax: ast, sourceFacts, facts } = program.source;
  const calls = projectNodes(program, (node, syntax) => syntax.is.IsCallExpression(node));
  const marker = calls.find(call => ast.text(ast.as.AsCallExpression(call).Expression) === "out");
  const invocation = calls.find(call => call !== marker);
  assert.ok(marker !== undefined && invocation !== undefined && calls.length === 2);
  const target = ast.arguments(marker)[0];

  // Argument role on the marker call and on its target, naming the original `value` occurrence.
  for (const subject of [marker, target]) {
    assert.deepEqual(sourceFacts.getFact(subject, argumentPassingFactKey),
      { role: "argument", mode: "byref-writeonly-must-init", storageExpression: target });
    assert.deepEqual(selectCsharpSourceArgument(sourceFacts, subject),
      { passingMode: "byref-writeonly-must-init", storageExpression: target });
    assert.deepEqual(program.records.sourceArgument.get(subject),
      { passingMode: "byref-writeonly-must-init", storageExpression: target });
  }

  // Declaration role on the selected provider parameter: its mode is readable, but it is never storage authority.
  const selected = facts.selections.call(invocation);
  const parameter = selected?.parameters[1]?.declaration;
  assert.ok(parameter !== undefined);
  assert.deepEqual(sourceFacts.getFact(parameter, argumentPassingFactKey),
    { role: "declaration", mode: "byref-writeonly-must-init" });
  assert.equal(csharpSourceArgumentPassingMode(sourceFacts, parameter), "byref-writeonly-must-init");
  assert.deepEqual(selectCsharpSourceArgument(sourceFacts, parameter),
    { passingMode: "by-value", storageExpression: parameter });

  // No fact: ordinary by-value use of the same expression; the string literal argument is not substituted.
  const literal = ast.arguments(invocation)[0];
  assert.equal(sourceFacts.getFact(literal, argumentPassingFactKey), undefined);
  assert.deepEqual(selectCsharpSourceArgument(sourceFacts, literal), { passingMode: "by-value", storageExpression: literal });
});

for (const moduleSpecifier of ["@tsonic/core/lang.js", "@tsonic/csharp/lang.js"]) {
  for (const placement of ["", '.target("inner")', '.target("outer")']) {
    test(`deferred module attributes from ${moduleSpecifier} with ${placement || "no target"} are not exposed`, () => {
      const compiled = compileCsharpSource({
        sourceText: `
          import { attribute as annotate } from "${moduleSpecifier}";
          import { SerializableAttribute } from "@tsonic/dotnet/System.js";
          annotate.module()${placement}.add(() => new SerializableAttribute());
        `,
      });
      assert.match(compiled.sourceDiagnosticsText, /TS2339/);
      assert.deepEqual([...compiled.artifacts], []);
    });
  }
}

test("direct C# translation consumes exact source-core default and struct facts", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      import type { int } from "@tsonic/csharp/types.js";
      import { defaultvalue, field, struct } from "@tsonic/core/lang.js";

      const Point = struct({ x: field<int>(), y: field<int>() });

      export function zero(): int {
        return defaultvalue<int>();
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  assert.equal(compiled.artifacts.get("src/Index.cs"), `namespace Tsonic.Generated
{
    public static class Index
    {
        public static int zero()
        {
            return default(int)!;
        }
        private static readonly System.Lazy<object?> __tsonic_module_initialization = new System.Lazy<object?>(() => __tsonic_module_init_core());
        private static object? __tsonic_module_init_core()
        {
            return null;
        }
        public static void __tsonic_module_init()
        {
            _ = __tsonic_module_initialization.Value;
        }
    }
    public struct Point
    {
        public int x;
        public int y;
    }
}
`);
});

test("direct C# translation rejects exact source-core flow facts", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      import type { int } from "@tsonic/csharp/types.js";
      import { mutableborrow, move, sharedborrow } from "@tsonic/core/lang.js";

      export function reject(value: int): void {
        sharedborrow(value);
        mutableborrow(value);
        move(value);
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(
    compiled.result.diagnostics.map(({ code, message }) => ({ code, message })),
    ["shared-borrow", "mutable-borrow", "move"].map((marker) => ({
      code: "CSHARP_SOURCE_FLOW_MARKER_UNSUPPORTED",
      message:
        `C# target does not implement source flow marker '${marker}'; this intrinsic requires an explicit target contract and cannot be erased or lowered as an identity call.`,
    })),
  );
  assert.deepEqual([...compiled.artifacts], []);
});
