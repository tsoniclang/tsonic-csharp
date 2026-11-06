import assert from "node:assert/strict";
import test from "node:test";
import { checkCsharpSource, compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { classifyCsharpSourceProfileDeclaration } from "../../../dist/policy/identities/source-types.js";
import { selectCsharpSourceProfileCarrier } from "../../../dist/policy/operations/source-profiles/type-carriers.js";
import { csharpObjectTargetType, csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";

function declarations(checked, fileName) {
  const file = checked.source.getSourceFile(fileName);
  assert.equal(file !== undefined, true, "the genuine checked declaration file exists");
  const ast = checked.source.ast;
  const result = [];
  const visit = node => {
    if (ast.is.IsTypeAliasDeclaration(node)) result.push(node);
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(file);
  return result;
}

for (const surface of ["native", "js"]) {
  test(`trusted readonly views keep object class alias and array identity (${surface})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      class Owned { value: number = 1.5; }
      type Alias = Owned;
      export function run(): boolean {
        const original = new Owned();
        const viewed: Readonly<Alias> = original;
        const broad: object = original;
        const readonlyBroad: Readonly<object> = broad;
        const entries: Alias[] = [original];
        const readonlyEntries: Readonly<Alias[]> = entries;
        return viewed === original && readonlyBroad === original &&
          readonlyEntries === entries && viewed.value === 1.5;
      }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const text = [...compiled.artifacts.values()].join("\n");
    assert.doesNotMatch(text, /EmptyObject|FrozenObject|ConditionalWeakTable|dynamic\b|Unsafe\./);
    assert.match(text, /object readonlyBroad = broad;/);
    assert.match(text, /Owned viewed = original;/);
    executeCsharpConstruction(compiled, `readonly-view-native-identities-${surface}`);
  });

  test(`trusted readonly carrier dispatch retains the exact published argument and rejects invalid arity (${surface})`, () => {
    const checked = checkCsharpSource({ surface, sourceText: "export const retained: number = 1.5;" });
    assert.equal(checked.source.diagnostics.length, 0, "the source fixture checks");
    const ast = checked.source.ast;
    const owner = surface === "js" ? "js" : "csharp";
    const declaration = declarations(checked, `/project/.tsonic/source-profiles/${owner}/typescript-utilities.d.ts`)
      .find(node => ast.text(ast.name(node)) === "Readonly");
    assert.equal(declaration !== undefined, true, "the profile supplies its canonical readonly declaration");
    const identity = classifyCsharpSourceProfileDeclaration(declaration, ast);
    assert.equal(identity?.kind, "readonly-view", "only the trusted profile declaration publishes the view identity");
    const object = csharpObjectTargetType();
    const element = csharpSourcePrimitiveTargetType("int64");
    const array = { kind: "array", element };
    for (const carrier of [object, array, element]) {
      assert.equal(selectCsharpSourceProfileCarrier({ dictionaryCarrier: undefined }, identity, [carrier]) === carrier,
        true, "the dispatcher returns the exact selected carrier without reconstruction");
    }
    for (const arguments_ of [[], [object, array]]) {
      assert.equal(selectCsharpSourceProfileCarrier({ dictionaryCarrier: undefined }, identity, arguments_) === undefined,
        true, "missing and excess arguments cannot produce a carrier");
    }
    assert.equal(selectCsharpSourceProfileCarrier({ dictionaryCarrier: undefined }, undefined, [object]) === undefined,
      true, "an absent declaration identity does not trigger an argument fallback");
  });

  test(`a readonly view retains the changed mapped construction owner's refusal (${surface})`, () => {
    const sourceText = `
      class Owned { value: number = 1.5; }
      type Changed<Value> = { [Key in keyof Value]: string };
      export function run(): boolean {
        const changed: Changed<Owned> = { value: "changed" };
        const viewed: Readonly<Changed<Owned>> = changed;
        return viewed === changed && viewed.value === "changed";
      }
    `;
    const compiled = compileCsharpSource({ surface, sourceText });
    assert.equal(compiled.sourceDiagnosticsText, "", "the mapped contract is checked Source, not a syntax error");
    assert.equal(compiled.result.diagnostics.length, 1);
    const diagnostic = compiled.result.diagnostics[0];
    assert.equal(diagnostic.code, "CSHARP_UNSUPPORTED_AST");
    assert.equal(diagnostic.message, "Object-literal construction requires exact member correspondence with its declared native contract.");
    const ast = compiled.source.ast;
    assert.equal(ast.kindName(diagnostic.sourceNode), "KindObjectLiteralExpression");
    assert.equal(sourceText.slice(ast.pos(diagnostic.sourceNode), ast.end(diagnostic.sourceNode)), " { value: \"changed\" }");
    assert.equal(compiled.artifacts.size, 0, "the readonly identity cannot rescue a refused changed-mapped construction");
  });
}

test("project readonly spelling and changed mapped aliases cannot acquire the profile identity", () => {
  const checked = checkCsharpSource({ surface: "js", sourceText: `
    type Readonly<Value> = { readonly [Key in keyof Value]: string };
    type Changed<Value> = { readonly [Key in keyof Value]: string };
    export const retained: number = 1.5;
  ` });
  assert.equal(checked.source.diagnostics.length, 0, "the foreign aliases are genuine valid Source declarations");
  const aliases = declarations(checked, "/project/index.ts");
  assert.equal(aliases.length, 2);
  for (const declaration of aliases) {
    const identity = classifyCsharpSourceProfileDeclaration(declaration, checked.source.ast);
    assert.equal(identity === undefined, true, "neither spelling nor a mapped body is a trusted declaration identity");
    assert.equal(selectCsharpSourceProfileCarrier({ dictionaryCarrier: undefined }, identity,
      [csharpSourcePrimitiveTargetType("int64")]) === undefined, true, "the other alias owner remains authoritative");
  }
});

test("trusted readonly views retain the existing Source write prohibition", () => {
  const checked = checkCsharpSource({ surface: "js", sourceText: `
    class Owned { value: number = 1.5; }
    const original = new Owned();
    const viewed: Readonly<Owned> = original;
    viewed.value = 2.5;
  ` });
  assert.equal(checked.source.diagnostics.length, 1, "the original mutability rule rejects the one write");
  const diagnostic = checked.source.diagnostics[0];
  assert.equal(diagnostic.code, 2540);
  assert.equal(diagnostic.message.text, "Cannot assign to '{0}' because it is a read-only property.");
  assert.match(checked.sourceDiagnosticsText, /Cannot assign to 'value' because it is a read-only property\./);
});
