import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCsharpSource, assertCsharpCheckingSucceeded, checkCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { resolvedSourceValue } from "../../helpers/published-return-contracts.mjs";
import { csharpTsValueTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { sourceOutcome } from "../../../dist/policy/types/source-type-flow/representation-results.js";
import { selectCsharpFlowReadProjection } from "../../../dist/policy/types/objects/read-projections.js";
import { selectCsharpClassFactoryType } from "../../../dist/analysis/project-types/class-factory-types.js";
import { getCsharpClassFactory } from "../../../dist/target-model/types/carriers/class-factories.js";

function fixture() {
  const compiled = analyzeCsharpSource({ sourceText: `
    export class Container { value: unknown; }
    export function inspect(container: Container, value: unknown): unknown {
      void container.value; void container["value"];
      const callable = (input: unknown): unknown => input;
      void callable;
      return value;
    }
  ` });
  assertCsharpCheckingSucceeded(compiled);
  assert.equal(compiled.analysis.kind, "resolved");
  const source = compiled.source;
  const nodes = [];
  const visit = node => {
    nodes.push(node);
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of source.sourceFiles) if (!source.ast.isDeclarationFile(file)) visit(file);
  const program = compiled.analysis.value;
  const parameter = name => nodes.find(node => source.ast.is.IsParameterDeclaration(node) &&
    source.ast.text(source.ast.name(node)) === name);
  const represent = (evidence, site) => {
    const result = program.representation.represent(evidence, "storage", site);
    assert.equal(result.kind, "represented");
    assert.equal(result.value.evidence === evidence, true);
    return result.value;
  };
  return { compiled, source, nodes, program, parameter, represent };
}

test("parameter carrier selection has one authenticated publication owner and no missing or default facade", () => {
  const input = fixture();
  for (const name of ["value", "input"]) {
    const parameter = input.parameter(name);
    const slot = resolvedSourceValue(input.source.facts.values.declaredSlot(parameter), "the actual unknown parameter");
    assert.equal(slot.type.type.kind, "intrinsic");
    assert.equal(slot.type.type.intrinsic, "unknown");
    assert.equal(targetTypeRefEquals(input.represent(slot.type, parameter).carrier, csharpTsValueTargetType()), true);
    assert.equal(input.program.representation.represent(slot.type, "storage", parameter).value ===
      input.program.representation.represent(slot.type, "storage", parameter).value, true);
    for (const foreign of [undefined, { ...slot.type }, { ...slot.type, component: { ...slot.type.component } }]) {
      assert.throws(() => input.program.representation.represent(foreign, "storage", parameter), TypeError,
        "missing or copied evidence cannot authorize a warm cached Native carrier");
    }
  }
  assert.equal(Object.hasOwn(input.source, "effectiveTypes"), false);
  assert.equal(Object.hasOwn(input.source, "semantics"), false);
});

test("a dependent Native read forwards its original precise failure object without a carrier fallback", () => {
  const input = fixture();
  const site = input.parameter("value");
  const failure = Object.freeze({ kind: "native-refused", source: "tsonic-csharp", site,
    code: "CSHARP_ARRAY_ELEMENT_CARRIER_MISMATCH",
    message: "The original native element destination is inconsistent." });
  const result = selectCsharpFlowReadProjection(input.program.analysis.policy, input.program.representation,
    failure, false, false);
  assert.equal(result === failure, true);
  assert.equal(result.site === site && result.message === failure.message, true);
  const refusal = Object.freeze({ kind: "refused", source: "tsonic", site,
    code: "TSONIC_SOURCE_FORM_UNSUPPORTED", message: "The exact original demanded child is unavailable." });
  const forwarded = sourceOutcome(refusal);
  assert.equal(forwarded.kind, "source-refused");
  assert.equal(forwarded.refusal === refusal, true, "this is an identity forwarding unit control, not a fabricated lazy-constraint E2E receipt");
  assert.equal(selectCsharpFlowReadProjection(input.program.analysis.policy, input.program.representation,
    forwarded, false, false) === forwarded, true);
});

test("project storage ownership never includes an actual foreign declaration-file member", () => {
  const checked = checkCsharpSource({ sourceText: `
    import type { Remote } from "./remote.js";
    export class Local { value: unknown; }
    export function inspect(local: Local, remote: Remote): void { void local.value; void remote.value; }
  `, files: { "remote.d.ts": "export declare class Remote { value: unknown; }" } });
  assertCsharpCheckingSucceeded(checked);
  const source = checked.source;
  const reads = source.facts.values.occurrences().filter(node => source.ast.is.IsPropertyAccessExpression(node));
  assert.equal(reads.length, 2);
  for (const read of reads) {
    const use = resolvedSourceValue(source.facts.objects.use(read), "the actual original property use");
    assert.equal(use.selectedDeclaration.kind, "present");
    const declaration = use.selectedDeclaration.value;
    const local = source.ast.text(read).startsWith("local.");
    assert.equal(source.facts.navigation.isProjectDeclaration(declaration), local);
    assert.equal(source.ast.isDeclarationFile(source.ast.getSourceFile(declaration)), !local);
    assert.equal(use.selectedDeclarations.includes(declaration), true,
      "a foreign member remains a real Source fact without becoming project Native storage authority");
  }
});

test("project member storage keeps the original declaration file and exact physical Native slot", () => {
  const input = fixture();
  const parameter = input.parameter("container");
  const evidence = resolvedSourceValue(input.source.facts.values.declaredSlot(parameter), "the exact receiver slot").type;
  const carrier = input.represent(evidence, parameter).carrier;
  const registry = input.program.analysis.typeSystem.objectShapes;
  for (const read of input.source.facts.values.occurrences().filter(node =>
    input.source.ast.is.IsPropertyAccessExpression(node) || input.source.ast.is.IsElementAccessExpression(node))) {
    const use = resolvedSourceValue(input.source.facts.objects.use(read), "the original declared property selection");
    const arm = use.arms[0];
    assert.equal(arm.kind, "member");
    assert.equal(arm.origins.length, 1);
    const physical = registry.resolveMember(evidence, carrier, arm.origins[0], read);
    assert.equal(physical.kind, "represented");
    assert.equal(physical.value.kind, "present");
    assert.equal(physical.value.value.sourceDeclarations.includes(use.selectedDeclaration.value), true);
    assert.equal(physical.value.value.sourceDeclarations.every(node =>
      input.source.ast.getSourceFile(node) === input.source.ast.getSourceFile(use.selectedDeclaration.value)), true);
    assert.equal(targetTypeRefEquals(physical.value.value.type, csharpTsValueTargetType()), true);
  }
});

test("selected values consume their exact occurrence publication without checked-type or member retries", () => {
  const input = fixture();
  const occurrences = input.source.facts.values.occurrences();
  const selected = [
    occurrences.find(node => input.source.ast.is.IsPropertyAccessExpression(node)),
    occurrences.find(node => input.source.ast.is.IsElementAccessExpression(node)),
    occurrences.find(node => input.source.ast.is.IsIdentifier(node) && input.source.ast.text(node) === "value"),
    occurrences.find(node => input.source.ast.is.IsArrowFunction(node)),
  ];
  assert.equal(selected.every(node => node !== undefined), true);
  for (const node of selected) {
    const evidence = resolvedSourceValue(input.source.facts.values.type(node), "the exact original value");
    const first = input.represent(evidence, node);
    const repeated = input.represent(evidence, node);
    assert.equal(first === repeated, true);
    assert.equal(first.evidence === evidence, true);
    assert.equal(resolvedSourceValue(input.source.facts.values.type(node), "the same occurrence") === evidence, true);
    assert.throws(() => input.program.representation.represent({ ...evidence }, "storage", node), TypeError);
  }
  assert.equal(Object.hasOwn(input.source, "sourceFacts"), false);
});

test("generic member writes retain the original declared slot and exact receiver substitution environment", () => {
  const checked = checkCsharpSource({ sourceText: `
    export class Box<Value> { constructor(public value: Value) {} }
    export function put(box: Box<unknown>, input: unknown): void { box.value = input; }
  ` });
  assertCsharpCheckingSucceeded(checked);
  const source = checked.source;
  const assignment = source.facts.values.occurrences().find(node => source.ast.is.IsIdentifier(node) &&
    source.ast.text(node) === "input");
  assert.equal(assignment !== undefined, true);
  const destination = resolvedSourceValue(source.facts.values.destination(assignment), "the exact original member-write destination");
  assert.equal(destination.kind, "present");
  const selected = destination.value;
  assert.equal(selected.application.kind, "receiver", "a member write is not a fabricated invocation");
  assert.equal(selected.application.bindings.length, 1);
  assert.equal(selected.declaration.type.type.kind, "parameter");
  assert.equal(selected.application.bindings[0].declaration === selected.declaration.type.type.declaration, true);
  const applied = resolvedSourceValue(source.facts.descriptors.substitute(selected.declaration.type,
    selected.application.bindings), "the exact original receiver application");
  assert.equal(applied === selected.applied, true);
  assert.equal(selected.applied.type.kind, "intrinsic");
  assert.equal(selected.applied.type.intrinsic, "unknown");
});

test("member storage consumes identical published origins instead of read-type reconstruction", () => {
  const input = fixture();
  const reads = input.source.facts.values.occurrences().filter(node =>
    input.source.ast.is.IsPropertyAccessExpression(node) || input.source.ast.is.IsElementAccessExpression(node));
  const uses = reads.map(read => resolvedSourceValue(input.source.facts.objects.use(read), "the actual current member"));
  assert.equal(uses[0].selectedDeclaration.value === uses[1].selectedDeclaration.value, true);
  assert.equal(uses[0].arms[0].origins[0] === uses[1].arms[0].origins[0], true);
  const evidence = uses[0].readType;
  input.source.facts.descriptors.assertEvidence(evidence);
  assert.equal(targetTypeRefEquals(input.represent(evidence, reads[0]).carrier, csharpTsValueTargetType()), true);
  const declaration = uses[0].selectedDeclaration.value;
  assert.equal(input.source.facts.values.occurrences().includes(declaration), false,
    "metadata declarations are not guessed value occurrences");
});

test("local class factories use the real project instance and original collision-free member inventory", () => {
  const compiled = analyzeCsharpSource({ sourceText: `
    export function outer() {
      class Local { Create: unknown; _Create: unknown; IsInstance: unknown; }
      return Local;
    }
  ` });
  assertCsharpCheckingSucceeded(compiled);
  assert.equal(compiled.analysis.kind, "resolved");
  const program = compiled.analysis.value;
  const source = compiled.source;
  const catalog = program.analysis.policy.projectTypes.catalog;
  const definition = catalog.definitions.find(definition => definition.local);
  assert.equal(definition !== undefined, true);
  const instance = catalog.targetTypeForDeclaration(definition.declaration, []);
  assert.equal(instance !== undefined, true);
  const factory = selectCsharpClassFactoryType(source.ast, catalog, instance);
  const contract = getCsharpClassFactory(factory);
  assert.equal(contract.declaration === definition.declaration && targetTypeRefEquals(contract.instance, instance), true);
  assert.equal(contract.createMethodName, "__Create");
  assert.equal(contract.instanceTestMethodName, "_IsInstance");
  assert.equal(selectCsharpClassFactoryType(source.ast, catalog, undefined), undefined);
  assert.equal(selectCsharpClassFactoryType(source.ast, catalog,
    { ...instance, id: "fixture.foreign" }), undefined, "a copied foreign Native identity is not project factory authority");
});
