import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { acceptedEffectiveSource, compileEffectiveSource } from "../../helpers/source-effective-types.mjs";
import { resolvedSourceValue } from "../../helpers/published-return-contracts.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { csharpStringTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";

const sourceText = `
  export function closedObject(): string { return JSON.stringify({ count: 7 }); }
  export function closedArray(): string { return JSON.stringify([true, false]); }
  export function primitive(value: string): string { return JSON.stringify(value); }
  export function broad(value: unknown): string | undefined { return JSON.stringify(value); }
  export function maybe(value: string | undefined): string | undefined { return JSON.stringify(value); }
  export function absent(): string | undefined { return JSON.stringify(undefined); }
  export function removed(): string | undefined { return JSON.stringify({ count: 7 }, () => undefined); }
  export function replaced(): string { return JSON.stringify(undefined, () => "restored"); }
  export function projectedAbsence(): string | undefined {
    return JSON.stringify({ toJSON(): undefined { return undefined; } });
  }
  export function projectedAbsenceExplicitNull(): string | undefined {
    return JSON.stringify({ toJSON(): undefined { return undefined; } }, null);
  }
  export function projectedNull(): string | undefined {
    return JSON.stringify({ toJSON(): null { return null; } });
  }
  export function projectedNullExplicitNull(): string | undefined {
    return JSON.stringify({ toJSON(): null { return null; } }, null);
  }
  export function nestedProjectedAbsence(): string {
    return JSON.stringify({ child: { toJSON(): undefined { return undefined; } } });
  }
  export function nestedProjectedNull(): string {
    return JSON.stringify({ child: { toJSON(): null { return null; } } });
  }
  export function arrayProjectedAbsence(): string {
    return JSON.stringify([{ toJSON(): undefined { return undefined; } }]);
  }
  export function nestedNull(): string { return JSON.stringify({ child: null }); }
`;

test("JSON result presence is authenticated for the whole original application, not inferred from its CLR return", () => {
  const compiled = compileEffectiveSource("js", sourceText);
  acceptedEffectiveSource(compiled);
  const source = compiled.source;
  const ast = source.ast;
  const expected = new Map([
    ["closedObject", false], ["closedArray", false], ["primitive", false], ["broad", true], ["maybe", true],
    ["absent", true], ["removed", true], ["replaced", false], ["projectedAbsence", true],
    ["projectedAbsenceExplicitNull", true], ["nestedProjectedAbsence", false], ["arrayProjectedAbsence", false],
    ["projectedNull", true], ["projectedNullExplicitNull", true], ["nestedProjectedNull", false], ["nestedNull", false],
  ]);
  const seen = new Set();
  for (const occurrence of source.facts.values.occurrences()) {
    if (!ast.is.IsCallExpression(occurrence)) continue;
    let declaration = ast.parent(occurrence);
    while (declaration !== undefined && !ast.is.IsFunctionDeclaration(declaration)) declaration = ast.parent(declaration);
    assert.equal(declaration !== undefined, true, "each JSON call has its actual original function owner");
    const name = ast.text(ast.name(declaration));
    assert.equal(expected.has(name) && !seen.has(name), true, "one unchanged application per exact original owner");
    seen.add(name);
    const value = resolvedSourceValue(source.facts.values.type(occurrence), `${name}: actual JSON result`);
    const application = resolvedSourceValue(source.facts.applications.application(occurrence), `${name}: selected JSON application`);
    source.facts.descriptors.assertEvidence(value);
    source.facts.descriptors.assertEvidence(application.result);
    assert.equal(application.identity.invocation === occurrence && application.result.type === value.type, true,
      `${name}: presence belongs to this complete original application`);
    const optional = expected.get(name);
    assert.equal(value.type.kind === "optional", optional, `${name}: exact Source presence`);
    const payload = optional ? value.type.value : value.type;
    assert.equal(payload.kind, "string", `${name}: no invented absence tag or result category`);
    const contract = compiled.result.program.records.returnContract.get(declaration);
    assert.equal(contract?.kind, "resolved", `${name}: an independent real Native return contract exists`);
    const carrier = optional ? csharpNullableTargetType(csharpStringTargetType()) : csharpStringTargetType();
    assert.equal(targetTypeRefEquals(contract.type, carrier), true, `${name}: Native retains the actual Source presence proof`);
  }
  assert.equal(seen.size, expected.size, "unknown, root replacement, projection and closed-data domains are all observed");
});

for (const [name, parameter] of [["unknown", "unknown"], ["maybe absent", "string | undefined"]]) {
  test(`JSON.stringify of ${name} cannot satisfy a required string return`, () => {
    const compiled = compileCsharpSource({ surface: "js", sourceText: `
      export function encode(value: ${parameter}): string { return JSON.stringify(value); }
    ` });
    const issues = compiled.result.diagnostics;
    assert.equal(issues.length, 1, "the actual assignment has one checker-owned refusal");
    assert.equal(issues[0].code === "TSTS_DIAGNOSTIC" && issues[0].source === "tsts" &&
      issues[0].evidence.includes("tsts.code=TS2322"), true, "unknown presence is never narrowed by the Native return carrier");
    assert.equal(issues[0].message.includes("Type 'string | undefined' is not assignable to type 'string'."), true,
      "the complete incompatible Source pair remains explicit");
    assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0, true,
      "an invalid required-string use publishes no Native executable");
  });
}

test("JSON root absence, root replacement and argument effects retain their single native result", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: sourceText + `
    import type { int32 } from "@tsonic/core/types.js";
    export function dateDefault(): string | undefined { return JSON.stringify(new Date("2026-11-08T00:00:00.000Z")); }
    export function dateExplicitNull(): string | undefined { return JSON.stringify(new Date("2026-11-08T00:00:00.000Z"), null); }
    let order: int32 = 0;
    function value(): { count: int32 } { order = order * 10 + 1; return { count: 7 }; }
    function replacer(): (key: string, value: unknown) => undefined {
      order = order * 10 + 2;
      return (key: string, value: unknown): undefined => { order = order * 10 + 4; return undefined; };
    }
    function spacing(): string { order = order * 10 + 3; return "  "; }
    export function ordered(): string | undefined { return JSON.stringify(value(), replacer(), spacing()); }
    export function observed(): int32 { return order; }
  ` });
  executeCsharpConstruction(compiled, "json-whole-operation-presence", false, false, [], String.raw`
    using Subject = Tsonic.Generated.Index;
    if (Subject.closedObject() != "{\"count\":7}" || Subject.closedArray() != "[true,false]" ||
        Subject.primitive("sample") != "\"sample\"" || Subject.replaced() != "\"restored\"" ||
        Subject.nestedProjectedAbsence() != "{\"child\":null}" || Subject.nestedProjectedNull() != "{\"child\":null}" ||
        Subject.arrayProjectedAbsence() != "[null]" ||
        Subject.nestedNull() != "{\"child\":null}" ||
        Subject.dateDefault() != "\"2026-11-08T00:00:00.000Z\"" || Subject.dateDefault() != Subject.dateExplicitNull())
      throw new System.Exception("closed JSON presence or root replacement changed");
    if (Subject.absent() is not null || Subject.removed() is not null || Subject.projectedAbsence() is not null ||
        Subject.projectedAbsenceExplicitNull() is not null || Subject.projectedNull() is not null ||
        Subject.projectedNullExplicitNull() is not null || Subject.maybe(null) is not null ||
        Subject.broad(Tsonic.CSharp.Runtime.TsValue.undefined()) is not null)
      throw new System.Exception("JSON root absence must be native null, not the string null");
    if (Subject.ordered() is not null || Subject.observed() != 1234)
      throw new System.Exception("JSON value, replacer, space and root callback must execute once in original order");
  `);
});
