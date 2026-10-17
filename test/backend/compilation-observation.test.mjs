import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpTarget } from "../../dist/backend/compile.js";
import { compileCsharpSource } from "../helpers/direct-csharp-session.mjs";
import { assertNoTargetDiagnostics } from "../../../tsonic/test/scripts/diagnostic-assertions.mjs";

const sourceText = "export function identity(value: number): number { return value; }";
const mutation = Object.freeze({ extensionId: "fixture", extensionCode: "REFERENCES_CHANGED",
  numericCode: 9100001, category: "error", message: "Reference mutation detected" });

test("C# session and helper observe the real wrapper's exact program and native plan once", () => {
  let request;
  let program;
  let plan;
  let productionResult;
  const events = [];
  const compiled = compileCsharpSource({ sourceText, compileTarget(received, observer) {
    request = received;
    events.push("compile");
    productionResult = compileCsharpTarget(received, {
      analyzed(value) {
        events.push("analysis");
        program = value;
        observer.analyzed(value);
      },
      planned(value) {
        events.push("plan");
        plan = value;
        observer.planned(value);
      },
    });
    events.push("return");
    return productionResult;
  } });
  assert.deepEqual(events, ["compile", "analysis", "plan", "return"]);
  assertNoTargetDiagnostics(compiled.result.diagnostics);
  assert.equal(request.input.source.ast === compiled.source.ast, true);
  assert.equal(program.source.ast === compiled.source.ast, true);
  assert.equal(compiled.result.program === program, true);
  assert.equal(compiled.result.plan === plan, true);
  assert.equal(compiled.result.artifacts === productionResult.value.artifacts, true);
  assert.equal(Object.isFrozen(program), true);
  assert.equal(Object.hasOwn(productionResult, "program"), false);
  assert.equal(Object.hasOwn(productionResult, "plan"), false);
  assert.deepEqual(Object.keys(productionResult.value), ["artifacts"]);
  const methods = plan.sources.flatMap(source => source.unit.members)
    .flatMap(member => member.kind === "NamespaceDeclaration" ? member.members : [member])
    .flatMap(declaration => declaration.members)
    .filter(member => member.kind === "MethodDeclaration" && member.name === "identity");
  assert.equal(methods.length, 1);
  assert.deepEqual(methods[0].parameters.map(parameter => parameter.type), [{ kind: "PredefinedType", name: "double" }]);
  assert.deepEqual(methods[0].returnType, { kind: "PredefinedType", name: "double" });
  assert.deepEqual(compiled.result.artifacts, compileCsharpSource({ sourceText }).result.artifacts);
});

test("C# source rejection never enters the production wrapper or observes stages", () => {
  let calls = 0;
  const compiled = compileCsharpSource({ sourceText: "export const invalid: number = 'text';",
    compileTarget() { calls += 1; assert.fail("Rejected source reached target compilation."); },
  });
  assert.equal(calls, 0);
  assert.equal(compiled.result.diagnostics.some(diagnostic => diagnostic.category === "error"), true);
  assert.equal(compiled.result.program === undefined, true);
  assert.equal(compiled.result.plan === undefined, true);
  assert.equal(compiled.result.artifacts.length, 0);
  assert.throws(() => compileCsharpSource({ sourceText, targetOptions: { outputType: "invalid" },
    compileTarget() { calls += 1; assert.fail("Rejected configuration reached target compilation."); },
  }), /outputType/u);
  assert.equal(calls, 0);
});

test("C# entry rejection observes neither a program nor a native plan", () => {
  const events = [];
  const compiled = compileCsharpSource({
    sourceText: "export function main(): void {}",
    targetOptions: { outputType: "Exe" },
    compileTarget(request, observer) {
      events.push("compile");
      return compileCsharpTarget(request, {
        analyzed(value) { events.push("analysis"); observer.analyzed(value); },
        planned(value) { events.push("plan"); observer.planned(value); },
      });
    },
  });
  assert.deepEqual(events, ["compile"]);
  assert.deepEqual(compiled.result.diagnostics.map(diagnostic => diagnostic.code),
    ["TSONIC_UNCALLED_BINARY_ENTRY_MAIN"]);
  assert.equal(compiled.result.artifacts.length, 0);
  assert.equal(compiled.result.program === undefined, true);
  assert.equal(compiled.result.plan === undefined, true);
});

for (const boundary of ["before", "after"]) {
  test(`C# helper preserves ${boundary} reference validation at the production wrapper`, () => {
    const events = [];
    let validations = 0;
    const compiled = compileCsharpSource({ sourceText, compileTarget(request, observer) {
      return compileCsharpTarget({ ...request, providers: { ...request.providers,
        validateReferences() {
          validations += 1;
          events.push("validate");
          return boundary === "before" || validations === 2 ? [mutation] : [];
        },
      } }, {
        analyzed(value) { events.push("analysis"); observer.analyzed(value); },
        planned(value) { events.push("plan"); observer.planned(value); },
      });
    } });
    assert.deepEqual(events, boundary === "before" ? ["validate"] : ["validate", "analysis", "plan", "validate"]);
    assert.equal(validations, boundary === "before" ? 1 : 2);
    assert.equal(compiled.result.diagnostics.at(-1).message, mutation.message);
    assert.equal(compiled.result.artifacts.length, 0);
    assert.equal(compiled.result.program === undefined, boundary === "before");
    assert.equal(compiled.result.plan === undefined, boundary === "before");
  });
}
