import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { authoredObjectMethodEvidenceSource } from "../../../../tsonic/test/fixtures/generic-object-methods.mjs";
import { factorySharedChooserSource, mutableMethodSources } from "./authored-object-methods.fixtures.mjs";

for (const surface of Array.from(["native", "js"]).slice(1, 2)) {
for (const [name, sourceText] of Array.from(mutableMethodSources).slice(9, 11)) {
test(`mutable native methods retain ${name} (${surface})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    const shapes = program.objectShapes.knownShapes().filter(shape => shape.methodImplementation !== undefined);
    const methods = shapes.flatMap(shape => program.records.objectMethods.get(shape) ?? []);
    assert.equal(methods.some(method => method.emission.value.kind !== "fixed"), true,
      "the complete checked native body has a real mutable callable-value owner");
    const source = [...compiled.artifacts.values()].join("\n");
    assert.equal(/Func<__TsonicShape_/u.test(source), false,
      "a native body never allocates an open synthetic receiver delegate");
    assert.equal(/dynamic|\.GetType\(/u.test(source), false,
      "the exact stored delegate or protocol never needs dynamic invocation");
    executeCsharpConstruction(compiled, `mutable-authored-${name.replaceAll(" ", "-")}-${surface}`);
  });
}
}

for (const surface of Array.from(["native", "js"]).slice(0, 2)) {
test(`shared factory method receiver keeps the original whole interface scenario as a precise v1 refusal (${surface})`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: factorySharedChooserSource });
    assert.equal(compiled.sourceDiagnosticsText, "", "the complete original factory program stays source-valid");
    assert.equal(compiled.result.program === undefined, true, "a factory-call receiver has no v1 native write admission");
    assert.equal(compiled.targetDiagnostics.length, 1,
      `the one actual receiver failure owns both writes, not unrelated failures; ${compiled.targetDiagnostics.slice(0, 4)
        .map(issue => `${issue.code}: ${issue.message.slice(0, 512)}`).join(" | ")}`);
    assert.equal(compiled.targetDiagnostics[0].code, "CSHARP_SOURCE_STORAGE_NOT_PROVEN", "the original source-storage owner refuses");
    assert.equal(compiled.targetDiagnostics[0].message,
      "Member-write demand requires a parameter binding or a qualified local alias, not an element, property or call result.",
      "the precise shared v1 receiver scope is not a native impossibility");
    assert.equal(compiled.artifacts.size, 0, "the complete refused program produces no artifacts");
  });

test(`distinct unresolved factory method receivers retain their independent refusals (${surface})`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import type { int32 } from "@tsonic/core/types.js";
interface Reader { read(): int32; }
function make(): Reader { return { read(): int32 { return 1; } }; }
export function run(): int32 {
  const first = make();
  const second = make();
  first.read = (): int32 => 3;
  first.read = (): int32 => 4;
  second.read = (): int32 => 5;
  return 7;
}
` });
    assert.equal(compiled.sourceDiagnosticsText, "", "both distinct receivers and all three writes remain source-valid");
    assert.equal(compiled.targetDiagnostics.length, 2,
      `repeating one receiver refusal never hides the other receiver failure; ${compiled.targetDiagnostics.slice(0, 4)
        .map(issue => `${issue.code}: ${issue.message.slice(0, 512)}`).join(" | ")}`);
    assert.equal(compiled.targetDiagnostics.every(issue => issue.code === "CSHARP_SOURCE_STORAGE_NOT_PROVEN" &&
      issue.message === "Member-write demand requires a parameter binding or a qualified local alias, not an element, property or call result."),
    true, "each independent receiver retains the original precise source owner reason");
    assert.equal(compiled.result.program === undefined && compiled.artifacts.size === 0, true, "neither refused receiver produces a sealed program or artifacts");
  });
}

for (const surface of Array.from(["native", "js"]).slice(0, 2)) {
for (const [name, receiver] of Array.from([
  ["interface array element", "values[0]!"],
  ["interface property", "container.owner"],
  ["interface call result", "choose()"],
]).slice(0, 3)) {
test(`native method writes refuse unresolved ${name} demand (${surface})`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import type { int32 } from "@tsonic/core/types.js";
interface Reader { read(): int32; }
const owner: Reader = { read(): int32 { return 1; } };
const values: Reader[] = [owner];
const container: { owner: Reader } = { owner };
function choose(): Reader { return owner; }
export function run(): int32 { ${receiver}.read = (): int32 => 3; return owner.read(); }
` });
    assert.equal(compiled.sourceDiagnosticsText, "", "the retained program is source-valid before native admission");
    assert.equal(compiled.result.program === undefined, true, "an unresolved source write cannot seal a native contract");
    assert.equal(compiled.targetDiagnostics.length, 1, "one original source-write reason owns the refusal");
    assert.equal(compiled.targetDiagnostics[0].code, "CSHARP_SOURCE_STORAGE_NOT_PROVEN", "the source-storage boundary owns the diagnostic");
    assert.equal(compiled.targetDiagnostics[0].message,
      "Member-write demand requires a parameter binding or a qualified local alias, not an element, property or call result.",
      "the real v1 boundary is stated precisely, not disguised as native impossibility");
    assert.equal(compiled.artifacts.size, 0, "unproved native writes emit no output");
  });
}
}

for (const surface of Array.from(["native", "js"]).slice(0, 2)) {
for (const typeOnly of Array.from([false, true]).slice(0, 2)) {
test(`unemitted native method writes do not reject live code (${surface}, type-only=${typeOnly})`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import type { int32 } from "@tsonic/core/types.js";
interface Reader { read(): int32; }
export function run(): int32 {
  function hidden(values: Reader[]): void { values[0]!.read = (): int32 => 3; }
  ${typeOnly ? "type HiddenParameters = Parameters<typeof hidden>;" : ""}
  return 7;
}
` });
    assertCsharpCompilationSucceeded(compiled);
    assert.equal(compiled.sourceDiagnosticsText, "", "the original dormant source and type-only use remain source-valid");
    assert.equal(compiled.targetDiagnostics.length, 0, "only an actually selected native write consumes its shared refusal");
    assert.equal([...compiled.artifacts.values()].some(source => source.includes("hidden")), false,
      "the unsupported dormant body is erased rather than emitted without its required proof");
    executeCsharpConstruction(compiled, `unemitted-authored-method-${surface}-${typeOnly}`, false, false, [],
      'if (Tsonic.Generated.Index.run() != 7) throw new System.Exception("dormant native write");');
  });
}
}
