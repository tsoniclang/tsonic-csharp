import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { assertNativeErrorWriteRefusals, nativeErrorDiagnosticText } from "../../helpers/native-error-refusals.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  const label = surface ?? "native";
  test(`an Error subtype cannot redeclare an inherited native message member (${label})`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      class OwnMessage extends Error { message: string = "project"; }
      export function make(): Error { return new OwnMessage("native"); }
    ` });
    assert.equal(compiled.sourceDiagnosticsText, "", "the complete original redeclaration is checked");
    assert.equal(compiled.result.diagnostics.length, 1);
    const diagnostic = compiled.result.diagnostics[0];
    assert.equal(diagnostic.code, "CSHARP_ERROR_MEMBER_REDECLARATION_UNSUPPORTED");
    assert.equal(diagnostic.message,
      "A project Error subtype cannot redeclare an inherited native Error member; pass its native value to super or use a differently named project field.");
    assert.equal(diagnostic.sourceNode !== undefined, true, "the redeclaring declaration owns its refusal");
    assert.equal(nativeErrorDiagnosticText(compiled, diagnostic), 'message: string = "project";');
    assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0,
      true, "a redeclared native Error member never publishes target facts or output");
  });

  test(`an inherited native Error message write stays locally refused by selected declaration identity (${label})`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      class InheritedMessage extends Error { detail: string = "own"; }
      export function run(): void {
        const original = new InheritedMessage("native");
        original.message = "changed";
      }
    ` });
    assertNativeErrorWriteRefusals(compiled, ["original.message"]);
  });

  for (const [kind, sourceText, text] of [
    ["accessor", 'class OwnMessage extends Error { get message(): string { return "project"; } } export function make(): Error { return new OwnMessage("native"); }',
      'get message(): string { return "project"; }'],
    ["parameter property", 'class OwnMessage extends Error { constructor(public message: string) { super(message); } } export function make(): Error { return new OwnMessage("native"); }',
      "public message: string"],
    ["class expression", 'export const OwnMessage = class extends Error { message: string = "project"; };',
      'message: string = "project";'],
  ]) test(`an Error subtype ${kind} cannot redeclare an inherited native member (${label})`, () => {
    const compiled = compileCsharpSource({ surface, sourceText });
    assert.equal(compiled.sourceDiagnosticsText, "");
    assert.equal(compiled.result.diagnostics.length, 1);
    const diagnostic = compiled.result.diagnostics[0];
    assert.equal(diagnostic.code, "CSHARP_ERROR_MEMBER_REDECLARATION_UNSUPPORTED");
    assert.equal(diagnostic.message,
      "A project Error subtype cannot redeclare an inherited native Error member; pass its native value to super or use a differently named project field.");
    assert.equal(nativeErrorDiagnosticText(compiled, diagnostic), text);
    assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0,
      true, "a refused redeclaration publishes no target facts or source");
  });

  test(`a non-Error project message field remains mutable native storage (${label})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      class OwnMessage { message: string = "project"; }
      export function run(): boolean {
        const original = new OwnMessage();
        const alias = original;
        if (original.message !== "project") return false;
        alias.message = "changed";
        return alias === original && original.message === "changed";
      }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const emitted = [...compiled.artifacts.values()].join("\n");
    assert.doesNotMatch(emitted, /Tsonic\.CSharp\.Runtime\.Error\b|ErrorObject/u);
    executeCsharpConstruction(compiled, `native-project-own-message-${label}`);
  });
}
