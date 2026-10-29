import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { frozenObjectSources } from "../../../../tsonic/test/fixtures/frozen-objects.mjs";
import { selectCsharpTargetCallEmission } from "../../../dist/policy/operations/members/target-call-emission.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";

test("selected freeze keeps the native reference and permits mutation through an independent alias", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    interface Settings { port: number; nested: { on: boolean }; }
    export function run(): boolean {
      const settings: Settings = { port: 80, nested: { on: true } };
      let evaluations = 0;
      function operand(): Settings { evaluations += 1; return settings; }
      const readonly: Readonly<Settings> = Object.freeze(operand());
      settings.port = 8080;
      readonly.nested.on = false;
      return readonly === settings && readonly.port === 8080 && !settings.nested.on && evaluations === 1;
    }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  const generated = [...compiled.artifacts.values()].join("\n");
  assert.equal(/FrozenObject|CheckWrite|EmptyObject\.(?:Freeze|IsFrozen)|ConditionalWeakTable/u.test(generated), false,
    "readonly views contain no runtime frozen state or guarded property rewrite");
  executeCsharpConstruction(compiled, "readonly-freeze-native-identity");
});

test("selected isFrozen is refused at its exact source operation with a readonly rewrite", () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText:
    `export function run(value: object): boolean { return Object.isFrozen(value); }` });
  assert.equal(compiled.sourceDiagnosticsText, "", "the source is checker-valid");
  const issues = [...compiled.extensionDiagnostics, ...compiled.targetDiagnostics];
  assert.equal(issues.some(issue => issue.code === "TSONIC_IS_FROZEN_UNSUPPORTED" &&
    issue.message.includes("Object.isFrozen has no native equivalent") && issue.message.includes("readonly")), true,
    "the selected unsupported operation supplies its precise native rewrite");
  assert.equal(compiled.artifacts.size, 0, "refused isFrozen publishes no generated artifacts");
});

test("readonly freeze writes stay checker errors without a runtime mutation guard", () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    export function run(): void {
      const value = Object.freeze({ count: 1 });
      value.count = 2;
    }
  ` });
  assert.equal(compiled.sourceDiagnosticsText.includes("TS2540"), true, "TypeScript owns readonly write rejection");
  assert.equal(compiled.artifacts.size, 0, "a source readonly write never reaches emission");
});

test("same-spelled freeze and isFrozen methods remain ordinary source calls", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    export function run(): boolean {
      const Object = {
        freeze(value: number): number { return value + 1; },
        isFrozen(value: number): boolean { return value === 2; },
      };
      return Object.isFrozen(Object.freeze(1));
    }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  executeCsharpConstruction(compiled, "readonly-freeze-shadowed-source-calls");
});

test("readonly views leave abstract, readonly, static and accessor storage unchanged", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    abstract class Base {
      abstract value: number;
      static state = 3;
      readonly tag = 2;
      get current(): number { return this.value; }
      set current(next: number) { this.value = next; }
    }
    class Derived extends Base { override value = 1; }
    export function run(): boolean {
      const value = new Derived();
      const readonly = Object.freeze(value);
      value.value = 4;
      value.current = 5;
      return readonly === value && readonly.current === 5 && readonly.tag === 2 && Base.state === 3;
    }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  const generated = [...compiled.artifacts.values()].join("\n");
  assert.equal(/__tsonic_frozen_|FrozenObject|CheckWrite/u.test(generated), false,
    "freeze neither replaces native member storage nor inserts guarded setters");
  executeCsharpConstruction(compiled, "readonly-freeze-native-member-storage");
});

test("readonly freeze leaves independently native-addressed fields at their original locations", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText:
    `${frozenObjectSources["retained-locations"]}\nexport function run(): boolean { main(); return true; }` });
  assertCsharpCompilationSucceeded(compiled);
  const generated = [...compiled.artifacts.values()].join("\n");
  assert.equal(/__tsonic_frozen_|FrozenObject|CheckWrite/u.test(generated), false,
    "native addressed data needs no freeze backing-field replacement or write check");
  executeCsharpConstruction(compiled, "readonly-freeze-native-field-locations");
});

test("value identity admits only one exact by-value native carrier before the seal", () => {
  const integer = csharpSourcePrimitiveTargetType("int32");
  const wide = csharpSourcePrimitiveTargetType("int64");
  for (const [label, result, arguments_, static_, receiver, rejected] of [
    ["identical carrier", integer, [false], true, { kind: "none" }, false],
    ["different carrier", wide, [false], true, { kind: "none" }, true],
    ["missing operand", integer, [], true, { kind: "none" }, true],
    ["extra operand", integer, [false, false], true, { kind: "none" }, true],
    ["by-reference operand", integer, [true], true, { kind: "none" }, true],
    ["instance invocation", integer, [false], false, { kind: "instance" }, true],
  ]) {
    const selected = selectCsharpTargetCallEmission({
      source: {}, argumentPassing: arguments_, optional: false, projection: undefined, liftedResult: undefined,
      selection: { receiver, targetMember: { kind: "method", id: "value-identity-control", static: static_,
        targetName: "identity", parameters: [{ name: "value", type: integer, passingMode: "by-value" }],
        returnType: result, csharpInvocation: { kind: "value-identity" } } },
    });
    assert.equal(selected.kind === "rejected", rejected, `${label}: identity cannot add a conversion, receiver or evaluation`);
    if (!rejected) assert.equal(selected.value.invocation.kind, "value-identity", "the one admitted invocation is sealed directly");
  }
});

test("readonly array views retain their native storage and alias mutations without copying", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    export function run(): boolean {
      const values = [1, 2];
      const readonly = Object.freeze(values);
      values[0] = 7;
      return readonly === values && readonly[0] === 7 && readonly.length === 2;
    }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  const generated = [...compiled.artifacts.values()].join("\n");
  assert.equal(/FrozenObject|CheckWrite|ToArray\(|\.Clone\(|ConditionalWeakTable/u.test(generated), false,
    "the readonly view introduces neither storage duplication nor runtime freeze state");
  executeCsharpConstruction(compiled, "readonly-freeze-native-array-identity");
});

test("readonly identity evaluates the actual selected generic callee result rather than an input origin", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    interface Item { count: number; }
    function replace<Value extends object>(value: Value, replacement: Value): Value { return replacement; }
    export function run(): boolean {
      const first: Item = { count: 1 };
      const second: Item = { count: 2 };
      const readonly = Object.freeze(replace(first, second));
      second.count = 3;
      return readonly === second && readonly !== first && readonly.count === 3 && first.count === 1;
    }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  executeCsharpConstruction(compiled, "readonly-freeze-selected-callee-result");
});
