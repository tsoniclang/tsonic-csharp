import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { createCsharpProjectTypeCatalog } from "../../../dist/analysis/project-types/catalog.js";

// The catalog host is `{ ast, facts, sourceFiles }` over the Source facts program the C# session built (nextgen
// C-2542: createTargetSourceProgram needs the composition's profile; enum constants come from facts.values.literal).
function fixture() {
  const checked = analyzeCsharpSource({
    sourceText: `export { CookieOptions as LeftOptions } from "./left.js";
        export { CookieOptions as RightOptions } from "./right.js";`,
    files: {
      "left.ts": `export interface CookieOptions { left: string }
        export interface UniqueOptions { value: number }
        export class Entry<T> { value: T; constructor(value: T) { this.value = value; } }
        export enum Status { Done = 1 }`,
      "right.ts": `export interface CookieOptions { right: number }
        export class Entry<T> { value: T; constructor(value: T) { this.value = value; } }
        export enum Status { Done = 2 }`,
    },
  });
  assert.equal(checked.sourceDiagnosticsText, "", "the colliding module declarations are checked source");
  const { source } = checked;
  return { source, host: { ast: source.syntax, facts: source.facts, sourceFiles: source.sourceFiles, sourceFacts: source.sourceFacts } };
}

test("C# project declaration scopes preserve colliding authored names and exact module identities", () => {
  const { host } = fixture();
  const catalog = createCsharpProjectTypeCatalog(host);
  assert.equal(catalog.issues.length, 0);
  const scopes = new Map();
  for (const definition of catalog.definitions) {
    assert.equal(Object.isFrozen(definition), true, definition.sourceName);
    if (definition.sourceName === "UniqueOptions") {
      assert.equal(definition.scopeName === undefined, true, "unambiguous authored name stays unqualified");
      continue;
    }
    assert.equal(typeof definition.scopeName, "string", definition.sourceName);
    const file = host.ast.getFileName(definition.sourceFile);
    const previous = scopes.get(file);
    if (previous !== undefined) assert.equal(definition.scopeName, previous, "one exact module scope");
    scopes.set(file, definition.scopeName);
    const arguments_ = definition.typeParameterBindings;
    const selected = catalog.targetTypeForDeclaration(definition.declaration, arguments_);
    assert.equal(selected === undefined, false, definition.sourceName);
    assert.equal(selected.id, definition.id, "canonical declaration identity");
    assert.equal(selected.csharpRender.name, definition.sourceName, "no authored recasing or suffixing");
    assert.deepEqual(selected.csharpRender.namespace, [definition.scopeName]);
    assert.equal(catalog.definitionForTarget(selected) === definition, true, "one identity owner");
    assert.equal(catalog.targetTypeForDeclaration(definition.declaration, [...arguments_, { kind: "source-primitive", name: "int32" }]) === undefined,
      true, "module scopes do not weaken generic arity");
  }
  assert.equal(scopes.size, 2);
  assert.equal(new Set(scopes.values()).size, 2, "separate source modules retain distinct native scopes");
  const reversed = createCsharpProjectTypeCatalog({ ...host, sourceFiles: [...host.sourceFiles].reverse() });
  for (const definition of catalog.definitions) {
    assert.equal(reversed.definitionForDeclaration(definition.declaration)?.scopeName, definition.scopeName,
      "scope allocation does not depend on source-file visitation order");
  }
});

test("C# module scope allocation fails closed without exact source identity", () => {
  const { host } = fixture();
  const catalog = createCsharpProjectTypeCatalog({ ...host, ast: { ...host.ast, getPath: () => undefined } });
  assert.equal(catalog.definitions.length, 0, "no admitted declaration without its exact identity");
  for (const file of host.sourceFiles) {
    for (const declaration of host.ast.statements(file)) {
      assert.equal(catalog.targetTypeForDeclaration(declaration, []) === undefined, true, "no guessed qualification");
    }
  }
});
