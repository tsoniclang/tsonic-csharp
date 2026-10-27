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

for (const surface of Array.from(["native", "js"]).slice(1, 2)) {
for (const [name, body, nativeBody, definitions] of Array.from(boxing).slice(10, 11)) {
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

for (const surface of Array.from(["native", "js"]).slice(0, 2)) {
test(`${surface}: plain unboxed shapes do not gain a closed broad-value marker`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: header + "export function make() { return { count: 7 as int32 }; }" });
    assertCsharpCompilationSucceeded(compiled);
    const shapes = compiled.result.program.records.objectShapeArtifact.artifacts.filter(artifact => artifact.materialization === "synthetic" &&
      artifact.fact.members.some(member => member.sourceName === "count"));
    assert.equal(shapes.length > 0, true, "a real generated plain shape remains in the artifact set");
    assert.equal(shapes.every(artifact => !artifact.capabilities.includes("reference-identity")), true, "no blanket every-shape capability");
    assert.equal([...compiled.artifacts.values()].some(text => text.includes("ITsClosedValueCarrier")), false,
      "plain native storage remains free of the compatibility marker");
  });

test(`${surface}: retained structural rest adapters box every admitted payload without losing alias identity`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: header + `
      interface Reader { read(...values: { count: int32 }[]): unknown; }
      class Source { read(...values: unknown[]): unknown { return values[0]; } }
      export function run(): boolean {
        const value = { count: 7 as int32 }; const reader: Reader = new Source(); return reader.read(value) === value;
      }
    ` });
    executeCsharpConstruction(compiled, `artifact-box-rest-${surface}`);
  });

test(`${surface}: contextual parameter/default adapters retain the actual selected boxed storage`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: header + `
      function invoke(callback: (value: { count: int32 }) => boolean): boolean { return callback({ count: 7 as int32 }); }
      export function run(): boolean {
        return invoke((value: unknown = { count: 7 as int32 }): boolean => typeof value === "object");
      }
    ` });
    executeCsharpConstruction(compiled, `artifact-box-default-${surface}`);
  });
}

test("selected closed Object.values member conversions retain exact nested payload identity", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: header + `
    export function run(): boolean {
      const nested = { count: 7 as int32 }; const broad: unknown = "text";
      const source = { nested, broad }; const values = Object.values(source);
      return values[0] === nested && values[1] === broad;
    }
  ` });
  executeCsharpConstruction(compiled, "artifact-box-selected-projection");
});

for (const surface of Array.from(["native", "js"]).slice(0, 2)) {
test(`${surface}: present native lambda inputs adapt without evaluating an absent-only default`, () => {
  const compiled = compileCsharpSource({ surface, sourceText: header + `
    let defaults: int32 = 0;
    function defaultCount(): int32 { return defaults; }
    function fallback(): unknown { defaults += 1; return { count: 11 as int32 }; }
    function invoke(callback: (value: { count: int32 }) => boolean): boolean {
      return callback({ count: 7 as int32 });
    }
    function optional(value: unknown = fallback()): boolean { return typeof value === "object"; }
    export function run(): boolean {
      defaults = 0;
      const selected = invoke((value: unknown = fallback()): boolean => typeof value === "object");
      if (!selected || defaultCount() !== 0) return false;
      if (!optional() || defaultCount() !== 1) return false;
      return true;
    }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  const program = compiled.result.program;
  let entries = 0;
  const visit = node => {
    if (program.source.ast.is.IsArrowFunction(node)) {
      const parameter = program.records.callableDeclaration.get(node).contract.parameters[0];
      const entry = program.records.lambdaParameterEntry.get(parameter);
      assert.equal(entry.kind, "conversion", "the admitted present native input retains its actual boxing adaptation");
      assert.equal(entry.conversion.kind, "js-value-box", "the native parameter does not masquerade as body storage");
      assert.equal(program.records.jsValueBoxing.get(parameter, entry.source)?.kind, "wrap",
        "the same selected parameter conversion owns its complete native boxing demand before artifact sealing");
      entries += 1;
    }
    program.source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  program.source.navigation.sourceFiles.forEach(visit);
  assert.equal(entries, 1, "the witness observes the actual defaulted native lambda");
  executeCsharpConstruction(compiled, `present-native-lambda-default-${surface}`);
});
}
