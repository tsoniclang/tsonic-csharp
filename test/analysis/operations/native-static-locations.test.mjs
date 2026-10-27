import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";
import { selectCsharpNativeOperandUses } from "../../../dist/analysis/operations/control-flow/native-operands.js";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

let checked;

function propertyFixture() {
  if (checked !== undefined) return checked;
  const compiled = compileCsharpSource({ sourceText: `
    export function read(value: { count: number }): number { return value.count; }
  ` });
  assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
  assert.equal(compiled.result.diagnostics.length, 0, "the property fixture is admitted");
  const program = compiled.result.program;
  assert.equal(program !== undefined, true, "the property fixture publishes its program");
  const ast = program.source.ast;
  let property;
  const visit = node => {
    if (ast.is.IsPropertyAccessExpression(node)) property = node;
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of csharpProgramSourceFiles(program)) visit(file);
  assert.equal(property !== undefined, true, "the fixture has one property access");
  const expression = ast.as.AsPropertyAccessExpression(property).Expression;
  checked = { ast, property, expression };
  return checked;
}

for (const surface of ["native", "js"]) {
  test(`effectful instance property writes evaluate their receiver once on ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      class Counter { value: number = 0; }
      let calls: number = 0;
      function receiver(value: Counter): Counter { calls++; return value; }
      export function run(): boolean {
        const value = new Counter();
        receiver(value).value = 7;
        return calls === 1 && value.value === 7;
      }
    ` });
    assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
    assert.equal(compiled.result.diagnostics.length === 0, true,
      compiled.result.diagnostics.map(({ code, message }) => `${code}: ${message}`).join("; "));
    executeCsharpConstruction(compiled, `native-static-location-${surface}`);
  });
}

function operands(selection, access) {
  const { ast, property } = propertyFixture();
  const absent = Object.freeze({ get: () => undefined });
  return selectCsharpNativeOperandUses({
    ast,
    navigation: { referenceFor: () => undefined, sourceReferenceFor: () => undefined, isProjectDeclaration: () => false },
    evidence: { sourceDefaultValue: absent, sourceArgument: absent },
    operations: { selectedProperty: { get: () => selection === undefined ? undefined : { selection } }, nativeHandler: absent },
    valueReads: { valueRead: absent },
    optionalLocals: absent,
  }, property, access);
}

for (const access of [undefined, "location"]) {
  const role = access === undefined ? "value" : "location";
  test(`selected static property ${role} has no evaluated module receiver`, () => {
    const selected = operands({ kind: "resolved", receiver: { kind: "none" }, source: {} }, access);
    assert.equal(selected.refusal === undefined, true, "the exact static property is admitted");
    assert.equal(selected.runtime.length, 0, "a static property has no runtime receiver");
    assert.equal(selected.planning.length, 0, "a static property has no receiver planning step");
  });

  for (const kind of ["instance", "target-parameter"]) {
    test(`selected ${kind} property ${role} evaluates its receiver exactly once`, () => {
      const { expression } = propertyFixture();
      const selected = operands({ kind: "resolved", receiver: { kind }, source: { receiver: { expression } } }, access);
      assert.equal(selected.refusal === undefined, true, "the exact native property is admitted");
      assert.equal(selected.runtime.length, 1, "one runtime receiver use is retained");
      assert.equal(selected.runtime[0].expression === expression, true, "the original receiver expression is retained");
      assert.equal(selected.runtime[0].slot.kind, "receiver", "the use retains its receiver role");
      assert.equal(selected.planning.length, 1, "one planning step is retained");
      assert.equal(selected.planning[0].use === selected.runtime[0], true, "planning uses the same selected receiver");
    });
  }

  test(`source-owned property ${role} retains its checked receiver`, () => {
    const { expression } = propertyFixture();
    const selected = operands({ kind: "source-owned", source: { receiver: { expression } } }, access);
    assert.equal(selected.runtime.length, 1, "one source-owned receiver is retained");
    assert.equal(selected.runtime[0].expression === expression, true, "the checked receiver identity is preserved");
  });

  test(`union property ${role} retains its receiver`, () => {
    const { expression } = propertyFixture();
    const selected = operands({ kind: "union-property" }, access);
    assert.equal(selected.runtime.length, 1, "one union receiver is retained");
    assert.equal(selected.runtime[0].expression === expression, true, "the union receiver identity is preserved");
  });

  test(`property ${role} without selected member evidence is refused`, () => {
    const selected = operands(undefined, access);
    assert.equal(selected.refusal, "operation-unresolved", "missing evidence is not an invented receiver contract");
    assert.equal(selected.runtime.length, 0, "a refused property publishes no runtime receiver");
  });
}
