import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";

function assertExactRefusal(compiled, code, message, text) {
  assert.equal(compiled.sourceDiagnosticsText, "", "the whole original program remains checked");
  assert.equal(compiled.result.diagnostics.length, 1);
  const diagnostic = compiled.result.diagnostics[0];
  assert.equal(diagnostic.code, code);
  assert.equal(diagnostic.message, message);
  assert.equal(diagnostic.sourceNode !== undefined, true, "the exact unsupported operation owns its refusal");
  assert.equal(compiled.source.ast.text(diagnostic.sourceNode), text);
  assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0,
    true, "a refused operation publishes no target facts or source");
}

const ownSetMessage = "Native Exception values do not expose a closed source own-property set; read their declared native properties directly.";
const literalMessage = "Literal-key access to an inherited native Error property is unsupported in v1; use the declared property access instead.";
const unionMessage = "A common inherited native Error property on an un-narrowed runtime union is unsupported in v1; narrow the Error subtype before reading the property.";
const ownSetCalls = ["Object.keys(value)", "Object.values(value)", "Object.entries(value)",
  'Object.hasOwn(value, "message")', 'value.hasOwnProperty("message")', "Object.assign({}, value)"];

for (const surface of [undefined, "js"]) {
  const label = surface ?? "native";
  for (const project of [false, true]) {
    for (const call of ownSetCalls) {
      test(`native Error own-set refusal is local and identity-selected: ${label}/${project}/${call}`, () => {
        const compiled = compileCsharpSource({ surface, sourceText: `
          ${project ? 'class Failure extends Error { detail: string = "own"; }' : ""}
          export function run(value: ${project ? "Failure" : "Error"}): void { ${call}; }
        ` });
        assertExactRefusal(compiled, "CSHARP_ERROR_OWN_SET_UNSUPPORTED", ownSetMessage, call);
      });
    }
  }
  for (const property of ["name", "message", "stack", "cause"]) {
    test(`native Error inherited literal-key ${property} has the exact v1 refusal (${label})`, () => {
      const text = `value["${property}"]`;
      const compiled = compileCsharpSource({ surface, sourceText: `export function run(value: Error): void { ${text}; }` });
      assertExactRefusal(compiled, "CSHARP_ERROR_LITERAL_PROPERTY_UNSUPPORTED", literalMessage, text);
    });
  }
  test(`native Error common runtime-union inherited property has the exact v1 refusal (${label})`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      class First extends Error { first: string = "first"; }
      class Second extends Error { second: string = "second"; }
      export function run(value: First | Second): string { return value.message; }
    ` });
    assertExactRefusal(compiled, "CSHARP_ERROR_UNION_PROPERTY_UNSUPPORTED", unionMessage, "value.message");
  });
}
