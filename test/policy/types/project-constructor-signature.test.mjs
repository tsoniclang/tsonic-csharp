import { csharpTestSourceProgram } from "../../helpers/target-source-program.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles, formatDiagnostics } from "@tsonic/tsts";
import { selectCsharpProjectConstructorSignature } from "../../../dist/analysis/project-types/catalog/constructors.js";

function fixture() {
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/src",
    compilerOptions: { strict: true, module: "esnext", target: "es2022" },
    files: { "/src/index.ts": `
      export class First { constructor(value: number) {} }
      export class Second { constructor(value: number) {} }
    ` },
  }).checkSource();
  assert.equal(checked.diagnostics.length, 0, formatDiagnostics(checked.diagnostics));
  const source = csharpTestSourceProgram(checked);
  const declarations = source.syntax.statements(checked.getSourceFile("/src/index.ts"));
  // nextgen C-2542: constructor contracts are the Host construction facts (facts.objects.construction): descriptor
  // signatures that name their declaration and carry descriptor parameters.
  const constructors = declarations.map(declaration => source.facts.objects.construction(declaration));
  assert.equal(constructors.every(selection => !("code" in selection) && selection.signatures.length === 1 &&
    selection.signatures[0].declaration !== undefined), true,
  "both constructor contracts retain their real checked declarations and signatures");
  // nextgen C-2542: the selection reads no Host or checker service (it was a semanticsFor read counter); any host read fails.
  const host = new Proxy({}, { get: (_target, name) => assert.fail(`the constructor selection read host.${String(name)}`) });
  return { source, host, declarations, constructors: constructors.map(selection => selection.signatures[0]) };
}

const parameterTypes = signature => signature.parameters.map(parameter => parameter.type);

test("an absent project constructor collection never queries a foreign checked declaration", () => {
  const current = fixture();
  const foreign = fixture();
  const selected = foreign.constructors[0];
  assert.equal(selectCsharpProjectConstructorSignature(current.host, foreign.declarations[0], selected.declaration,
    parameterTypes(selected), undefined, undefined) === undefined, true,
  "an absent project collection is established before source ownership is queried");
});

test("an exact admitted project constructor is retained without semantic reselection", () => {
  const current = fixture();
  const selected = current.constructors[0];
  const admitted = { source: selected };
  assert.equal(selectCsharpProjectConstructorSignature(current.host, current.declarations[0], selected.declaration,
    parameterTypes(selected), admitted, undefined) === admitted, true, "the admitted result keeps exact identity");
});

test("an owned constructor collection requires the exact signature declaration and its arity", () => {
  const current = fixture();
  const selected = current.constructors[0];
  const other = current.constructors[1];
  const admitted = { source: selected };
  const select = (signature, parameters, candidates = [admitted]) => selectCsharpProjectConstructorSignature(
    current.host, current.declarations[0], signature, parameters, undefined, candidates);
  assert.equal(select(selected.declaration, parameterTypes(selected)) === admitted, true,
    "one exact checked signature declaration selects its existing constructor");
  assert.equal(select(other.declaration, parameterTypes(selected)) === undefined, true,
    "an equally shaped foreign constructor signature is not the selected declaration");
  // nextgen C-2542: parameters are Host descriptors of the selected signature's own declared list, so a different
  // parameter occurrence, omission or rest flag cannot be expressed apart from the signature declaration; the old
  // occurrence / acceptsOmission / rest substitution assertions are removed. The arity guard remains.
  assert.equal(select(selected.declaration, [...parameterTypes(selected), ...parameterTypes(selected)]) === undefined, true,
    "a parameter list of another arity does not select the constructor");
  assert.equal(select(selected.declaration, parameterTypes(selected), [admitted, admitted]) === undefined, true,
    "a non-unique candidate collection is not guessed");
});
