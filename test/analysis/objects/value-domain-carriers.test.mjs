import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createCompilerSessionFromFiles, formatDiagnostics } from "@tsonic/tsts";
import { createTargetSourceProgram, Node_Initializer } from "@tsonic/target-api/source";
import { createSourceStorageQuery } from "@tsonic/target-api/analysis";
import { csharpValueDomainHasTargetType as selectedValueDomainHasTargetType } from "../../../dist/policy/types/objects/value-domain-carrier.js";
import { analyzeCsharpValueDomainCarriers } from "../../../dist/analysis/objects/value-domain-carriers.js";
import { csharpEmptyObjectTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { substituteObjectShapeFactTargetTypeParameters } from "../../../dist/target-model/types/substitution.js";
import { createCsharpMetadataBudget } from "../../../dist/target-model/metadata/immutable.js";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { frozenEmptyStorageSources } from "../../../../tsonic/test/fixtures/frozen-empty-storage.mjs";

function fixture() {
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/src",
    compilerOptions: { strict: true, target: "es2022", module: "esnext", moduleResolution: "bundler" },
    files: {
      "/src/owner.ts": `
        export class Holder<Value> {
          constructor(public value: Value, public other: Value, public optional?: Value) {}
        }
        export class Stranger<Value> { constructor(public value: Value) {} }
      `,
      "/src/index.ts": `
        import { Holder } from "./owner.js";
        const first = new Holder<object>({}, {});
        const records: Holder<object>[] = [first];
        const pair: [Holder<object>] = [first];
        const selected: object = first.value;
        const optional: object | undefined = first.optional;
      `,
    },
  }).checkSource();
  assert.equal(checked.diagnostics.length, 0, "checked cross-file generic source");
  const source = createTargetSourceProgram(checked);
  const file = checked.getSourceFile("/src/index.ts");
  const nodes = new Map();
  const visit = node => {
    if (source.ast.is.IsVariableDeclaration(node)) nodes.set(source.ast.text(source.ast.name(node)), node);
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(file);
  const storage = createSourceStorageQuery(source, source.navigation.sourceFiles);
  const first = storage.subject(nodes.get("first"));
  assert.equal(first.kind, "resolved");
  const firstType = storage.typeFor(first.subject);
  assert.equal(firstType.kind, "resolved");
  const queries = source.semantics.forFile(file);
  const relationship = queries.types.structuralMembers(firstType.type, firstType.type);
  assert.equal(relationship.kind, "available");
  const members = new Map(relationship.members.map(pair => [pair.source.property.name, pair.source]));
  return { source, file, storage, nodes, queries, members, firstType: firstType.type };
}

function domain(input, carrier, projection, root = "first", selected = "selected") {
  const node = input.nodes.get(root);
  const origin = input.storage.subject(node, "value", projection);
  assert.equal(origin.kind, "resolved", "exact projection is interned by shared storage");
  const typed = input.storage.typeFor(origin.subject);
  assert.equal(typed.kind, "resolved", "exact projection has checked selected field type");
  const expression = Node_Initializer(input.source.ast, input.nodes.get(selected));
  const host = {
    sourceStorage: { ...input.storage,
      closedOriginsFor: () => ({ kind: "complete", origins: [{ subject: origin.subject, type: typed.type, sourceFile: typed.sourceFile }] }),
    },
    semantics: file => input.source.semantics.forFile(file),
    types: { resolveNode(selectedNode, file) {
      assert.equal(selectedNode === node && file === input.file, true, "retain original physical owner, never resolve field source type");
      return carrier;
    } },
  };
  return { host, expression, origin: origin.subject };
}

function csharpValueDomainHasTargetType(host, expression, expected) {
  const valueDomainCarriers = analyzeCsharpValueDomainCarriers(host, [expression]);
  return selectedValueDomainHasTargetType({ valueDomainCarriers }, expression, expected);
}

const member = input => ({ kind: "member", declaration: input.members.get("value").declarations[0] });

const broad = { kind: "source-primitive", name: "object" };

function shape(input, selected, field = "value", options = {}) {
  const evidence = input.members.get(field);
  const carrier = { kind: "target-named", csharpAllowsRefLikeTypeArguments: [false], id: "Physical.Holder", typeArguments: [selected] };
  const member = { sourceName: field, sourceKey: { kind: "property", name: field }, targetName: field,
    sourceSubjects: evidence.declarations, sourceTypes: [evidence.property.type], memberKind: "property",
    type: selected, optional: field === "optional", ...options };
  return { carrier, fact: { targetType: carrier, sourceType: input.firstType, members: [member] } };
}

function selectShape(host, value) {
  host.objectShapes = { resolveTarget(owner) {
    assert.equal(owner === value.carrier, true, "query actual physical owner, including generic arguments");
    return value.fact;
  } };
}

test("member origins use exact physical declarations, not equal source types or field names", () => {
  const input = fixture();
  const exact = csharpEmptyObjectTargetType();
  for (const actual of [exact, broad]) {
    const value = shape(input, actual);
    const selected = domain(input, value.carrier, [member(input)]);
    selectShape(selected.host, value);
    assert.equal(csharpValueDomainHasTargetType(selected.host, selected.expression, exact), actual === exact);
  }
  const value = shape(input, exact, "value", { sourceSubjects: [input.members.get("other").declarations[0]] });
  const selected = domain(input, value.carrier, [member(input)]);
  selectShape(selected.host, value);
  assert.equal(csharpValueDomainHasTargetType(selected.host, selected.expression, exact), false, "same spelling cannot replace declaration identity");
});

test("member projection composes with exact array and tuple physical owners", () => {
  const input = fixture();
  const exact = csharpEmptyObjectTargetType();
  const value = shape(input, exact);
  for (const [root, carrier, prefix] of [
    ["records", { kind: "array", element: value.carrier }, { kind: "array-element" }],
    ["pair", { kind: "tuple", elements: [value.carrier] }, { kind: "tuple-element", index: 0 }],
  ]) {
    const selected = domain(input, carrier, [prefix, member(input)], root);
    selectShape(selected.host, value);
    assert.equal(csharpValueDomainHasTargetType(selected.host, selected.expression, exact), true, root);
  }
});

test("optional physical fields retain their native absence carrier", () => {
  const input = fixture();
  const exact = csharpEmptyObjectTargetType();
  const absent = csharpNullableTargetType(exact);
  const value = shape(input, absent, "optional");
  const projection = [{ kind: "member", declaration: input.members.get("optional").declarations[0] }];
  const selected = domain(input, value.carrier, projection, "first", "optional");
  selectShape(selected.host, value);
  assert.equal(csharpValueDomainHasTargetType(selected.host, selected.expression, exact), false, "no erasure of optional field storage");
  assert.equal(csharpValueDomainHasTargetType(selected.host, selected.expression, absent), true);
});

test("nominal generic fields use the physical instantiation and exact checked property", () => {
  const input = fixture();
  const parameter = { kind: "type-parameter", name: "Value", identity: "/src/owner.ts:Holder:Value" };
  const exact = csharpEmptyObjectTargetType();
  const template = shape(input, parameter);
  for (const [root, prefix] of [["first", []], ["records", [{ kind: "array-element" }]], ["pair", [{ kind: "tuple-element", index: 0 }]]]) {
    for (const physical of [exact, broad]) {
      const fact = substituteObjectShapeFactTargetTypeParameters(template.fact, new Map([[parameter.identity, physical]]));
      const owner = fact.targetType;
      const carrier = root === "records" ? { kind: "array", element: owner }
        : root === "pair" ? { kind: "tuple", elements: [owner] } : owner;
      const selected = domain(input, carrier, [...prefix, member(input)], root);
      let calls = 0;
      selected.host.objectShapes = { resolveTarget(actualOwner) {
        calls += 1;
        assert.equal(actualOwner === owner, true, "exact physical generic instance");
        assert.equal(fact.members[0].sourceSubjects[0] === input.members.get("value").declarations[0], true, "exact generic declaration");
        assert.equal(fact.members[0].sourceTypes[0] === input.members.get("value").property.type, true, "source evidence retained independently");
        return fact;
      } };
      assert.equal(csharpValueDomainHasTargetType(selected.host, selected.expression, exact), physical === exact);
      assert.equal(calls, 1, "one physical projection, not a second source type resolver");
    }
  }
});

test("member proofs fail closed for unavailable, accessor and exhausted evidence", () => {
  const input = fixture();
  const exact = csharpEmptyObjectTargetType();
  for (const control of ["missing", "accessor", "method", "budget", "open", "ambiguous"]) {
    const value = shape(input, exact, "value", control === "accessor"
      ? { accessor: { getter: true, setter: false } } : control === "method" ? { memberKind: "method" } : {});
    const selected = domain(input, value.carrier, [member(input)]);
    selectShape(selected.host, value);
    if (control === "missing") selected.host.objectShapes = { resolveTarget: () => undefined };
    if (control === "ambiguous") value.fact.members.push({ ...value.fact.members[0], targetName: "different" });
    if (control === "budget") selected.host.sourceStorage.failureReason = () => "bounded failure";
    if (control === "open") selected.host.sourceStorage.closedOriginsFor = () => ({ kind: "open", origins: [] });
    assert.equal(csharpValueDomainHasTargetType(selected.host, selected.expression, exact), false, control);
  }
});

test("finite value-domain budgets distinguish exact completion from source-owned failure", () => {
  const input = fixture();
  const exact = csharpEmptyObjectTargetType();
  const value = shape(input, exact);
  const selected = domain(input, value.carrier, [member(input)]);
  selectShape(selected.host, value);
  const budget = createCsharpMetadataBudget();
  budget.reserve(budget.remaining() - 3);
  const completed = analyzeCsharpValueDomainCarriers(selected.host, [selected.expression], budget);
  assert.equal(budget.remaining(), 0, "exactly enough work completes without a false resource failure");
  assert.equal(completed.issues.length, 0);
  assert.equal(completed.carrierFor(selected.expression) === exact, true);

  const next = Node_Initializer(input.source.ast, input.nodes.get("optional"));
  const exhausted = createCsharpMetadataBudget();
  exhausted.reserve(exhausted.remaining() - 3);
  const failed = analyzeCsharpValueDomainCarriers(selected.host, [selected.expression, next], exhausted);
  assert.equal(failed.issues.length, 1, "one precise issue, not one diagnostic per lost fact");
  assert.equal(failed.issues[0].node === next, true, "the actual demand exhausting the budget owns the diagnostic");
  assert.equal(failed.issues[0].code, "CSHARP_VALUE_DOMAIN_METADATA_BUDGET_EXHAUSTED");
  assert.equal(failed.issues[0].message, "C# value-domain carrier analysis exceeds its finite target metadata budget.");
  assert.equal(Object.isFrozen(failed.issues) && Object.isFrozen(failed.issues[0]), true);
  assert.equal(failed.carrierFor(selected.expression) === undefined, true, "partial facts are never treated as a complete proof");
  assert.equal(failed.carrierFor(next) === undefined, true);
});

test("ordinary unproved value domains produce no resource failure", () => {
  const input = fixture();
  const exact = csharpEmptyObjectTargetType();
  const value = shape(input, exact);
  const selected = domain(input, value.carrier, [member(input)]);
  selected.host.sourceStorage.closedOriginsFor = () => ({ kind: "open", origins: [] });
  const analysis = analyzeCsharpValueDomainCarriers(selected.host, [selected.expression]);
  assert.equal(analysis.issues.length, 0, "unproved source evidence is not exhausted finite work");
  assert.equal(analysis.carrierFor(selected.expression) === undefined, true);
});

test("value-domain query types reject reassignment while retaining their call signature", () => {
  const contract = readFileSync(new URL("../../../src/policy/types/objects/value-domain-carrier.ts", import.meta.url), "utf8");
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/src",
    compilerOptions: { strict: true, target: "es2022", module: "esnext", moduleResolution: "bundler" },
    files: {
      "/src/policy/types/objects/value-domain-carrier.ts": contract,
      "/src/target-model/types/model.ts": "export interface TargetTypeRef { readonly kind: string; }",
      "/src/target-model/types/equality.ts": `
        import type { TargetTypeRef } from "./model.js";
        export function targetTypeRefEquals(left: TargetTypeRef, right: TargetTypeRef): boolean { return left === right; }
      `,
      "/src/tsts.d.ts": 'declare module "@tsonic/tsts" { export interface Node { readonly source: string; } }',
      "/src/index.ts": `
        import type { CsharpValueDomainCarrierQueries } from "./policy/types/objects/value-domain-carrier.js";
        import type { TargetTypeRef } from "./target-model/types/model.js";
        declare const queries: CsharpValueDomainCarrierQueries;
        const carrier: TargetTypeRef | undefined = queries.carrierFor({ source: "node" });
        queries.carrierFor = () => undefined;
      `,
    },
  }).checkSource();
  assert.equal(checked.diagnostics.length, 1, "the existing call is valid and only the write is rejected");
  assert.match(formatDiagnostics(checked.diagnostics), /TS2540: Cannot assign to 'carrierFor' because it is a read-only property/u);
});

test("value-domain budget exhaustion rejects program publication instead of emitting a fallback", () => {
  const analyzer = new URL("../../../dist/analysis/objects/value-domain-carriers.js", import.meta.url).href;
  const metadata = new URL("../../../dist/target-model/metadata/immutable.js", import.meta.url).href;
  const helper = new URL("../../helpers/direct-csharp-session.mjs", import.meta.url).href;
  const program = `
    import assert from "node:assert/strict";
    import { mock } from "node:test";
    const { analyzeCsharpValueDomainCarriers } = await import(${JSON.stringify(analyzer)});
    const { createCsharpMetadataBudget } = await import(${JSON.stringify(metadata)});
    let failures = 0;
    let failureNode;
    mock.module(${JSON.stringify(analyzer)}, { namedExports: {
      analyzeCsharpValueDomainCarriers(host, expressions) {
        const budget = createCsharpMetadataBudget();
        budget.reserve(budget.remaining() - 1);
        const analysis = analyzeCsharpValueDomainCarriers(host, expressions, budget);
        assert.equal(analysis.issues.length, 1, "force exhaustion through the existing real budget");
        failures += 1;
        failureNode = analysis.issues[0].node;
        return analysis;
      },
    } });
    const { compileCsharpSource, assertCsharpCheckingSucceeded } = await import(${JSON.stringify(helper)});
    const { createTargetSourceProgram } = await import("@tsonic/target-api/source");
    const compiled = compileCsharpSource({ surface: "js", sourceText: ${JSON.stringify(frozenEmptyStorageSources[0][1])} });
    assertCsharpCheckingSucceeded(compiled);
    assert.equal(failures, 1, "the first owner failure stops closure before a later pass could lose it");
    assert.equal(compiled.targetDiagnostics.length, 1, "one bounded pre-publication diagnostic");
    assert.equal(compiled.targetDiagnostics[0].code, "CSHARP_VALUE_DOMAIN_METADATA_BUDGET_EXHAUSTED");
    assert.equal(compiled.targetDiagnostics[0].source, "tsonic-csharp");
    assert.equal(compiled.targetDiagnostics[0].category, "error");
    assert.equal(compiled.result.diagnostics[0].sourceNode === failureNode, true,
      "the diagnostic retains exact source-owner identity through the stage rejection");
    assert.equal(createTargetSourceProgram(compiled.source).ast.getSourceFile(failureNode) ===
      compiled.source.getSourceFile("/project/index.ts"), true, "the failure belongs to the actual authored file");
    assert.equal(compiled.artifacts.size, 0, "neither accepted target output nor a slower fallback is published");
  `;
  const child = spawnSync(process.execPath, ["--experimental-test-module-mocks", "--input-type=module", "--eval", program],
    { encoding: "utf8", maxBuffer: 16_384, timeout: 120_000 });
  assert.equal(child.error === undefined, true, "bounded failure-path process completes");
  assert.equal(child.status, 0, `${child.stderr.slice(0, 8192)}\n${child.stdout.slice(0, 2048)}`);
});

test("sealed value domains retain exact source identity without source or physical resolver reads", () => {
  const input = fixture();
  const exact = csharpEmptyObjectTargetType();
  const value = shape(input, exact);
  const selected = domain(input, value.carrier, [member(input)]);
  selectShape(selected.host, value);
  const valueDomainCarriers = analyzeCsharpValueDomainCarriers(selected.host, [selected.expression]);
  const unavailable = () => { throw new Error("source and native carrier proof is already complete"); };
  selected.host.semantics = unavailable;
  selected.host.types.resolveNode = unavailable;
  selected.host.objectShapes.resolveTarget = unavailable;
  selected.host.sourceStorage.closedOriginsFor = unavailable;
  selected.host.sourceStorage.failureReason = unavailable;
  assert.equal(Object.isFrozen(valueDomainCarriers), true);
  const host = { valueDomainCarriers };
  for (let index = 0; index < 64; index += 1) {
    assert.equal(selectedValueDomainHasTargetType(host, selected.expression, exact), true);
    assert.equal(selectedValueDomainHasTargetType(host, selected.expression, broad), false);
  }
  assert.equal(valueDomainCarriers.carrierFor({}) === undefined, true, "foreign source identity cannot reuse a proof");
  assert.equal(selectedValueDomainHasTargetType({}, selected.expression, exact), false, "missing analysis proof has no resolver fallback");
});

test("analysis closes actual invocation arguments for broad aliases, containers and selected native freeze calls", () => {
  for (const index of [0, 1, 2, 5]) {
    const compiled = compileCsharpSource({ surface: "js", sourceText: frozenEmptyStorageSources[index][1] });
    assertCsharpCompilationSucceeded(compiled);
    const text = [...compiled.artifacts.values()].join("\n");
    assert.match(text, /EmptyObject\.(?:Freeze|IsFrozen)/u, `actual checked invocation ${index}`);
    assert.doesNotMatch(text, /FrozenObject|ConditionalWeakTable|DynamicInvoke|System\.Reflection/u,
      `actual checked invocation ${index} has no additional carrier, state table or fallback`);
  }
});
