import assert from "node:assert/strict";
import test from "node:test";
import { csharpObjectMethodValueIsExtracted } from "../../../dist/analysis/objects/shapes/method-values.js";
import { analyzeCsharpSource, assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";

// The Source facts program the C# session built and its Host storage analysis (facts.analyses.storage), nextgen
// C-2542: createTargetSourceProgram needs the composition's profile; createSourceStorageQuery is not public.
function sessionStorage(sourceText) {
  const checked = analyzeCsharpSource({ sourceText });
  assert.equal(checked.sourceDiagnosticsText, "", "the unchanged authored method and its actual uses check");
  const { source } = checked;
  const file = source.sourceFiles.find(candidate => source.syntax.getFileName(candidate) === "/project/index.ts");
  const storage = source.facts.analyses.storage({ sourceFiles: [file] });
  return { source, storage, inputs: { storage, facts: source.facts, ast: source.syntax } };
}

for (const [label, operation, extracted] of [
  ["direct native method", "", false],
  ["actual method-value extraction", "const callback = holder.run; callback(3);", true],
  ["actual method replacement", "holder.run = value => value + 2;", true],
]) {
  test(`an exported native method records only ${label}`, () => {
    const { source, storage, inputs } = sessionStorage(`
        type Operation = { run(value: number): number };
        export function create(): Operation {
          const holder = { run(value: number) { return value + 1; } };
          ${operation}
          return holder;
        }
      `);
    const methods = storage.nodes.filter(node => source.syntax.is.IsMethodDeclaration(node));
    assert.equal(methods.length, 1, "one original checked authored method is selected");
    const method = methods[0];
    assert.equal(csharpObjectMethodValueIsExtracted(inputs, method), extracted,
      "external publication is not an authored first-class read; actual reads and writes remain retained");
    const subject = storage.memberSubjectFor(method);
    assert.equal(subject.kind, "resolved", "the exact physical method identity remains available");
    const writes = storage.memberWritesFor(subject.subject);
    assert.equal(writes.kind !== "unresolved", true, "the original physical write evidence remains complete enough to inspect");
    assert.equal(writes.writes.length, label === "actual method replacement" ? 1 : 0,
      "actual source assignments are neither hidden nor manufactured");
    assert.equal(storage.failureReason(), undefined, "the exact source-storage proof stays within the existing budget");
  });
}

test("a holder passed to a declared external mutator retains its extracted method value", () => {
  const sourceText = `
    type Operation = { run(value: number): number };
    declare function externalMutator(holder: Operation): void;
    export function create(): Operation {
      const holder = { run(value: number) { return value + 1; } };
      externalMutator(holder);
      return holder;
    }
  `;
  const { source, storage, inputs } = sessionStorage(sourceText);
  const methods = storage.nodes.filter(node => source.syntax.is.IsMethodDeclaration(node));
  assert.equal(methods.length, 1, "one physical authored method is selected");
  const method = methods[0];
  const subject = storage.memberSubjectFor(method);
  assert.equal(subject.kind, "resolved", "the actual holder method keeps its exact storage identity");
  const domain = storage.closedOriginsFor(subject.subject);
  assert.equal(domain.kind, "open", "the external mutator keeps the actual method domain open");
  assert.equal(domain.boundaries.some(boundary => boundary.kind !== "external-write" ||
    !source.syntax.is.IsFunctionDeclaration(boundary.exposure) ||
    !source.facts.navigation.uses.summary(boundary.exposure).exported), true,
  "the declared external call is not only an exported-function boundary");
  assert.equal(csharpObjectMethodValueIsExtracted(inputs, method), true,
    "a declared external mutator must retain the replaceable method value, not a fixed native method");
  assert.equal(storage.failureReason(), undefined, "the external-mutator proof uses the existing storage budget");
  const compiled = compileCsharpSource({ sourceText });
  assertCsharpCompilationSucceeded(compiled);
  const members = compiled.result.program.objectShapes.knownShapes()
    .flatMap(shape => shape.members.filter(member => member.sourceName === "run"));
  assert.equal(members.length > 0, true, "the actual checked method reaches C# shape selection");
  assert.equal(members.every(member => member.methodValueStorage !== undefined), true,
    "every emitted view of the externally mutable method retains its physical callable slot");
});
