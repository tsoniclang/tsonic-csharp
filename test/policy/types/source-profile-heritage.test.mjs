import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";

for (const surface of ["native", "js"]) {
  test(`native Error inheritance is independent of value storage (${surface})`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      import { ImportedFailure } from "./failure.js";
      export class Failure extends Error {}
      export class DetailedFailure extends ImportedFailure { readonly code = 7; }
      export class Box<T> { constructor(readonly value: T) {} }
      export class ErrorBox extends Box<Error> {}
      export function transport(value: Error): Error { return value; }
    `, files: { "failure.ts": `export class ImportedFailure extends Error {}` } });
    assertCsharpCompilationSucceeded(compiled);
    const generated = [...compiled.artifacts.values()].join("\n");
    assert.match(generated, /class Failure\s*:\s*Tsonic\.CSharp\.Runtime\.Error\b/u);
    assert.match(generated, /class ImportedFailure\s*:\s*Tsonic\.CSharp\.Runtime\.Error\b/u);
    assert.match(generated, /class DetailedFailure\s*:\s*(?:\w+\.)*ImportedFailure\b/u);
    assert.match(generated, /class ErrorBox\s*:\s*Box<System\.Exception>/u);
    assert.match(generated, /System\.Exception transport\(System\.Exception value\)/u);
  });
}
