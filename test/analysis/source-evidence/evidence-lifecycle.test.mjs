import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCsharpSource, assertCsharpCheckingSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { createCsharpSourceEvidenceBuilder } from "../../../dist/analysis/source-evidence/index.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";

test("Native evidence enrolls only demanded original values and declarations, then seals immutable data once", () => {
  const checked = analyzeCsharpSource({ sourceText: `
    export function add(value: number): number {
      const first: number = 1;
      const second: number = 2;
      return first + second + value;
    }
  ` });
  assertCsharpCheckingSucceeded(checked);
  assert.equal(checked.analysis.kind, "resolved", "the normal program supplies its actual complete Native policy");
  const program = checked.analysis.value;
  const policy = program.analysis.policy;
  const source = program.source;
  const declarations = new Map();
  const values = new Map();
  const originalText = node => {
    const range = source.ast.authoredRange(node);
    assert.equal(range.kind, "authored", "the enrollment retains an actual authored occurrence");
    return source.ast.getSourceText(source.ast.getSourceFile(node)).slice(range.start, range.end);
  };
  const visit = node => {
    if (source.ast.is.IsNumericLiteral(node) || source.ast.is.IsBinaryExpression(node)) values.set(originalText(node), node);
    if (source.ast.is.IsVariableDeclaration(node) || source.ast.is.IsParameterDeclaration(node)) {
      const name = source.ast.name(node);
      assert.equal(name !== undefined, true, "each original storage declaration has its authored name");
      declarations.set(source.ast.text(name), node);
    }
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of source.sourceFiles.filter(file => !source.ast.isDeclarationFile(file))) visit(file);
  assert.deepEqual([...values.keys()].sort(), ["1", "2", "first + second", "first + second + value"].sort());
  assert.deepEqual([...declarations.keys()].sort(), ["first", "second", "value"]);
  const empty = createCsharpSourceEvidenceBuilder(policy).seal();
  assert.equal(empty.targetTypes.length, 0, "constructing a builder does not represent an AST-wide value census");
  for (const node of values.values()) assert.equal(empty.nodeTargetType.get(node) === undefined, true);
  const builder = createCsharpSourceEvidenceBuilder(policy);
  const carriers = new Map();
  for (const [label, node] of values) {
    const original = policy.nativeValue(node);
    assert.equal(original.kind, "represented", label + ": the one actual ABI producer completes");
    const enrolled = builder.value(node);
    assert.equal(enrolled.kind, "represented", label + ": original value enrollment completes");
    assert.equal(enrolled.value === original.value, true, label + ": publication retains the identical actual Native carrier");
    assert.equal(builder.value(node).kind, "represented", label + ": repeated enrollment is idempotent");
    carriers.set(node, enrolled.value);
  }
  for (const [label, node] of declarations) {
    const declared = policy.types.declaredSlot(node);
    assert.equal(declared.kind, "represented", label + ": the actual declared storage owner completes");
    const enrolled = builder.declaration(node);
    assert.equal(enrolled.kind, "represented", label + ": exact declaration enrollment completes");
    assert.equal(enrolled.value === declared.value.value.carrier, true, label + ": declared storage is not inferred from a narrowed read");
  }
  const sealed = builder.seal();
  assert.equal(Object.isFrozen(sealed) && Object.isFrozen(sealed.targetTypes), true);
  assert.equal(sealed.targetTypes.length > 0, true, "the complete demanded physical inventory is not vacuous");
  for (const [node, carrier] of carriers) {
    assert.equal(sealed.nodeTargetType.get(node) === carrier, true, "lookup reuses completed Native data");
    assert.equal(sealed.targetTypes.some(type => targetTypeRefEquals(type, carrier)), true, "every demanded carrier occurs in the sealed inventory");
    assert.equal(Object.isFrozen(sealed.nodeTargetType), true);
    assert.throws(() => builder.value(node), /after sealing/u);
  }
  for (const node of declarations.values()) {
    assert.equal(sealed.storageTargetType.get(node) !== undefined, true, "every expected storage declaration is published");
    assert.throws(() => builder.declaration(node), /after sealing/u);
  }
  assert.throws(() => builder.seal(), /after sealing/u);
  assert.throws(() => sealed.targetTypes.push(carriers.values().next().value), TypeError);
  assert.equal(empty.targetTypes.length, 0, "another builder cannot mutate the earlier copied snapshot");
});
