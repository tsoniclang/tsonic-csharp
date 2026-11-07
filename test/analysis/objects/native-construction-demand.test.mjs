// Native object-literal construction demand (createCsharpNativeConstructionDemandQuery), nextgen C-2542.
//
// Every case is a real TypeScript program: a provider extension declares the CLR type `@fixture/native` ContextRow
// (object-initializer construction), the Host builds the program's SourceProgramFacts (csharpTestSourceProgram), and
// the query runs on the production inputs of analysis/program/type-system.ts: the real representation services (one
// descriptor -> .NET mapping, I6) and the real object-shape policy. Only the provider relations (the CLR side of
// ContextRow) and the selected-carrier lookup are fixture doubles.
//
// Port record (writer C5, AGENT-C5-NOTES.md §2): the old fixture doubled the deleted checker member resolver
// (member-evidence.js: publishedShapeDescriptor / resolveProviderShape / retainPublishedMembers / deriveMembers) and
// read checker types (semantics.forFile, expressionType, declaredValueType, structuralMembers, isIdentical). Those reads
// do not exist in C# any more (I2), so their spies and counters are gone; every construction expectation is kept.
// Source compatibility the old "guard" rows simulated (a source row of another shape reaching a native destination) is
// now the checker's assignability: such programs are invalid TypeScript and the rejection is a Source diagnostic.
import { csharpTestSourceProgram } from "../../helpers/target-source-program.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles, createSourceSemanticsExtension, sourcePrimitive, TstsSourceProviderContractVersion } from "@tsonic/tsts";
import { sourceTypeDescriptorMemberOriginsEqual, sourceTypeDescriptorStructure } from "@tsonic/target-api/source";
import { createCsharpNativeConstructionDemandQuery } from "../../../dist/analysis/objects/native-construction-demand.js";
import { csharpObjectShapeMemberRetainsNativeReference } from "../../../dist/policy/types/objects/member-reads.js";
import { createCsharpObjectShapePolicy } from "../../../dist/analysis/objects/shapes/api.js";
import { mergeCsharpObjectShapeSubjects } from "../../../dist/analysis/objects/shapes/construction.js";
import { selectCsharpHostLiteralCorrespondence } from "../../../dist/analysis/objects/shapes/host-correspondence.js";
import { createCsharpTypeParameterEnvironment } from "../../../dist/representation/index.js";
import { createCsharpTypeDefinitionRegistry } from "../../../dist/analysis/project-types/type-definitions.js";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { maximumCsharpMetadataEntries } from "../../../dist/target-model/metadata/immutable.js";
import { csharpStringTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpTsValueTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";
import { hostProgram, representationServices } from "../../representation/host-fixture.mjs";

test("completed native literal inventories are immutable canonical snapshots", () => {
  const compiled = compileCsharpSource({ sourceText: `
import type { int32 } from "@tsonic/core/types.js";
export function run(): boolean {
  const value: { count: int32; label: string } = { count: 7 as int32, label: "ready" };
  return value.count === 7 && value.label === "ready";
}
` });
  assert.equal(compiled.sourceDiagnosticsText, "", "the declared source remains valid");
  assert.equal(compiled.targetDiagnostics.length, 0,
    compiled.targetDiagnostics.map(({ code, message }) => `${code}: ${message}`).join("; "));
  const program = compiled.result.program;
  assert.equal(program !== undefined, true, "the native literal is admitted");
  // nextgen C-2542: the analysis program's source is the TargetSourceProgramFacts; its syntax reader is `.syntax`.
  const ast = program.source.syntax;
  const literals = [];
  const visit = node => {
    if (ast.is.IsObjectLiteralExpression(node)) literals.push(node);
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  csharpProgramSourceFiles(program).forEach(visit);
  assert.equal(literals.length, 1, "one actual native construction is retained");
  const physical = program.records.nativeExpression.get(literals[0])?.physical;
  const shape = physical?.objectShape;
  assert.equal(shape !== undefined && Object.isFrozen(shape) && Object.isFrozen(shape.members), true,
    "the completed shape and its ordered inventory are immutable");
  assert.equal(shape.members.map(member => member.sourceName).join(","), "count,label");
  assert.equal(shape.members.every(member => Object.isFrozen(member)), true,
    "the snapshot retains immutable checked member records");
  const count = shape.members[0];
  assert.equal(count.type.kind === "source-primitive" && count.type.name === "int32", true,
    "the completed inventory preserves the authored native width");
  assert.equal(Reflect.set(shape.members, "0", count), false, "even an identical write cannot mutate the inventory");
  assert.equal(program.records.nativeExpression.get(literals[0])?.physical?.objectShape === shape &&
    shape.members[0] === count, true, "repeated reads retain the same canonical shape and member identities");
  executeCsharpConstruction(compiled, "immutable-completed-native-literal");
});

const integer = Object.freeze({ kind: "source-primitive", name: "int64" });
const floating = Object.freeze({ kind: "source-primitive", name: "float64" });
const boolean = Object.freeze({ kind: "source-primitive", name: "bool" });
const native = Object.freeze({ kind: "target-named", csharpAllowsRefLikeTypeArguments: Object.freeze([]), id: "native.Counters" });
const structural = Object.freeze({ kind: "target-named", csharpAllowsRefLikeTypeArguments: Object.freeze([]), id: "source.Shape" });
const nativeFailure = "The declared native construction cannot retain all exact fields, absence and native storage without a copied or adapted object.";

/**
 * Checks `source` (module text) with the provider type `ContextRow` from `@fixture/native` and the width markers
 * `Words.int64` / `Words.float64`. `context` lists ContextRow's Source members ({ name, type: "int64" | "float64",
 * optional, readonly }); `clr[name]` overrides the CLR member a member binds to ({ type, readonly }; default: the same
 * width, nullable when optional); `indexer` adds a string indexer. Returns the Host program view and the query runner.
 */
function nativeProgram({ context = [], clr = {}, indexer = false, objectInitializer = true, source }) {
  const nativeModel = { moduleSpecifier: "@fixture/native", providerModuleId: "Fixture.Native", exports: [{
    id: "ContextRow", name: "ContextRow", kind: "class", members: [
      ...context.map(member => ({ id: `ContextRow::${member.name}`, name: member.name, kind: "property",
        type: { kind: "source-primitive", name: member.type ?? "int64" },
        optional: member.optional ?? false, readonly: member.readonly ?? false })),
      ...(indexer ? [{ id: "ContextRow::index", name: "index", kind: "indexer",
        signatures: [{ id: "ContextRow::index(string)", parameters: [{ name: "key", type: { kind: "string" } }],
          returnType: { kind: "source-primitive", name: "int64" } }] }] : []),
    ],
  }] };
  const providerExtension = { identity: { id: "fixture.native.extension", version: "1.0.0" },
    initialize(extension) {
      extension.registerSourceDeclarationProvider({
        identity: { id: "fixture.native", version: "1.0.0", extensionContractVersion: TstsSourceProviderContractVersion,
          diagnosticRange: { start: 9900000, end: 9900099 } },
        declarationMaterialization: "complete",
        ownsModule: specifier => ({ kind: specifier === "@fixture/native" ? "owned" : "unowned" }),
        resolveModule: specifier => ({ kind: "virtual", moduleSpecifier: specifier,
          virtualFileName: "/provider/native.d.ts", providerModuleId: "Fixture.Native" }),
        getDeclarationModel: () => nativeModel,
      });
    } };
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/src", files: {
    "/src/node_modules/@fixture/words/package.json": JSON.stringify({ name: "@fixture/words", version: "1.0.0",
      type: "module", exports: { ".": "./index.d.ts" } }),
    "/src/node_modules/@fixture/words/index.d.ts": "export type float64 = number; export type int64 = bigint;",
    "/src/index.ts": `import type * as Words from "@fixture/words";
import type { ContextRow } from "@fixture/native";
${source}`,
  }, compilerOptions: { strict: true, target: "es2022", module: "esnext", moduleResolution: "bundler" },
  extensionHostOptions: { extensions: [createSourceSemanticsExtension({ modules: [{ moduleSpecifier: "@fixture/words",
    packageName: "@fixture/words", exports: [sourcePrimitive("float64", "float64", "number", true, 64),
      sourcePrimitive("int64", "int64", "bigint", true, 64)] }] }), providerExtension] } }).checkSource();
  const diagnostics = checked.diagnostics.map(diagnostic => diagnostic.messageText ?? diagnostic.message ?? String(diagnostic.code));
  const view = checked.diagnostics.length === 0 ? csharpTestSourceProgram(checked) : undefined;
  const ast = view?.syntax;
  const nodes = [];
  const visit = node => { nodes.push(node); ast.forEachChild(node, child => { if (child !== undefined) visit(child); }); };
  view?.sourceFiles.filter(file => !ast.isDeclarationFile(file)).forEach(visit);
  const carrier = name => ({ int64: integer, float64: floating, bool: boolean })[name];
  // The CLR side of ContextRow: one object-initializer type relation and one instance property per Source member.
  const providers = {
    findTargetBindingByTargetId: () => ({ kind: "missing" }),
    findTargetBindingByMetadataName: () => ({ kind: "missing" }),
    publishNativeIdentities: value => ({ kind: "resolved", value }),
    resolveType(fact) {
      assert.equal(fact.providerModuleId === "Fixture.Native" && fact.exportId === "ContextRow", true,
        "the CLR resolver receives the real compiler-produced provider declaration fact");
      return { kind: "resolved", relations: [{ kind: "type", bindingTypeParameters: [],
        ...(objectInitializer ? { objectLiteralConstruction: { kind: "object-initializer" } } : {}),
        targetBinding: { target: "csharp", id: native.id, csharpType: native } }] };
    },
    resolveMember(fact) {
      const member = context.find(member => fact.memberId === `ContextRow::${member.name}`);
      if (member === undefined) return { kind: "missing", reason: "not a fixture member" };
      const width = carrier(member.type ?? "int64");
      const type = clr[member.name]?.type ?? (member.optional ? csharpNullableTargetType(width) : width);
      return { kind: "resolved", relations: [{ kind: "member", source: { kind: "member", ...fact,
        memberStatic: false, memberKey: { kind: "property-key", name: member.name } },
        targetBinding: { target: "csharp", id: native.id, csharpType: native },
        targetMember: { kind: "property", id: `${native.id}-${member.name}`, targetName: `${native.id}-${member.name}`,
          declaringType: native, parameters: [], returnType: type, readonly: clr[member.name]?.readonly ?? false },
        receiver: { kind: "instance" }, bindingTypeParameters: [], bindingTypeArgumentSource: "receiver" }] };
    },
  };
  const named = (name, predicate) => {
    const found = nodes.filter(node => predicate(node) && ast.text(ast.name(node)) === name);
    assert.equal(found.length, 1, `exactly one '${name}'`);
    return found[0];
  };
  const variable = name => named(name, node => ast.is.IsVariableDeclaration(node));
  const parameter = name => named(name, node => ast.is.IsParameterDeclaration(node));
  const initializer = name => ast.as.AsVariableDeclaration(variable(name))?.Initializer;
  const references = name => nodes.filter(node => ast.is.IsIdentifier(node) && ast.text(node) === name &&
    !ast.is.IsVariableDeclaration(ast.parent(node)) && !ast.is.IsParameterDeclaration(ast.parent(node)));
  /** The query over the production inputs; `overrides` replaces host members (tampered shapes, carriers). */
  const run = (overrides = {}) => {
    const facts = overrides.facts ?? view.facts;
    let policy;
    const services = representationServices({ facts, ast, nodes, host: { sourceFacts: view.sourceFacts } }, {
      facts,
      providers,
      shapes: Object.freeze({
        retainShape: (shape, occurrence) => policy.retainShape(shape, occurrence),
        resolveCallableValue: (signature, typeParameters) => policy.resolveCallableValue(signature, typeParameters),
      }),
    });
    policy = createCsharpObjectShapePolicy({
      ast,
      sourceStorage: facts.analyses.storage({ sourceFiles: view.sourceFiles }),
      projectTypeCatalog: services.projectTypes,
      typeParameterConstraints: createCsharpTypeParameterEnvironment(() => ({ kind: "resolved", constraints: [] })),
      representation: () => services,
    });
    // The wiring of createCsharpTypeAnalysis (analysis/program/type-system.ts). The conversion proof of a preselected
    // carrier reads supertypes; no fixture type declares one.
    const host = {
      ast, facts, providers, sourceFacts: view.sourceFacts, sourceFiles: view.sourceFiles,
      target: Object.freeze({ id: "csharp", options: Object.freeze({}) }),
      typeDefinitions: createCsharpTypeDefinitionRegistry(),
      types: new Proxy({}, { get: (_target, key) => assert.fail(`native construction reads no C# type query (${String(key)})`) }),
      projectTypes: Object.freeze({ directSupertypes: () => undefined }),
      resolveEffectiveShape: node => policy.resolveNode(node),
      resolveLiteralShape: (shape, node) => policy.resolveObjectLiteralTargetShape(shape, node),
      retainSourceShape: (node, shape) => policy.retainConstructionSource(node, shape),
      publishedShapeTarget: node => policy.publishedShapeTarget(node),
      scopedTargetType: () => undefined,
    };
    for (const [key, value] of Object.entries(overrides)) {
      if (key !== "facts" && key !== "wrapEffectiveShape") host[key] = value;
    }
    const wrap = overrides.wrapEffectiveShape;
    if (wrap !== undefined) {
      const original = node => policy.resolveNode(node);
      host.resolveEffectiveShape = node => wrap(original(node), node);
    }
    const record = createCsharpNativeConstructionDemandQuery(host);
    const label = record.issues.map(issue => `${issue.code}: ${issue.message} at ${ast.kindName(issue.node)}`).join("; ");
    return Object.freeze({ record, issues: record.issues, label, constructionFor: node => record.constructionFor(node), policy });
  };
  return Object.freeze({ checked, diagnostics, view, facts: view?.facts, ast, nodes, variable, parameter, initializer,
    references, run, providers });
}

const contextRow = (...members) => members.map(member => typeof member === "string" ? { name: member } : member);

test("native construction never reopens a checked value type for a literal or retained optional alias", () => {
  // The old checker spies (expressionType / constructSignatures fail-spies) are gone: C# reads no checker type (I2).
  // The construction reads the Host publication of the literal and its declaration.
  const program = nativeProgram({ context: contextRow("user", { name: "system", optional: true }), source: `
    export function run(other: ContextRow | null | undefined): void {
      let value: ContextRow | null | undefined = { user: 1n };
      value = other;
      void value;
    }` });
  assert.deepEqual(program.diagnostics, []);
  const literal = program.initializer("value");
  const selected = program.run();
  assert.equal(selected.issues.length, 0, selected.label);
  const constructed = selected.constructionFor(literal);
  const retained = selected.constructionFor(program.variable("value"));
  assert.equal(constructed !== undefined && retained !== undefined && retained.shape === constructed.shape, true,
    "the declaration retains the same proven allocation and optional ABI without a value-type retry");
  assert.equal(targetTypeRefEquals(getCsharpNullableElementTargetType(retained.targetType), native), true);
});

test("native construction uses the literal's declared context and freezes its lookup", () => {
  const program = nativeProgram({ context: contextRow("user", "system"), source: `
    export function run(): void {
      const value: ContextRow = { system: 1n, user: 1n };
      void value;
    }` });
  const literal = program.initializer("value");
  // The lookup is sealed: reading a construction after the query was built reads no Host fact (replaces the old
  // structuralMembers query counter; the query had no other recomputation path to count).
  let reads = 0;
  const values = Object.freeze({ ...program.facts.values, type: node => { reads += 1; return program.facts.values.type(node); } });
  const selected = program.run({ facts: Object.freeze({ ...program.facts, values }) });
  assert.equal(selected.issues.length, 0, selected.label);
  assert.equal(targetTypeRefEquals(selected.constructionFor(literal)?.targetType, native), true, "one original native allocation");
  const before = reads;
  assert.equal(selected.constructionFor(literal), selected.constructionFor(literal), "the same sealed selection");
  assert.equal(reads, before, "sealed lookup does not recompute");
  assert.equal(Object.isFrozen(selected.record) && Object.isFrozen(selected.issues), true);
});

test("declared native construction preserves optional fields and one nullable alias state", () => {
  const program = nativeProgram({ context: contextRow("user", { name: "system", optional: true }), source: `
    export function run(other: ContextRow | null | undefined): boolean {
      let value: ContextRow | null | undefined = { user: 1n };
      const observed = value;
      value = other;
      return observed !== undefined;
    }` });
  assert.deepEqual(program.diagnostics, []);
  const literal = program.initializer("value");
  const reference = program.initializer("observed");
  const selected = program.run();
  assert.equal(selected.issues.length, 0, selected.label);
  assert.equal(targetTypeRefEquals(getCsharpNullableElementTargetType(selected.constructionFor(reference)?.targetType), native), true);
  assert.equal(selected.constructionFor(literal)?.shape.members[1].optional, true);
  assert.equal(selected.constructionFor(literal)?.shape === selected.constructionFor(reference)?.shape, true);
});

test("declared native numeric storage keeps int64 and cannot override an explicit marker", () => {
  for (const explicit of [false, true]) {
    // explicit: the Source member is float64 while its CLR member stays int64.
    const program = nativeProgram({ context: [{ name: "user", type: explicit ? "float64" : "int64" }],
      clr: { user: { type: integer } }, source: `
      export function run(): void {
        const value: ContextRow = { user: ${explicit ? "1 as Words.float64" : "1n"} };
        void value;
      }` });
    assert.deepEqual(program.diagnostics, []);
    const literal = program.initializer("value");
    const selected = program.run();
    assert.equal(selected.issues.length !== 0, explicit, `explicit authored storage remains authoritative; ${selected.label}`);
    assert.equal(selected.constructionFor(literal) === undefined, explicit);
    if (!explicit) assert.equal(targetTypeRefEquals(selected.constructionFor(literal)?.shape.members[0].type, integer), true);
  }
});

test("a published float64 initializer cannot construct an exact int64 native field", () => {
  const program = nativeProgram({ context: [{ name: "user", type: "float64" }], clr: { user: { type: integer } }, source: `
    export function run(): void {
      const value: ContextRow = { user: 1 as Words.float64 };
      void value;
    }` });
  const literal = program.initializer("value");
  const initializer = program.ast.as.AsPropertyAssignment(program.ast.properties(literal)[0])?.Initializer;
  const outcome = program.facts.values.type(initializer);
  const descriptor = outcome.kind === "refused" ? undefined : sourceTypeDescriptorStructure(outcome.construction ?? outcome.type);
  assert.equal(descriptor?.kind === "primitive" && descriptor.primitive === "float64", true);
  const selected = program.run();
  assert.equal(selected.issues.length, 1, selected.label);
  assert.equal(selected.issues[0].node === literal &&
    selected.issues[0].code === "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN" &&
    selected.issues[0].message === nativeFailure, true, selected.label);
  assert.equal(selected.constructionFor(literal) === undefined, true);
});

test("unrelated native declarations never retarget the original literal", () => {
  const program = nativeProgram({ context: contextRow("user"), source: `
    interface Other { user: Words.int64 }
    export function run(other: Other): void {
      const value: ContextRow = { user: 1n };
      void value; void other;
    }` });
  const literal = program.initializer("value");
  const selected = program.run();
  assert.equal(selected.issues.length, 0, selected.label);
  assert.equal(targetTypeRefEquals(selected.constructionFor(literal)?.targetType, native), true, "only the literal's context selects storage");
  assert.equal(selected.constructionFor(program.parameter("other")), undefined);
});

// The old unit "guard" rows built a source row of another shape and asked whether it could reach the native
// destination. Rows whose source is not assignable to ContextRow are now invalid TypeScript (the checker rejects them,
// so no C# analysis runs); rows that are valid TypeScript are literals or values C# must refuse or leave unconstructed.
test("declared native construction rejects lost fields, accessors, methods, incompatible widths and nominal storage", () => {
  const sourceRejected = [
    ["missing required field", "const value: ContextRow = {};"],
    ["extra field", "const value: ContextRow = { user: 1n, extra: 1n };"],
    ["method member", "const value: ContextRow = { user() { return 1n; } };"],
    ["incompatible width", "const value: ContextRow = { user: true };"],
    ["optional source field", "declare const seed: { user?: Words.int64 }; const value: ContextRow = { ...seed };"],
  ];
  for (const [label, body] of sourceRejected) {
    const program = nativeProgram({ context: contextRow("user"), source: `export function run(): void { ${body} void value; }` });
    assert.notEqual(program.diagnostics.length, 0, `${label}: the original rejection is a Source diagnostic`);
  }
  const csharpRejected = [
    ["extra field through a copy", "declare const seed: { user: Words.int64; extra: Words.int64 }; const value: ContextRow = { ...seed };"],
    ["read accessor", "const value: ContextRow = { get user() { return 1n; } };"],
    ["read/write accessor", "const value: ContextRow = { get user() { return 1n; }, set user(_value: Words.int64) {} };"],
    ["callable copy", "declare const seed: { (): number; user: Words.int64 }; const value: ContextRow = { ...seed };"],
    ["indexed copy", "declare const seed: { user: Words.int64; [key: string]: Words.int64 }; const value: ContextRow = { ...seed };"],
  ];
  for (const [label, body] of csharpRejected) {
    const program = nativeProgram({ context: contextRow("user"), source: `export function run(): void { ${body} void value; }` });
    assert.deepEqual(program.diagnostics, [], `${label}: valid Source`);
    const literal = program.initializer("value");
    const selected = program.run();
    assert.equal(selected.constructionFor(literal), undefined, `${label}: no native allocation`);
    assert.equal(selected.issues.some(issue => issue.node === literal && issue.code === "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN"), true,
      `${label}: one native construction refusal; ${selected.label}`);
  }
  // Existing values (class / struct / enum storage, bound members) are not allocations: nothing is constructed.
  const existing = nativeProgram({ context: contextRow("user"), source: `
    declare class Seed { user: Words.int64; }
    declare const seed: Seed;
    export function run(): void { const value: ContextRow = seed; void value; }` });
  const selected = existing.run();
  assert.equal(selected.issues.length, 0, selected.label);
  assert.equal(selected.constructionFor(existing.initializer("value")), undefined, "an existing value gains no allocation");
});

test("Native guard refusal retains the exact construction fault code and reason on a valid Source boundary", () => {
  // The CLR member stores bool; the Source member is int64.
  const program = nativeProgram({ context: contextRow("user"), clr: { user: { type: boolean } }, source: `
    export function run(): void { const value: ContextRow = { user: 1n }; void value; }` });
  assert.deepEqual(program.diagnostics, []);
  const literal = program.initializer("value");
  const selected = program.run();
  assert.equal(selected.issues.length, 1, selected.label);
  assert.equal(selected.issues[0].node === literal &&
    selected.issues[0].code === "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN" &&
    selected.issues[0].message === nativeFailure, true,
    `the real construction caller forwards the unchanged Native guard fault; ${selected.label}`);
  assert.equal(selected.constructionFor(literal), undefined, "the real caller publishes no incompatible Native storage");
});

test("native construction requires exact checked member subjects, not field spelling", () => {
  const program = nativeProgram({ context: contextRow("user"), source: `
    export function run(): void { const value: ContextRow = { user: 1n }; void value; }` });
  const literal = program.initializer("value");
  // Same member names, but every member origin names another declaration than the Host-published member.
  const selected = program.run({ wrapEffectiveShape: (shape, occurrence) => shape === undefined ? undefined
    : { ...shape, members: shape.members.map(member => ({ ...member, origins: [{ kind: "declared", declaration: occurrence }] })) } });
  assert.equal(selected.issues.length > 0, true);
  assert.equal(selected.constructionFor(literal) === undefined, true);
});

test("native construction preserves an exact preselected carrier and rejects an incompatible one", () => {
  for (const conflict of [false, true]) {
    const program = nativeProgram({ context: contextRow("user"), source: `
      export function run(): void { const value: ContextRow = { user: 1n }; void value; }` });
    const literal = program.initializer("value");
    const preselected = conflict ? { ...native, id: "selected.Other" } : native;
    const selected = program.run({ scopedTargetType: node => node === literal ? preselected : undefined });
    assert.equal(selected.issues.length !== 0, conflict, selected.label);
    assert.equal(selected.constructionFor(literal) === undefined, conflict);
  }
});

test("an unrelated annotation issue never hides another literal's valid record", () => {
  // The untyped literal is a Host value refusal. Host refusals are forwarded before C# analysis, so the C# query
  // never runs on that program (running it is an invariant failure, I4); the refusal names only its own site.
  const program = nativeProgram({ context: [{ name: "user", optional: true }], source: `
    export function run(): void {
      const valid: ContextRow = {};
      const invalid = {};
      void valid; void invalid;
    }` });
  const valid = program.initializer("valid");
  const invalid = program.initializer("invalid");
  const refusals = program.facts.refusals();
  assert.equal(refusals.length, 1);
  assert.equal(refusals[0].site === invalid, true);
  assert.equal(refusals[0].code, "TSONIC_UNTYPED_OBJECT_LITERAL");
  assert.equal(program.facts.values.type(valid).kind === "refused", false, "the valid literal keeps its publication");
  assert.throws(() => program.run(), /Host refusal/u);
  const alone = nativeProgram({ context: [{ name: "user", optional: true }], source: `
    export function run(): void { const valid: ContextRow = {}; void valid; }` });
  const selected = alone.run();
  assert.equal(selected.issues.length, 0, selected.label);
  assert.equal(targetTypeRefEquals(selected.constructionFor(alone.initializer("valid"))?.targetType, native), true);
});

test("construction never reads storage origins, incoming graphs, histories or global failure", () => {
  const program = nativeProgram({ context: contextRow("user"), source: `
    export function run(): void { const value: ContextRow = { user: 1n }; void value; }` });
  const literal = program.initializer("value");
  const selected = program.run({ sourceStorage: new Proxy({}, { get: () => assert.fail("no source-storage authority in construction") }) });
  assert.equal(selected.issues.length, 0, selected.label);
  assert.equal(targetTypeRefEquals(selected.constructionFor(literal)?.targetType, native), true);
});

test("constructor-valued expressions do not instantiate object-literal fields", () => {
  const program = nativeProgram({ context: [], source: `
    declare class Constructor {}
    export function run(): void { const value: ContextRow = Constructor; void value; }` });
  assert.deepEqual(program.diagnostics, []);
  const selected = program.run();
  assert.equal(selected.issues.length, 0, selected.label);
  assert.equal(selected.constructionFor(program.initializer("value")) === undefined, true);
});

test("unrelated checked values never instantiate native object shapes", () => {
  const program = nativeProgram({ context: contextRow("user"), source: `
    interface SourceRow { field: Words.int64 }
    export function run(other: SourceRow): void { const value = other; void value; }` });
  const selected = program.run();
  assert.equal(selected.issues.length, 0, selected.label);
  assert.equal(selected.constructionFor(program.parameter("other")) === undefined, true);
  assert.equal(selected.constructionFor(program.variable("value")) === undefined, true);
});

test("an untyped empty literal is not assigned an arbitrary native destination", () => {
  const program = nativeProgram({ context: [], source: `
    export function run(other: ContextRow): void { const value = {}; void value; void other; }` });
  const refusals = program.facts.refusals();
  assert.equal(refusals[0].code, "TSONIC_UNTYPED_OBJECT_LITERAL");
  assert.equal(refusals[0].site === program.initializer("value"), true, "the Host refuses the literal itself");
  assert.throws(() => program.run(), /Host refusal/u, "no C# construction runs past a Host refusal");
});

test("declared native construction never chooses one arm of a multi-carrier source union", () => {
  const program = nativeProgram({ context: contextRow("user"), source: `
    declare const choice: { user: Words.int64; first: true } | { user: Words.int64; second: true };
    export function run(): void { const value: ContextRow = { ...choice }; void value; }` });
  assert.deepEqual(program.diagnostics, []);
  const literal = program.initializer("value");
  const selected = program.run();
  assert.equal(selected.issues.some(issue => issue.code === "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN"), true,
    "multiple present source carriers cannot gain a single native allocation by choosing an arm");
  assert.equal(selected.constructionFor(literal) === undefined, true, "no partial union construction published");
});

test("a native literal selection never replaces its enclosing container", () => {
  const program = nativeProgram({ context: contextRow("user"), source: `
    interface Holder { row: ContextRow }
    export function run(): void { const holder: Holder = { row: { user: 1n } }; void holder; }` });
  const container = program.initializer("holder");
  const literal = program.ast.as.AsPropertyAssignment(program.ast.properties(container)[0])?.Initializer;
  const selected = program.run();
  assert.equal(selected.issues.length, 0, selected.label);
  assert.equal(targetTypeRefEquals(selected.constructionFor(literal)?.targetType, native), true);
  assert.equal(targetTypeRefEquals(selected.constructionFor(container)?.targetType, native), false,
    "the container keeps its own (project) carrier");
});

test("native member metadata retains its finite resource guard", () => {
  const program = nativeProgram({ context: contextRow("user"), source: `
    export function run(): void {
      const valid: ContextRow = { user: 1n };
      const invalid: ContextRow = { user: 2n };
      void valid; void invalid;
    }` });
  const valid = program.initializer("valid");
  const invalid = program.initializer("invalid");
  const selected = program.run({ wrapEffectiveShape: (shape, occurrence) => occurrence !== invalid || shape === undefined ? shape
    : { ...shape, members: shape.members.map(member => ({ ...member,
      origins: Array(maximumCsharpMetadataEntries).fill(member.origins?.[0] ?? { kind: "declared", declaration: occurrence }) })) } });
  assert.equal(selected.issues.length, 1, `one local resource failure; ${selected.label}`);
  const issue = selected.issues[0];
  assert.equal(issue.code === "TSONIC_COMPILER_RESOURCE_LIMIT" && issue.node === invalid &&
    issue.message === `Native construction of this object literal exceeded the finite metadata limit of ${maximumCsharpMetadataEntries} entries.`,
    true, "resource exhaustion names the affected literal and actual limit, not unsupported source");
  assert.equal(selected.constructionFor(invalid) === undefined, true, "no unproved failed-node selection");
  assert.equal(targetTypeRefEquals(selected.constructionFor(valid)?.targetType, native), true, "unrelated valid construction remains published");
});

test("native construction does not reclassify unrelated malformed metadata as resource exhaustion", () => {
  const program = nativeProgram({ context: contextRow("user"), source: `
    export function run(): void { const value: ContextRow = { user: 1n }; void value; }` });
  const failure = new TypeError("C# immutable metadata requires plain data records.");
  assert.throws(() => program.run({ resolveEffectiveShape: () => { throw failure; } }), error => error === failure,
    "the original invalid-metadata failure is preserved");
});

test("declared empty construction keeps fresh expression identity without origin transport", () => {
  const program = nativeProgram({ context: [{ name: "user", optional: true }], source: `
    export function run(): void { const first: ContextRow = {}; const second: ContextRow = {}; void first; void second; }` });
  const first = program.initializer("first");
  const second = program.initializer("second");
  const selected = program.run();
  assert.equal(selected.issues.length, 0, selected.label);
  assert.equal(selected.constructionFor(first) !== undefined && selected.constructionFor(second) !== undefined, true);
  assert.equal(first === second, false, "each authored literal is a distinct runtime allocation");
});

test("an open parameter sharing the same declared type gains no allocation authority", () => {
  const program = nativeProgram({ context: [{ name: "user", optional: true }], source: `
    export function run(other: ContextRow): void { const value: ContextRow = {}; void value; void other; }` });
  const selected = program.run();
  assert.equal(selected.issues.length, 0, selected.label);
  assert.equal(targetTypeRefEquals(selected.constructionFor(program.initializer("value"))?.targetType, native), true);
  assert.equal(selected.constructionFor(program.parameter("other")) === undefined, true);
});

test("observed callers cannot supply an untyped producer's annotation", () => {
  const program = nativeProgram({ context: [{ name: "user", optional: true }], source: `
    function make() { return {}; }
    export function run(): void { const value: ContextRow = make(); void value; }` });
  const literal = program.nodes.find(node => program.ast.is.IsObjectLiteralExpression(node));
  const refusals = program.facts.refusals();
  assert.equal(refusals[0].site === literal, true);
  assert.equal(refusals[0].code, "TSONIC_UNTYPED_OBJECT_LITERAL");
  assert.throws(() => program.run(), /Host refusal/u);
});

test("declared native indexed construction retains one exact allocation", () => {
  const program = nativeProgram({ context: [], indexer: true, source: `
    export function run(): void { const value: ContextRow = {}; void value; }` });
  const selected = program.run();
  assert.equal(selected.issues.length, 0, selected.label);
  assert.equal(targetTypeRefEquals(selected.constructionFor(program.initializer("value"))?.targetType, native), true);
});

test("native indexed construction preserves populated, indexed and required-field safety refusals", () => {
  const indexFailure = "Object-literal index entries require an exact selected C# provider indexer relation.";
  for (const [control, body] of [
    ["populated", "const value: ContextRow = { extra: 1n };"],
    ["indexed", "declare const seed: { [key: string]: Words.int64 }; const value: ContextRow = { ...seed };"],
  ]) {
    const program = nativeProgram({ context: [], indexer: true, source: `export function run(): void { ${body} void value; }` });
    assert.deepEqual(program.diagnostics, [], `${control}: valid Source`);
    const literal = program.initializer("value");
    const selected = program.run();
    assert.equal(selected.issues.some(issue => issue.node === literal && issue.message === indexFailure), true,
      `Native indexed boundary ${control}; ${selected.label}`);
    assert.equal(selected.constructionFor(literal), undefined);
  }
  const required = nativeProgram({ context: contextRow("required"), indexer: true, source: `
    export function run(): void { const value: ContextRow = {}; void value; }` });
  assert.notEqual(required.diagnostics.length, 0, "a missing required field is a Source diagnostic");
});

test("independent equivalent declared types never borrow another destination's allocation", () => {
  // The old isIdentical assertion (checker-equivalent Type objects) is removed: C# reads no checker type (I2).
  const program = nativeProgram({ context: [{ name: "user", optional: true }], source: `
    type Equivalent = {};
    export function run(): void {
      const value: ContextRow = {};
      const other: Equivalent = {};
      void value; void other;
    }` });
  const selected = program.run();
  assert.equal(selected.issues.length, 0, selected.label);
  assert.equal(targetTypeRefEquals(selected.constructionFor(program.initializer("value"))?.targetType, native), true);
  assert.equal(targetTypeRefEquals(selected.constructionFor(program.initializer("other"))?.targetType, native), false,
    "an equivalent independent type cannot publish the native allocation or origins");
});

test("foreign literals are not reclassified by the project's construction owner", () => {
  const program = nativeProgram({ context: [], source: `
    export function run(): void { const value: ContextRow = {}; void value; }` });
  const literal = program.initializer("value");
  const navigation = program.facts.navigation;
  const facts = Object.freeze({ ...program.facts, navigation: Object.freeze({ ...navigation, identity: Object.freeze({
    ...navigation.identity, isProjectDeclaration: node => node !== literal && navigation.identity.isProjectDeclaration(node) }) }) });
  const selected = program.run({ facts });
  assert.equal(selected.issues.length, 0, selected.label);
  assert.equal(selected.constructionFor(literal) === undefined, true);
});

test("declared empty construction retains required, callable, indexed, nominal and selected-storage refusals", () => {
  const required = nativeProgram({ context: contextRow("user"), source: `
    export function run(): void { const value: ContextRow = {}; void value; }` });
  assert.notEqual(required.diagnostics.length, 0, "required: a Source diagnostic");
  for (const [label, body] of [
    ["callable", "declare const seed: { (): number }; const value: ContextRow = { ...seed };"],
    ["indexed", "declare const seed: { [key: string]: Words.int64 }; const value: ContextRow = { ...seed };"],
  ]) {
    const program = nativeProgram({ context: [{ name: "user", optional: true }], source: `export function run(): void { ${body} void value; }` });
    assert.deepEqual(program.diagnostics, [], `${label}: valid Source`);
    const literal = program.initializer("value");
    const selected = program.run();
    assert.equal(selected.issues.length > 0 && selected.constructionFor(literal) === undefined, true,
      `Native empty boundary ${label}; ${selected.label}`);
  }
  const nominal = nativeProgram({ context: [{ name: "user", optional: true }], source: `
    declare class Seed { run(): void; }
    declare const seed: Seed;
    export function run(): void { const value: ContextRow = seed; void value; }` });
  const existing = nominal.run();
  assert.equal(existing.issues.length, 0, existing.label);
  assert.equal(existing.constructionFor(nominal.initializer("value")), undefined, "existing nominal value: no allocation");
  const storage = nativeProgram({ context: [{ name: "user", optional: true }], source: `
    export function run(): void { const value: ContextRow = {}; void value; }` });
  const literal = storage.initializer("value");
  const selected = storage.run({ scopedTargetType: node => node === literal ? { kind: "pointer", pointee: native } : undefined });
  assert.equal(selected.issues.length > 0, true, "selected pointer storage control");
  assert.equal(selected.constructionFor(literal) === undefined, true, "selected pointer storage control: no publication");
});

test("optional native fields keep the full-width provider carrier", () => {
  const program = nativeProgram({ context: [{ name: "user", optional: true }], source: `
    export function run(): void { const value: ContextRow = {}; void value; }` });
  const selected = program.run();
  assert.equal(selected.issues.length, 0, selected.label);
  assert.equal(targetTypeRefEquals(getCsharpNullableElementTargetType(
    selected.constructionFor(program.initializer("value"))?.shape.members[0].type), integer), true);
});

test("an existing exact native parameter needs no new literal allocation record", () => {
  const program = nativeProgram({ context: [], source: `export function run(other: ContextRow): void { void other; }` });
  const selected = program.run();
  assert.equal(selected.issues.length, 0, selected.label);
  assert.equal(selected.constructionFor(program.parameter("other")) === undefined, true, "declared native carrier is unchanged");
});

test("native opaque reference fields keep strings without numeric or tuple heap boxing", () => {
  for (const [sourceCarrier, accepted] of [[csharpStringTargetType(), true], [integer, false],
    [floating, false], [boolean, false], [{ kind: "tuple", elements: [integer] }, false]]) {
    const selected = csharpObjectShapeMemberRetainsNativeReference(sourceCarrier, csharpTsValueTargetType());
    assert.equal(selected, accepted, "native reference payload retains its allocation");
    assert.equal(selected, accepted, "no numeric boxing or partial publication");
  }
});

test("native storage publication still requires exact source-member correspondence", () => {
  const program = nativeProgram({ context: contextRow("user"), source: `
    export function run(): void { const value: ContextRow = { user: 1n }; void value; }` });
  const literal = program.initializer("value");
  const selected = program.run({ resolveLiteralShape: (_shape, occurrence) => ({ kind: "rejected", subject: occurrence,
    reason: "Native construction has no exact source-member correspondence for its declared storage." }) });
  assert.equal(selected.issues.some(issue => /source-member correspondence/u.test(issue.message)), true, selected.label);
  assert.equal(selected.constructionFor(literal) === undefined, true);
});

// Basis: nextgen plan R5/I7 (signed by Claude with the D1 test changes). `any` is a Host value refusal
// (TSONIC_ANY_UNSUPPORTED, forwarded before C# analysis); the C# construction owner never originates it, and meeting
// an `any` object literal is a producer invariant failure, not a C# refusal.
test("consumed any reaching native construction is an invariant failure, never a C#-originated refusal", () => {
  const program = nativeProgram({ context: [], source: `
    export function run(): void { const value: any = { user: 1n }; void value; }` });
  assert.throws(() => program.run(), /must be refused by the Host|Host refusals are forwarded before C# analysis/u);
});

// Optional-member provenance. The old resolver (retainPublishedMembers / deriveMembers) is deleted; the subject is now
// the Host's member origins and memberCorrespondence plus the C# proof selectCsharpHostLiteralCorrespondence
// (shapes/host-correspondence.ts). Destination shapes are built from the Host-published descriptors.
function memberProvenanceFixture() {
  const program = hostProgram(`
    type Slot = { value?: number };
    type Other = { value?: number };
    type Required = { value: number };
    export const omitted: Slot = {};
    export const present: Slot = { value: 1 };
    export const other: Other = {};
    export const required: Required = { value: 1 };
    export const fresh: Slot = {};
    export const read = omitted;
  `);
  const declaration = name => program.named(name, node => program.ast.is.IsVariableDeclaration(node));
  const literal = name => program.ast.as.AsVariableDeclaration(declaration(name)).Initializer;
  const outcome = name => program.facts.values.type(literal(name));
  const published = name => sourceTypeDescriptorStructure(program.slot(declaration(name)));
  /** The .NET destination shape of a declaration's published type: one member per Host member, its origin attached. */
  const destination = (name, options = {}) => Object.freeze({ targetType: structural, members: Object.freeze(
    published(name).members.map(member => Object.freeze({
      sourceKey: Object.freeze({ kind: "property", name: member.name }), sourceName: member.name, targetName: member.name,
      memberKind: "property", type: (options.optional ?? member.optional) ? csharpNullableTargetType(floating) : floating,
      origins: Object.freeze([member.origin]),
      ...(member.origin.kind === "declared" ? { sourceDeclarations: Object.freeze([member.origin.declaration]) } : {}),
      ...((options.optional ?? member.optional) ? { optional: true } : {}),
    }))) });
  /** The C# proof for the literal of `name`; a third argument replaces the Host outcome (undefined = none published). */
  const prove = (name, shape, ...replaced) => selectCsharpHostLiteralCorrespondence(program.ast, literal(name),
    replaced.length === 0 ? outcome(name) : replaced[0], shape, shape.targetType);
  return { program, declaration, literal, outcome, published, destination, prove };
}

test("typed optional member evidence survives literal, declared value and read publication", () => {
  const value = memberProvenanceFixture();
  const owner = value.published("omitted").members[0].origin;
  assert.equal(value.prove("omitted", value.destination("omitted")).kind, "proven",
    "the physical optional slot keeps its declared owner");
  assert.equal(value.outcome("omitted").memberCorrespondence.length, 0, "no present source property is fabricated");
  const declared = sourceTypeDescriptorStructure(value.program.slot(value.declaration("omitted")));
  assert.equal(declared.members.length === 1 && sourceTypeDescriptorMemberOriginsEqual(declared.members[0].origin, owner), true,
    "the declared value publishes the same exact optional member");
  const read = sourceTypeDescriptorStructure(value.program.type(value.program.ast.as.AsVariableDeclaration(value.declaration("read")).Initializer));
  assert.equal(read.members.length === 1 && read.members[0].optional === true &&
    sourceTypeDescriptorMemberOriginsEqual(read.members[0].origin, owner), true,
    "a later read publishes the same optional member, without a missing-member fallback");
});

test("typed optional native construction publishes an actual omitted slot without origin repair", () => {
  const compiled = compileCsharpSource({ sourceText: `
    export function run(): boolean {
      const optional: { useGrouping?: boolean } = {};
      const alias = optional;
      return alias.useGrouping === undefined;
    }
  ` });
  assert.equal(compiled.sourceDiagnosticsText, "", "the original declared optional context is source-valid");
  assert.equal(compiled.targetDiagnostics.length, 0,
    compiled.targetDiagnostics.map(({ code, message }) => `${code}: ${message}`).join("; "));
  assert.equal(compiled.artifacts.size > 0, true, "the physical optional field survives publication and its absence read");
  executeCsharpConstruction(compiled, "typed-optional-member-publication", false, false, [], `
if (!Tsonic.Generated.Index.run()) throw new System.Exception("declared optional slot preserves native absence through an alias");
`);
});

test("typed member evidence never admits a missing required slot", () => {
  const value = memberProvenanceFixture();
  const selected = value.prove("omitted", value.destination("omitted", { optional: false }));
  assert.equal(selected.kind, "rejected", "a checked absent result cannot initialize a required native field");
  assert.equal(selected.reason, "The required native member 'value' has no authored object-literal value.");
});

test("missing, foreign, stale and mismatched member evidence cannot inherit optional absence", () => {
  const value = memberProvenanceFixture();
  const slot = value.destination("omitted");
  const [member] = slot.members;
  const { origins: _removed, ...missing } = member;
  const presentProperty = value.program.ast.properties(value.literal("present"))[0];
  const controls = [
    ["missing evidence", { ...slot, members: [missing] }],
    ["foreign declared owner", value.destination("other")],
    ["stale absence", slot, value.outcome("fresh")],
    ["mismatched present property", { ...slot, members: [{ ...member, origins: [{ kind: "declared", declaration: presentProperty }] }] }],
  ];
  for (const [label, shape, outcome] of controls) assert.notEqual(value.prove("omitted", shape, outcome).kind, "proven",
    `${label}: no native slot is published from missing or unrelated proof`);
});

test("canonical member merging retains separate owners without transferring an absence proof", () => {
  const value = memberProvenanceFixture();
  const first = value.destination("omitted");
  const second = value.destination("other");
  const merged = mergeCsharpObjectShapeSubjects(first, second);
  const origins = merged.members[0].origins;
  assert.equal(origins.length === 2 && origins.includes(first.members[0].origins[0]) && origins.includes(second.members[0].origins[0]),
    true, "each checked source/declaration/member alternative remains intact");
  assert.equal(value.prove("other", merged).kind, "proven", "the exact second source selects only its own retained proof");
  assert.equal(value.prove("fresh", merged).kind, "proven",
    "an independently published fresh occurrence owns its absence rather than borrowing a previous construction proof");
  assert.notEqual(value.prove("fresh", merged, undefined).kind, "proven",
    "another empty source without its canonical publication cannot inherit absence merely because its physical shape key matches");
});

test("ambiguous optional declaration owners never choose a first matching proof", () => {
  const value = memberProvenanceFixture();
  const merged = mergeCsharpObjectShapeSubjects(value.destination("omitted"), value.destination("other"));
  const original = value.outcome("omitted");
  const firstType = value.published("omitted");
  const secondType = value.published("other");
  const ambiguous = { ...firstType, members: [...firstType.members, ...secondType.members] };
  assert.notEqual(value.prove("omitted", merged, { ...original, type: ambiguous }).kind, "proven",
    "different checked owners associated with the same source are ambiguous, not a success fallback");
});

// ---------------------------------------------------------------------------------------------------------------
// Writer C7 (nextgen C-2542; AGENT-C5-NOTES R-C5-1 / R-C5-2): the object-shape registry builds the CLR provider shape of
// a native literal (resolveNode has a provider branch through provider-shapes.ts / provider-construction.ts), and
// publishedShapeTarget names the represented carrier of the shape the Host publishes at an occurrence. Native
// construction runs first in createCsharpTypeAnalysis, so it must not depend on an earlier registration.

test("the shape registry builds a native provider literal's CLR shape from its provider relations (R-C5-2)", () => {
  const program = nativeProgram({ context: contextRow("user", { name: "system", optional: true }), source: `
    export function run(other: ContextRow): void { const value: ContextRow = { user: 1n }; void value; void other; }` });
  assert.deepEqual(program.diagnostics, []);
  const literal = program.initializer("value");
  const selected = program.run();
  assert.equal(selected.issues.length, 0, selected.label);
  assert.equal(targetTypeRefEquals(selected.constructionFor(literal)?.targetType, native), true,
    "the native literal constructs its CLR type (baseline behaviour; a refusal here is an R11 regression)");
  const shape = selected.policy.resolveNode(literal);
  assert.equal(targetTypeRefEquals(shape?.targetType, native), true, "resolveNode answers the provider shape");
  assert.deepEqual(shape.members.map(member => [member.sourceName, member.targetName, member.optional === true]),
    [["user", "native.Counters-user", false], ["system", "native.Counters-system", true]],
    "members in Host order, each bound to its CLR property");
  assert.equal(shape.constructible, true);
  assert.equal(targetTypeRefEquals(selected.policy.resolveNode(program.parameter("other"))?.targetType, native), true,
    "a provider-typed binding that is not a literal resolves the same CLR shape");
  // Control: a provider type without object-initializer construction has no provider shape and no construction.
  const closed = nativeProgram({ context: contextRow("user"), objectInitializer: false, source: `
    export function run(): void { const value: ContextRow = { user: 1n }; void value; }` });
  const unconstructed = closed.run();
  assert.equal(unconstructed.issues.length, 0, unconstructed.label);
  assert.equal(unconstructed.policy.resolveNode(closed.initializer("value")), undefined);
  assert.equal(unconstructed.constructionFor(closed.initializer("value")), undefined);
});

test("publishedShapeTarget is the represented shape published at the occurrence (R-C5-1)", () => {
  const program = nativeProgram({ context: contextRow("user"), source: `
    type Row = { count: Words.int64 };
    export function run(mixed: ContextRow | string): void {
      let value: ContextRow | null | undefined = { user: 1n };
      const row: Row = { count: 1n };
      void value; void row; void mixed;
    }` });
  assert.deepEqual(program.diagnostics, []);
  const selected = program.run();
  assert.equal(selected.issues.length, 0, selected.label);
  const { policy } = selected;
  const literal = program.initializer("value");
  assert.equal(targetTypeRefEquals(policy.publishedShapeTarget(literal), native), true, "the literal's construction");
  assert.equal(targetTypeRefEquals(policy.publishedShapeTarget(program.variable("value")), native), true,
    "the declaration: absence arms lifted, one present arm");
  const retained = selected.constructionFor(program.variable("value"));
  assert.equal(targetTypeRefEquals(getCsharpNullableElementTargetType(retained?.targetType), native), true,
    "native construction retains the declaration on the published carrier");
  const row = program.initializer("row");
  const published = policy.publishedShapeTarget(row);
  assert.notEqual(published, undefined);
  assert.equal(targetTypeRefEquals(published, policy.resolveNode(row)?.targetType), true,
    "a structural literal's published carrier is its registered canonical shape carrier (BF16)");
  assert.notEqual(policy.resolveTarget(published), undefined, "the published carrier has a registered shape");
  assert.equal(policy.publishedShapeTarget(program.parameter("mixed")), undefined, "several value arms: no single shape");
});

test("a provider literal's own checks run even when an earlier literal registered its CLR carrier", () => {
  const indexFailure = "Object-literal index entries require an exact selected C# provider indexer relation.";
  const program = nativeProgram({ context: [], indexer: true, source: `
    export function run(): void { const first: ContextRow = {}; const second: ContextRow = { extra: 1n }; void first; void second; }` });
  assert.deepEqual(program.diagnostics, []);
  const first = program.initializer("first");
  const second = program.initializer("second");
  const selected = program.run();
  assert.equal(targetTypeRefEquals(selected.constructionFor(first)?.targetType, native), true, selected.label);
  const accepted = selected.policy.resolveObjectLiteralTargetShape(undefined, first);
  assert.equal(accepted.kind === "resolved" && targetTypeRefEquals(accepted.shape.targetType, native), true);
  assert.notEqual(selected.policy.resolveTarget(native), undefined, "the CLR carrier is registered");
  const refused = selected.policy.resolveObjectLiteralTargetShape(undefined, second);
  assert.equal(refused.kind === "rejected" && refused.subject === second && refused.reason === indexFailure, true,
    "the registered carrier does not bypass the second literal's index-entry check");
  assert.equal(selected.constructionFor(second), undefined);
});
