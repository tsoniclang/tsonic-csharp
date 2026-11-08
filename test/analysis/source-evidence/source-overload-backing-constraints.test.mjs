import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCsharpSource, assertCsharpCheckingSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { resolvedSourceValue } from "../../helpers/published-return-contracts.mjs";

const wide = 'declare function choose(kind: "wide", value: int64): void;';
const text = 'declare function choose(kind: "text", value: string): void;';

for (const [name, declarations, selectedIndex] of [
  ["first", [wide, text], 0],
  ["later after a proved inapplicable earlier declaration", [text, wide], 1],
]) test(`ADDITIVE C2617: the ${name} configured Source overload retains its original signature and width`, () => {
  const compiled = analyzeCsharpSource({ sourceText: `
    import type { int64 } from "@tsonic/core/types.js";
    ${declarations.join("\n")}
    export function run(): void { choose("wide", 4); }
  ` });
  assertCsharpCheckingSucceeded(compiled);
  const source = compiled.source;
  const ast = source.ast;
  const files = source.sourceFiles.filter(file => !ast.isDeclarationFile(file));
  assert.equal(files.length, 1, "the normal Source assembly retains the original project file");
  const originals = ast.statements(files[0]).filter(declaration => ast.is.IsFunctionDeclaration(declaration) &&
    ast.text(ast.name(declaration)) === "choose");
  assert.equal(originals.length, 2, "both original overload declarations retain declaration order");
  const calls = source.facts.values.occurrences().filter(occurrence => ast.getSourceFile(occurrence) === files[0] &&
    ast.is.IsCallExpression(occurrence));
  assert.equal(calls.length, 1, "the complete value inventory contains the exact original invocation");
  const invocation = calls[0];
  const application = resolvedSourceValue(source.facts.applications.application(invocation), "the actual configured Source application");
  assert.equal(application.identity.invocation === invocation, true, "no sibling invocation supplies selection authority");
  assert.equal(application.identity.signature.declaration === originals[selectedIndex], true,
    "Source selects the earliest fully applicable original declaration, not the last failed raw alternative");
  const callable = resolvedSourceValue(source.facts.values.type(originals[0]), "the enrolled original callable declaration");
  source.facts.descriptors.assertEvidence(callable);
  const definition = callable.type.kind === "declared"
    ? resolvedSourceValue(source.facts.descriptors.definition(callable), "the same-view callable definition") : callable;
  assert.equal(definition.type.kind === "callable" || definition.type.kind === "shape", true,
    "the Source owner publishes the actual callable signature inventory");
  const signatures = definition.type.calls.filter(signature => signature.identity.declaration === originals[selectedIndex]);
  assert.equal(signatures.length, 1, "the winning original declaration has one canonical Source signature");
  assert.equal(application.identity.signature === signatures[0].identity, true,
    "the application retains the identical same-view signature rather than reconstructing its shape");
  assert.equal(application.sourceArguments.length, 2, "both original evaluation operands remain published");
  assert.equal(application.arguments.length, 2, "both effective parameter bindings remain published");
  const argument = application.arguments[1];
  assert.equal(argument.sourceArgumentIndex === 1 && argument.effectiveArgumentIndex === 1 &&
    argument.sourceArgument === application.sourceArguments[1].occurrence &&
    argument.parameter.signature === application.identity.signature && argument.parameter.index === 1 &&
    argument.parameter.declaration === ast.parameters(originals[selectedIndex])[1], true,
  "the value argument binds the exact original selected parameter, not an alternative's parameter");
  source.facts.descriptors.assertEvidence(argument.destination.applied);
  assert.equal(argument.destination.applied.type.kind === "primitive" &&
    argument.destination.applied.type.primitive === "int64", true, "backing admission preserves the selected native width");
});

test("ADDITIVE C2617: an original argument-expression error cannot publish Native code", () => {
  const compiled = compileCsharpSource({ sourceText: `
    import type { int64 } from "@tsonic/core/types.js";
    ${wide}
    ${text}
    export function run(): void { choose("wide", missingName); }
  ` });
  const missing = compiled.result.diagnostics.filter(issue => issue.category === "error" &&
    issue.code === "TSTS_DIAGNOSTIC" && issue.source === "tsts" &&
    issue.evidence?.includes("tsts.code=TS2304"));
  assert.equal(missing.length, 1, "the actual missing argument expression remains a checker-owned error, not a discharged applicability obligation");
  assert.equal(missing[0].message.includes("Cannot find name 'missingName'."), true,
    "the original argument-expression diagnostic is retained without inventing an aggregate root");
  assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0, true,
    "an invalid argument expression never reaches Native publication");
});
