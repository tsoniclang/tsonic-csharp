import assert from "node:assert/strict";
import test from "node:test";
import {
  assertCsharpCompilationSucceeded,
  assertCsharpCheckingSucceeded,
  compileCsharpSource,
} from "../../helpers/direct-csharp-session.mjs";
import { csharpProgramObjectLiteralShapes } from "../../helpers/program-source-files.mjs";
import { staticKeys } from "./computed-field-names.fixtures.mjs";

for (const surface of [undefined, "js"]){
for (const current of staticKeys){
test(`C# ${surface ?? "native"} ${current.refused ? "refuses a conflicting checker identity for" : "admits"} ${current.name} as an ordinary exact field`, () => {
      if (current.refused) {
        for (const computed of [false, true]) {
          const compiled = compileCsharpSource({ surface, sourceText: `
${current.prelude}
interface Holder { ${computed ? `[${current.declarationKey ?? current.key}]` : current.ordinary}: number; }
export function make(): number {
  const value: Holder = { ${computed ? `[${current.key}]` : current.ordinary}: 7 };
  return value[${current.key}];
}
` });
          assertCsharpCheckingSucceeded(compiled);
          const issues = compiled.targetDiagnostics.filter(issue => issue.code === "CSHARP_COMPUTED_FIELD_NAME_NOT_PROVEN");
          assert.equal(issues.length > 0 && issues.every(issue => issue.message.includes("checker key") && issue.message.includes("exact string key")), true,
            "every conflicting named identity has the precise shared admission reason");
          assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined, true, "R1 rejects before sealing and planning");
          assert.equal(compiled.result.artifacts.length, 0, "R1 emits no incorrect native field");
        }
        return;
      }
      const compiled = compileCsharpSource({ surface, sourceText: `
${current.prelude}
interface Holder { [${current.declarationKey ?? current.key}]: number; }
export function make(): number {
  const value: Holder = { [${current.key}]: 7 };
  return value[${current.key}];
}
` });
      assertCsharpCompilationSucceeded(compiled);
      const ordinary = compileCsharpSource({ surface, sourceText: `
${current.prelude}
interface Holder { ${current.ordinary}: number; }
export function make(): number {
  const value: Holder = { ${current.ordinary}: 7 };
  return value[${current.key}];
}
` });
      assertCsharpCompilationSucceeded(ordinary);
      assert.equal(compiled.result.program !== undefined, true, "analyzed computed-field program exists");
      assert.equal(compiled.result.plan !== undefined, true, "computed-field program reaches planning");
      assert.equal(compiled.result.artifacts.length > 0, true, "computed-field program emits native artifacts");
      const expectedName = current.expected ?? (current.ordinary.startsWith('"') ? JSON.parse(current.ordinary) : current.ordinary);
      assert.equal(csharpProgramObjectLiteralShapes(compiled.result.program).some(shape => shape.members.some(member =>
        member.sourceKey.kind === "property" && member.sourceKey.name === expectedName)), true,
      "sealed native member preserves the exact source key, not a rounded checked spelling");
    });
}
}
