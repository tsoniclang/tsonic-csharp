import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles, formatDiagnostics } from "@tsonic/tsts";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { selectCsharpProjectConstructorSignature } from "../../../dist/policy/types/project/project-type-constructors.js";

function fixture() {
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/src",
    compilerOptions: { strict: true, module: "esnext", target: "es2022" },
    files: { "/src/index.ts": `
      export class First { constructor(value: number) {} }
      export class Second { constructor(value: number) {} }
    ` },
  }).checkSource();
  assert.equal(checked.diagnostics.length, 0, formatDiagnostics(checked.diagnostics));
  const source = createTargetSourceProgram(checked);
  const declarations = source.ast.statements(checked.getSourceFile("/src/index.ts"));
  const constructors = declarations.map(declaration => source.navigation.classConstructors(declaration));
  assert.equal(constructors.every(selection => selection.kind === "resolved" && selection.signatures.length === 1), true,
    "both constructor contracts retain their real checked declarations and signatures");
  let reads = 0;
  const host = { semanticsFor: node => {
    reads += 1;
    return source.semantics.forNode(node);
  } };
  return { source, host, declarations, constructors: constructors.map(selection => selection.signatures[0]),
    reads: () => reads };
}

test("an absent project constructor collection never queries a foreign checked declaration", () => {
  const current = fixture();
  const foreign = fixture();
  const selected = foreign.constructors[0];
  assert.equal(selectCsharpProjectConstructorSignature(current.host, foreign.declarations[0], selected.signature,
    selected.parameters, undefined, undefined) === undefined, true,
  "an absent project collection is established before source ownership is queried");
  assert.equal(current.reads(), 0, "the optional absence performs no source-semantic read");
});

test("an exact admitted project constructor is retained without semantic reselection", () => {
  const current = fixture();
  const selected = current.constructors[0];
  const admitted = { source: selected };
  assert.equal(selectCsharpProjectConstructorSignature(current.host, current.declarations[0], selected.signature,
    selected.parameters, admitted, undefined) === admitted, true, "the admitted result keeps exact identity");
  assert.equal(current.reads(), 0, "the exact-result fast path remains a pure lookup");
});

test("an owned constructor collection requires exact signature and parameter correspondence", () => {
  const current = fixture();
  const selected = current.constructors[0];
  const other = current.constructors[1];
  const admitted = { source: selected };
  const select = (signature, parameters, candidates = [admitted]) => selectCsharpProjectConstructorSignature(
    current.host, current.declarations[0], signature, parameters, undefined, candidates);
  assert.equal(select(selected.signature, selected.parameters) === admitted, true,
    "one exact checked signature and parameter occurrence selects its existing constructor");
  assert.equal(select(other.signature, selected.parameters) === undefined, true,
    "an equally shaped foreign constructor signature is not the selected declaration");
  assert.equal(select(selected.signature, other.parameters) === undefined, true,
    "equal parameter spelling and type cannot substitute a different checked parameter occurrence");
  assert.equal(select(selected.signature, selected.parameters.map(parameter => ({ ...parameter, acceptsOmission: true }))) === undefined,
    true, "native omission correspondence remains exact");
  assert.equal(select(selected.signature, selected.parameters.map(parameter => ({ ...parameter, rest: true }))) === undefined,
    true, "native rest correspondence remains exact");
  assert.equal(select(selected.signature, selected.parameters, [admitted, admitted]) === undefined, true,
    "a non-unique candidate collection is not guessed");
  assert.equal(current.reads(), 6, "each owned selection performs its one exact signature-declaration query");
});
