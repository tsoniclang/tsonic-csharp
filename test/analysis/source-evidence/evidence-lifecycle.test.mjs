import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCsharpSource, assertCsharpCheckingSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { createCsharpSourceEvidenceBuilder } from "../../../dist/analysis/source-evidence/index.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../dist/target-model/types/equality.js";

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
  assert.equal(new Set(sealed.targetTypes.map(type => targetTypeRefKey(type, "emission"))).size, sealed.targetTypes.length,
    "one completed emission inventory retains all Native metadata rather than merging only physical geometry");
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

test("a narrowed Source read cannot manufacture its physical storage carrier", () => {
  const checked = analyzeCsharpSource({ sourceText: `
    export function choose(value: number | undefined): number {
      return value === undefined ? 0 : value;
    }
  ` });
  assertCsharpCheckingSucceeded(checked);
  assert.equal(checked.analysis.kind, "resolved", "the normal program supplies the actual Source and Native owners");
  const program = checked.analysis.value;
  const source = program.source;
  const nodes = source.facts.navigation.nodesForFiles(program.sourceFiles);
  const parameters = nodes.filter(node => source.ast.is.IsParameterDeclaration(node));
  const conditionals = nodes.filter(node => source.ast.is.IsConditionalExpression(node));
  assert.equal(parameters.length, 1, "the complete original storage parameter domain");
  assert.equal(conditionals.length, 1, "the original controlled operation domain");
  const occurrence = source.ast.as.AsConditionalExpression(conditionals[0]).WhenFalse;
  assert.equal(source.ast.is.IsIdentifier(occurrence), true, "the exact authored narrowed read");
  const selected = source.facts.values.type(occurrence);
  const storage = source.facts.protocols.storage(occurrence);
  assert.equal(selected.kind, "resolved");
  assert.equal(storage.kind === "resolved" && storage.value.kind === "present", true);
  assert.equal(selected.value.type.kind === "primitive" && selected.value.type.primitive === "float64", true,
    "Source owns the narrowed read domain independently of its storage");
  assert.equal(storage.value.value.value.type.kind, "optional", "the original declared storage keeps absence");
  const builder = createCsharpSourceEvidenceBuilder(program.analysis.policy);
  const native = program.analysis.policy.nativeValue(occurrence);
  assert.equal(native.kind, "represented", "the one Native producer owns the actual read carrier");
  assert.equal(builder.value(occurrence).kind, "represented");
  assert.equal(builder.declaration(parameters[0]).kind, "represented");
  const index = builder.seal();
  const refinement = index.valueRefinement.get(occurrence);
  assert.equal(refinement?.kind, "represented", "the demanded read publishes its complete evidence record");
  assert.equal(refinement.value.selected.evidence === selected.value && refinement.value.selected.carrier === native.value, true);
  assert.equal(refinement.value.storage.kind === "present" && refinement.value.storage.value === storage.value.value.value, true,
    "storage retains the identical Source evidence, not a second Native ABI choice");
  assert.equal(Object.hasOwn(refinement.value.storage.value, "carrier"), false);
  assert.equal(index.storageTargetType.get(occurrence) === undefined, true, "a read cannot impersonate a completed physical storage declaration");
  assert.equal(index.storageTargetType.get(parameters[0]) !== undefined, true, "only the canonical completed declared slot supplies declaration storage");
});

test("declared binder enrollment and its registered descriptor publish the same completed Native constraints", () => {
  const checked = analyzeCsharpSource({ sourceText: "export function same<Value>(value: Value): Value { return value; }" });
  assertCsharpCheckingSucceeded(checked);
  assert.equal(checked.analysis.kind, "resolved", "the original generic declaration reaches its actual Native owner");
  const program = checked.analysis.value;
  const policy = program.analysis.policy;
  const source = program.source;
  const declarations = source.facts.navigation.nodesForFiles(program.sourceFiles).filter(node => source.ast.is.IsTypeParameterDeclaration(node));
  assert.equal(declarations.length, 1, "the complete original generic declaration domain");
  const declaration = declarations[0];
  const original = source.facts.descriptors.typeParameter(declaration);
  assert.equal(original.declaration === declaration, true, "the registered Source binder is not a fabricated descriptor");
  for (const descriptorFirst of [false, true]) {
    const builder = createCsharpSourceEvidenceBuilder(policy);
    let selected;
    if (descriptorFirst) selected = policy.representation.parameter(original, declaration);
    assert.equal(builder.parameter(declaration).kind, "represented", "the exact Source declared slot authenticates enrollment");
    selected ??= policy.representation.parameter(original, declaration);
    assert.equal(selected.kind, "represented", "the same Native parameter owner completes");
    const index = builder.seal();
    assert.equal(index.typeParameterConstraints.get(declaration) === selected.value.csharpConstraints, true,
      "both orders retain the identical completed immutable constraint receipt");
    assert.equal(selected.value.csharpDeclaration === declaration && Object.isFrozen(selected.value.csharpConstraints), true);
    assert.equal(index.targetTypes.some(type => type === selected.value), true, "the Native binder itself is retained, not only its constraints");
    assert.throws(() => builder.parameter(declaration), /after sealing/u);
  }
});
