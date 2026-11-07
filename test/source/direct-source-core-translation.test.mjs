import assert from "node:assert/strict";
import test from "node:test";
import {
  compileCsharpSource,
  checkCsharpSource,
} from "../helpers/direct-csharp-session.mjs";
import { argumentPassingFactKey } from "@tsonic/tsts";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { csharpSourceArgumentPassingMode, selectCsharpSourceArgument } from "../../dist/source/extension/arguments.js";

test("complete argument facts and provider declaration modes have separate exact roles", () => {
  const checked = checkCsharpSource({ sourceText: `
    import type { int32 } from "@tsonic/core/types.js";
    import { writeonlyref as out } from "@tsonic/core/lang.js";
    import { Int32 } from "@tsonic/dotnet/System.js";
    export function run(): boolean { let value: int32 = 0; return Int32.TryParse("1", out(value)); }
  ` });
  assert.equal(checked.sourceDiagnosticsText, "");
  const source = createTargetSourceProgram(checked.source);
  const nodes = [];
  const visit = node => { nodes.push(node); source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); }); };
  visit(checked.source.getSourceFile("/project/index.ts"));
  const marker = nodes.find(node => source.sourceFacts.getFact(node, argumentPassingFactKey)?.kind === "argument");
  assert.equal(marker !== undefined, true, "the real Source marker publishes one complete use fact");
  const passing = source.sourceFacts.getFact(marker, argumentPassingFactKey);
  const selected = selectCsharpSourceArgument(source.sourceFacts, marker);
  assert.equal(selected.argument.storageExpression === passing.storageExpression &&
    selected.argument.passingMode === "byref-writeonly-must-init", true,
  "Native consumes the exact Source storage occurrence without a reconstruction");
  const invocation = nodes.map(node => source.semantics.forNode(node).operations.call(node)).find(call =>
    call?.sourceSelectedSignatureParameters.some(parameter =>
      source.sourceFacts.getFact(parameter.parameterDeclaration, argumentPassingFactKey)?.kind === "declaration"));
  const parameter = invocation?.sourceSelectedSignatureParameters.find(parameter =>
    source.sourceFacts.getFact(parameter.parameterDeclaration, argumentPassingFactKey)?.mode === "byref-writeonly-must-init")?.parameterDeclaration;
  assert.equal(parameter !== undefined, true, "the actual provider parameter carries declaration-mode evidence");
  assert.equal(csharpSourceArgumentPassingMode(source.sourceFacts, parameter), "byref-writeonly-must-init");
  const declaration = selectCsharpSourceArgument(source.sourceFacts, parameter);
  assert.equal(declaration.argument.passingMode === "by-value" && declaration.argument.storageExpression === parameter, true,
    "a declaration role is not fabricated into a marker argument");
  assert.throws(() => selectCsharpSourceArgument({ getFact: () => ({ kind: "argument", mode: passing.mode }) }, marker),
    error => error.diagnostic?.code === "TSONIC_INTERNAL_ANALYSIS_INVARIANT" && error.diagnostic.sourceNode === marker &&
      error.diagnostic.message === "A complete Source argument-passing fact requires its exact storage expression.",
    "a malformed complete-use record is a producer invariant, not a user refusal");
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
