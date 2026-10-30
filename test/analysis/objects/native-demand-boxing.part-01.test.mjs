import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { compileCsharpRequiredRecordSource } from "../../helpers/required-records.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { transformCsharpTargetAst } from "../../../dist/backend/target-ast/normalization/transformation.js";
import { csharpStructuralObjectShapeIdentity, csharpSourcePrimitiveTargetType, isCsharpJsValueTargetType, isCsharpRecordDictionaryTargetType, targetTypeRefEquals } from "../../../dist/target-model/types/index.js";
import { objectShapeArtifactKey } from "../../../dist/target-model/records/objects/object-shape-keys.js";
import { printCsharpType } from "../../../dist/print/source/printer.js";
import { createCsharpObjectShapeValueStorage } from "../../../dist/policy/types/objects/shape-carriers.js";
import { applyCsharpObjectShapeDisplayNames } from "../../../dist/backend/target-ast/normalization/object-shape-names.js";
import { selectCsharpObjectShapeDisplayNames } from "../../../dist/analysis/names/object-shapes.js";
import { createStructuralObjectShapeTarget } from "../../../dist/analysis/objects/shapes/construction.js";
import { header, payload, boxing, nativeCostProgram, originalPrograms, originalNativeProgram } from "./native-demand-boxing.fixtures.mjs";

test("general native value declarations publish JSON writers without tracing later uses or changing broad storage", () => {
  const { program, nodes, source } = compileCsharpRequiredRecordSource(`
    import type { int64 } from "@tsonic/core/types.js";
    function stringify(value: unknown): string { return JSON.stringify(value) ?? "null"; }
    const unrelated: unknown = { unrelated: 9n as int64 };
    export function run(): string {
      const child: unknown = { childValue: 9007199254740993n as int64 };
      const selected: unknown = { selected: true, child };
      const alias = selected;
      const values: unknown = [alias];
      void unrelated;
      return stringify(values);
    }
  `, "js");
  let demanded = 0;
  let untouched = 0;
  for (const node of nodes.filter(node => source.ast.is.IsObjectLiteralExpression(node))) {
    const use = program.records.nativeExpression.get(node)?.physical;
    assert.equal(use?.objectShape !== undefined, true, "every authored literal retains its actual native shape before boxing");
    const shape = use.objectShape;
    const artifact = program.records.objectShapeArtifact.get(objectShapeArtifactKey(shape));
    assert.equal(artifact !== undefined, true, "every boxed native shape has its artifact");
    if (shape.members.some(member => member.sourceName === "unrelated")) {
      assert.equal(artifact.capabilities.includes("json-serialization"), true, "the unrelated native declaration owns its writer independently of later JSON calls");
      assert.equal(artifact.capabilities.includes("reference-identity"), true, "unrelated native identity remains intact");
      untouched++;
    } else {
      assert.equal(artifact.capabilities.includes("json-serialization"), true, "the selected native declarations own their actual JSON payload writers without caller tracing");
      assert.equal(artifact.capabilities.includes("reference-identity"), true, "serialization demand does not replace the native identity carrier");
      demanded++;
    }
  }
  assert.equal(demanded, 2, "both original selected native shapes retain the existing protocol");
  assert.equal(untouched, 1, "the one unrelated original native shape remains distinct and unchanged");
});

for (const surface of Array.from(["native", "js"]).slice(0, 2)) {
test(`${surface}: checked source object narrowing retains closed broad storage and native identity`, { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface, sourceText: header + `
    function objectKind(value: unknown): boolean {
      const original = value;
      if (value === null || typeof value !== "object") return false;
      return typeof value === "object" && value === original;
    }
    export function run(): boolean {
      const value = { count: 7 as int32 };
      return objectKind(value) && !objectKind(7) && !objectKind("text") && !objectKind(undefined);
    }
  ` });
  executeCsharpConstruction(compiled, `artifact-box-source-object-${surface}`);
});
}

for (const surface of Array.from(["native", "js"]).slice(0, 2)) {
test(`${surface}: broad literal destinations retain native payload fields before boxing`, () => {
  const { program, nodes, source } = compileCsharpRequiredRecordSource(header + `
    const root: unknown = { count: 1 as int32 };
    function returned(): unknown { return { count: 2 as int32 }; }
    class Holder { value: unknown = { count: 3 as int32 }; }
    function accept(value: unknown): unknown { return value; }
    class Base { read(): unknown { return undefined; } }
    class Derived extends Base { override read() { return { count: 7 as int32 }; } }
    export function run(): boolean {
      const values: unknown[] = [{ count: 4 as int32 }];
      const pair: [unknown, string] = [{ count: 5 as int32 }, "kept"];
      const argument = accept({ count: 6 as int32 });
      const dictionary: Record<string, int32> = { count: 8 as int32 };
      const derived: Base = new Derived();
      return typeof root === "object" && typeof returned() === "object" && typeof new Holder().value === "object" &&
        typeof values[0] === "object" && typeof pair[0] === "object" && typeof argument === "object" &&
        typeof derived.read() === "object" && dictionary["count"] === 8;
    }
  `, surface);
  const integer = csharpSourcePrimitiveTargetType("int32");
  let payloads = 0;
  let dictionaries = 0;
  for (const node of nodes.filter(node => source.ast.is.IsObjectLiteralExpression(node))) {
    const selected = program.records.nativeExpression.get(node);
    const physical = selected?.physical;
    assert.equal(physical !== undefined, true, "each actual literal has its admitted physical construction");
    if (isCsharpRecordDictionaryTargetType(physical.carrier)) {
      dictionaries += 1;
      assert.equal(targetTypeRefEquals(physical.carrier.typeArguments[1], integer), true,
        "an explicit Record retains its actual native dictionary value carrier");
      continue;
    }
    const shape = physical.objectShape;
    assert.equal(shape !== undefined, true, "a broad destination constructs its checked native source shape");
    assert.equal(isCsharpJsValueTargetType(shape.targetType), false, "the native payload is not reinterpreted as a broad runtime object");
    assert.equal(shape.members.length, 1, "the payload keeps its exact field inventory");
    assert.equal(targetTypeRefEquals(shape.members[0].type, integer), true, "the actual int32 field remains native int32");
    assert.equal(selected.use.kind === "converted" && isCsharpJsValueTargetType(selected.use.target), true,
      "the broad destination is a separate admitted conversion, not the physical construction");
    assert.equal(selected.conversion?.kind, "js-value-box", "the existing native reference boxing edge owns the boundary");
    const artifact = program.records.objectShapeArtifact.get(objectShapeArtifactKey(shape));
    assert.equal(artifact?.capabilities.includes("reference-identity"), true,
      "the actual boxed payload publishes reference identity before the seal");
    payloads += 1;
  }
  assert.equal(payloads, 7, "module, return, field, array, tuple, argument and inherited return positions share one rule");
  assert.equal(dictionaries, 1, "the explicit native dictionary follows its separate existing owner");
});
}

for (const surface of Array.from(["native", "js"]).slice(0, 1)) {
for (const [name, body, nativeBody, definitions] of Array.from(boxing).slice(0, 6)) {
test(`${surface}: actual ${name} boxes only admitted references and preserves native identity and cost`, { timeout: 300_000 }, () => {
    const { compiled, program } = compileCsharpRequiredRecordSource(header + body, surface);
    const marked = program.records.objectShapeArtifact.artifacts.filter(artifact => artifact.capabilities.includes("reference-identity"));
    assert.equal(marked.length > 0, true, "the actual admitted boxing edge publishes its reference capability before planning");
    assert.equal(marked.some(artifact => artifact.fact.members.some(member => member.sourceName === "count")), true,
      "the boxed payload itself, not only the nominal receiver, has exact reference identity");
    const baseline = nativeBody.replace("NativeInvoke(", "NativeInvocation.invoke(");
    const output = executeCsharpConstruction(compiled, `artifact-box-${surface}-${name}`, false, false, [],
      nativeCostProgram("return Index.run() ? 7 : -1;", `${baseline.replace(/return ([^;]+);\s*$/u, "return ($1) ? 7 : -1;")}`, definitions));
    assert.match(output, /^native-cost generated=\d+ native=\d+ sums=28672\/28672\s*$/u,
      "real native execution measures exact warmed allocation counts; a runtime carrier failure cannot count as a compilation pass");
  });
}
}

test("general unknown JSON preserves native identity and allocation while unrelated non-JSON storage stays legal", { timeout: 300_000 }, () => {
  const sourceText = header + [
    "import type { int64 } from \"@tsonic/core/types.js\";",
    "const child: unknown = { count: 9007199254740993n as int64 };",
    "const value: unknown = { child: child };",
    "const alias = value;",
    "const unrelated: unknown = { toJSON(key: int32): int32 { return key; } };",
    "function stringify(input: unknown): string { return JSON.stringify(input) ?? \"null\"; }",
    "export function identity(): boolean { return alias === value; }",
    "export function run(): boolean {",
    "  return stringify(alias) === '{\"child\":{\"count\":9007199254740993}}' && identity() && typeof unrelated === \"object\";",
    "}",
  ].join("\n");
  const compiled = compileCsharpSource({ surface: "js", sourceText });
  const nativeProgram = [
    "using System;",
    "using Index = Tsonic.Generated.Index;",
    "Index.__tsonic_module_init();",
    "if (!Index.run()) throw new Exception(\"general native JSON value/identity\");",
    "for (int iteration = 0; iteration < 1024; iteration++) if (!Index.identity()) throw new Exception(\"native alias warmup\");",
    "long before = GC.GetAllocatedBytesForCurrentThread();",
    "bool same = true;",
    "for (int iteration = 0; iteration < 4096; iteration++) same &= Index.identity();",
    "long allocated = GC.GetAllocatedBytesForCurrentThread() - before;",
    "if (!same || allocated != 0) throw new Exception($\"native alias allocation {allocated}\");",
    "Console.WriteLine($\"json-native-identity:{same}:{allocated}\");",
  ].join("\n");
  const output = executeCsharpConstruction(compiled, "json-declared-native-identity", false, false, [], nativeProgram);
  assert.match(output, /^json-native-identity:True:0\s*$/u,
    "the original native references retain identity with no per-read delegate, copy or extra allocation");
});
