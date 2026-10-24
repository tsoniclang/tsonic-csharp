import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { optionalPrimitiveConversionsSource } from "../../../../tsonic/test/fixtures/optional-primitive-conversions.mjs";
import { getCsharpNullableElementTargetType } from "../../../dist/target-model/types/carriers/nullable.js";

test("optional primitive conversion retains native values, absence and API-local behavior", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: optionalPrimitiveConversionsSource });
  executeCsharpConstruction(compiled, "optional-primitive-conversions");
  assert.doesNotMatch([...compiled.artifacts.values()].join("\n"), /BigInteger|\(double\)\s*(?:exact|maximum)/u);
});

test("optional Number inputs retain the actual nullable native overload contract", () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    import type { uint64 } from "@tsonic/core/types.js";
    export function wide(value: uint64 | undefined): number { return Number(value); }
    export function boolean(value: boolean | undefined): number { return Number(value); }
    export function text(value: string | undefined): number { return Number(value); }
    export function omitted(): number { return Number(); }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  const program = compiled.result.program;
  assert.equal(program !== undefined, true, "the native overload controls are admitted");
  const found = new Map();
  const visit = node => {
    if (program.source.ast.is.IsFunctionDeclaration(node)) {
      const name = program.source.ast.text(program.source.ast.name(node));
      const body = program.source.ast.body(node);
      const returned = program.source.ast.statements(body)[0];
      const expression = program.source.ast.as.AsReturnStatement(returned)?.Expression;
      const selected = expression === undefined ? undefined : program.records.selectedCall.get(expression)?.target;
      assert.equal(selected?.kind, "resolved", `${name}: the actual runtime call is selected`);
      const native = getCsharpNullableElementTargetType(selected.call.targetMember.parameters[0]?.type);
      found.set(name, native);
    }
    program.source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  program.source.navigation.sourceFiles.forEach(visit);
  assert.equal(found.get("wide")?.kind === "source-primitive" && found.get("wide")?.name === "uint64", true,
    "the actual Nullable<ulong> native overload has no object boxing or floating input detour");
  assert.equal(found.get("boolean")?.kind === "source-primitive" && found.get("boolean")?.name === "bool", true,
    "the actual Nullable<bool> overload is preserved");
  for (const name of ["text", "omitted"]) assert.equal(found.get(name)?.kind === "target-named" && found.get(name)?.id === "System.Object", true,
    `${name}: the runtime's real object? formal preserves native nullability and omission`);
});
