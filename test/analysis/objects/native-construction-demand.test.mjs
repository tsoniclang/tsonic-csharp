import { csharpTestSourceProgram } from "../../helpers/target-source-program.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles, createSourceSemanticsExtension, sourcePrimitive, TstsSourceProviderContractVersion } from "@tsonic/tsts";
import { sourceTypeDescriptorMemberOriginsEqual, sourceTypeDescriptorStructure } from "@tsonic/target-api/source";
import { createCsharpNativeConstructionDemandQuery } from "../../../dist/analysis/objects/native-construction-demand.js";
import { csharpObjectShapeMemberRetainsNativeReference } from "../../../dist/policy/types/objects/member-reads.js";
import { createCsharpObjectShapeMemberResolver } from "../../../dist/analysis/objects/shapes/member-evidence.js";
import { mergeCsharpObjectShapeSubjects } from "../../../dist/analysis/objects/shapes/construction.js";
import { checkCsharpSource, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { maximumCsharpMetadataEntries } from "../../../dist/target-model/metadata/immutable.js";
import { csharpSourcePrimitiveTargetType, csharpStringTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpTsValueTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";

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
  const ast = program.source.ast;
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
const native = Object.freeze({ kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "native.Counters" });
const structural = Object.freeze({ kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "source.Shape" });

function fixture() {
  const rows = new Map();
  const inputs = [];
  const existing = new Map();
  const explicit = new Set();
  const foreign = new Set();
  const primitive = {};
  const semantics = { types: {} };
  let relationshipQueries = 0;
  let current;
  let nullable = false;
  const row = (fields, target = structural, options = {}) => {
    const type = {};
    const selections = fields.map((field, index) => {
      const property = { optional: field.optional ?? false, readonly: field.readonly ?? false };
      const member = { targetName: `${target.id}-${index}`,
        type: field.carrier ?? (field.optional ? csharpNullableTargetType(integer) : integer), memberKind: "property",
        ...(field.optional ? { optional: true } : {}),
        ...field.member };
      return { identity: field.identity, property, read: field.read ?? "property", member };
    });
    rows.set(type, { fields: selections, shape: { targetType: target,
      members: selections.map(field => field.member), ...(options.provider ? { constructible: true } : {}), ...options.shape },
      calls: options.calls ?? [], constructs: options.constructs ?? [], indexes: options.indexes ?? [], provider: options.provider === true });
    return type;
  };
  const node = (type, context, kind = "literal") => {
    if (kind === "reference") {
      const input = inputs.find(input => input.type === type.union?.[0]);
      assert.equal(input !== undefined && input.nullable, true,
        "the nullable alias is a real read of the same checked declaration, never a fabricated navigation edge");
      return input.reference;
    }
    const sourceRow = rows.get(type);
    const contextRow = rows.get(context);
    const fieldType = explicit.has(primitive) ? "Words.float64" : "Words.int64";
    const declaration = (name, selected) => `interface ${name} {
      ${selected.fields.map(field => field.member.memberKind === "method" ? `${JSON.stringify(field.identity)}(): ${fieldType};`
        : `${field.property.readonly ? "readonly " : ""}${JSON.stringify(field.identity)}${field.property.optional ? "?" : ""}: ${
          kind === "guard" && name === "SourceRow" && field.member.type.kind === "source-primitive" && field.member.type.name === "bool"
            ? "boolean" : fieldType};`).join(" ")}
      ${selected.calls.length === 0 ? "" : "(): number;"}
      ${selected.constructs.length === 0 ? "" : "new(): object;"}
      ${selected.indexes.length === 0 ? "" : `[key: string]: ${fieldType};`}
    }`;
    const empty = { fields: [], calls: [], constructs: [], indexes: [] };
    const propertyValue = explicit.has(primitive) ? "1 as Words.float64" : "1n";
    const properties = (sourceRow?.fields ?? []).map(field => {
      const selectedValue = field.member.type.kind === "source-primitive" && field.member.type.name === "bool" ? "true" : propertyValue;
      return field.read === "accessor" || field.member.accessor !== undefined
        ? `get ${JSON.stringify(field.identity)}() { return ${selectedValue}; }`
        : field.member.memberKind === "method" ? `${JSON.stringify(field.identity)}() { return ${selectedValue}; }`
          : `${JSON.stringify(field.identity)}: ${selectedValue}`;
    }).join(", ");
    const existingValue = sourceRow?.shape.methodImplementation !== undefined || sourceRow?.fields.some(field => field.member.bound) ||
      sourceRow?.calls.length > 0 ||
      ["class", "struct", "enum"].includes(sourceRow?.shape.targetType.csharpSourceDeclarationKind);
    const initializer = kind === "parameter" ? "other" : sourceRow?.constructs.length > 0 ? "Constructor"
      : existingValue ? "seed" : sourceRow?.fields.some(field => field.property.optional) || sourceRow?.calls.length > 0 ||
        sourceRow?.indexes.length > 0 ? "{ ...seed }"
      : type.union === undefined ? `{ ${properties} }` : "{ ...choice }";
    const annotation = kind === "guard" ? ": SourceRow" : context?.any ? ": any" : context === undefined ? "" : `: ContextRow${nullable ? " | null | undefined" : ""}`;
    const nativeModel = { moduleSpecifier: "@fixture/native", providerModuleId: "Fixture.Native", exports: [{
      id: "ContextRow", name: "ContextRow", kind: "class", members: [
        ...(contextRow?.fields ?? []).map(field => ({ id: `ContextRow::${field.identity}`, name: field.identity,
          kind: "property", type: { kind: "source-primitive", name: explicit.has(primitive) ? "float64" : "int64" },
          optional: field.property.optional, readonly: field.property.readonly })),
        ...(contextRow?.indexes.length > 0 ? [{ id: "ContextRow::index", name: "index", kind: "indexer",
          signatures: [{ id: "ContextRow::index(string)", parameters: [{ name: "key", type: { kind: "string" } }],
            returnType: { kind: "source-primitive", name: explicit.has(primitive) ? "float64" : "int64" } }] }] : []),
      ],
    }] };
    const providerExtension = { identity: { id: "fixture.native.extension", version: "1.0.0" },
      initialize(context) {
        context.registerSourceDeclarationProvider({
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
        ${declaration("SourceRow", sourceRow ?? empty)}
        ${contextRow?.provider ? 'import type { ContextRow } from "@fixture/native";' : declaration("ContextRow", contextRow ?? empty)}
        declare const destination: ContextRow;
        type Equivalent = {};
        declare class Constructor {}
        declare const seed: SourceRow;
        declare const choice: { user: 1n } | { user: 2n };
        function run(other: ContextRow | null | undefined): void {
          let value${annotation} = ${initializer};
          ${nullable ? "value = other;" : ""}
          void value; void other;
        }`,
    }, compilerOptions: { strict: true, target: "es2022", module: "esnext", moduleResolution: "bundler" },
    extensionHostOptions: { extensions: [createSourceSemanticsExtension({ modules: [{ moduleSpecifier: "@fixture/words",
      packageName: "@fixture/words", exports: [sourcePrimitive("float64", "float64", "number", true, 64),
        sourcePrimitive("int64", "int64", "bigint", true, 64)] }] }), providerExtension] } }).checkSource();
    assert.equal(checked.diagnostics.length, 0, "positive constructions and independent-type negative boundaries both use valid checked Source");
    assert.equal(checked.extensionDiagnostics.length, 0);
    const program = csharpTestSourceProgram(checked);
    const file = checked.getSourceFile("/src/index.ts");
    const syntax = [];
    const visit = selected => { syntax.push(selected); program.ast.forEachChild(selected, child => { if (child !== undefined) visit(child); }); };
    visit(file);
    const declarationNode = syntax.find(selected => program.ast.is.IsVariableDeclaration(selected) &&
      program.ast.is.IsIdentifier(program.ast.name(selected)) && program.ast.text(program.ast.name(selected)) === "value");
    const literal = program.ast.as.AsVariableDeclaration(declarationNode)?.Initializer;
    const parameter = syntax.find(selected => program.ast.is.IsParameterDeclaration(selected) &&
      program.ast.text(program.ast.name(selected)) === "other");
    const reference = syntax.filter(selected => program.ast.is.IsIdentifier(selected) && program.ast.text(selected) === "value").at(-1);
    const selected = kind === "literal" || kind === "guard" ? literal : kind === "parameter" ? parameter : reference;
    assert.equal(literal !== undefined && selected !== undefined && file !== undefined, true,
      "each Native boundary input retains its real checked occurrence and matching eager Source publication");
    const queries = program.semantics.forFile(file);
    const actualType = queries.types.expressionType(literal);
    const contextDeclaration = syntax.find(selected => program.ast.is.IsVariableDeclaration(selected) &&
      program.ast.is.IsIdentifier(program.ast.name(selected)) && program.ast.text(program.ast.name(selected)) === "destination");
    const sourceDeclaration = syntax.find(selected => program.ast.is.IsInterfaceDeclaration(selected) &&
      program.ast.text(program.ast.name(selected)) === "SourceRow");
    const contextType = queries.declarations.declaredValueType(contextDeclaration);
    const declaredSource = queries.declarations.declaredType(sourceDeclaration);
    const equivalent = syntax.find(selected => program.ast.is.IsTypeAliasDeclaration(selected) &&
      program.ast.text(program.ast.name(selected)) === "Equivalent");
    const equivalentType = queries.types.authoredType(program.ast.typeNode(equivalent));
    const input = { program, file, literal, declarationNode, reference, queries, type, context,
      sourceRow, contextRow, actualType, contextType, declaredSource, equivalentType, nullable, checked };
    inputs.push(input);
    return selected;
  };
  const guard = (source, destination) => {
    const occurrence = node(source, destination, "guard");
    const input = inputs.at(-1);
    const selected = freeze();
    return { compatible: selected.constructionFor(occurrence) !== undefined,
      types: [input.declaredSource, input.contextType], queries: input.queries, equivalentType: input.equivalentType };
  };
  const host = {
    // The real conversion path for a preselected carrier reads supertypes and provider bindings; this unit
    // boundary declares neither, so both lookups are empty.
    projectTypes: { directSupertypes: () => undefined },
    providers: {
      findTargetBindingByTargetId: () => ({ kind: "missing" }),
      findTargetBindingByMetadataName: () => ({ kind: "missing" }),
      resolveType(fact) {
      assert.equal(fact.providerModuleId === "Fixture.Native" && fact.exportId === "ContextRow", true,
        "the Native leaf resolver receives the real compiler-produced provider declaration fact");
      return { kind: "resolved", relations: [{ kind: "type",
        objectLiteralConstruction: { kind: "object-initializer" }, targetBinding: {
          target: "csharp", id: current.contextRow.shape.targetType.id, csharpType: current.contextRow.shape.targetType } }] };
    },
      resolveMember(fact) {
        const field = current.contextRow.fields.find(field => fact.memberId === `ContextRow::${field.identity}`);
        if (field === undefined) return { kind: "missing" };
        const target = current.contextRow.shape.targetType;
        return { kind: "resolved", relations: [{ kind: "member", source: { kind: "member", ...fact,
          memberStatic: false, memberKey: { kind: "property-key", name: field.identity } },
          targetBinding: { target: "csharp", id: target.id, csharpType: target },
          targetMember: { kind: "property", id: field.member.targetName, targetName: field.member.targetName,
            declaringType: target, parameters: [], returnType: field.member.type, readonly: field.property.readonly },
          receiver: { kind: "instance" }, bindingTypeParameters: [], bindingTypeArgumentSource: "receiver" }] };
      } },
    typeResolver: { resolveDescriptor(descriptor) {
      const selected = sourceTypeDescriptorStructure(descriptor);
      if (selected.kind === "primitive") return csharpSourcePrimitiveTargetType(selected.primitive);
      const value = selected.kind === "optional" ? host.typeResolver.resolveDescriptor(selected.value) : undefined;
      return value === undefined ? undefined : csharpNullableTargetType(value);
    } },
    semanticsFor: selected => {
      const input = inputs.find(input => input.program.ast.getSourceFile(selected) === input.file);
      assert.equal(input !== undefined, true);
      return { ...input.queries, types: { ...input.queries.types,
        structuralMembers(source, destination, purpose) {
          assert.equal(purpose, "correspondence", "only the selected provider's real declaration evidence is retained");
          relationshipQueries++;
          return input.queries.types.structuralMembers(source, destination, purpose);
        }, ...semantics.types } };
    },
    resolveShape: () => assert.fail("a canonical provider construction never reopens a raw own-member shape"),
    resolveEffectiveShape: occurrence => {
      const descriptor = current.resolver.publishedShapeDescriptor(occurrence);
      return current.contextRow === undefined || descriptor === undefined ? undefined : current.resolver.resolveProviderShape(
        current.contextType, descriptor, occurrence, host.semanticsFor(occurrence), { depth: 0 }, current.contextRow.shape.targetType);
    },
    resolveLiteralShape: (shape, occurrence) => {
      const descriptor = current.resolver.publishedShapeDescriptor(occurrence);
      const members = descriptor === undefined ? undefined : current.resolver.retainPublishedMembers(shape.members,
        descriptor, occurrence, host.semanticsFor(occurrence), { depth: 0 }, shape.targetType);
      return members === undefined ? { kind: "rejected", subject: occurrence,
        reason: "Native construction has no exact source-member correspondence for its declared storage." }
        : { kind: "resolved", shape: { ...shape, members } };
    },
    publishedShapeTarget: occurrence => {
      const descriptor = current.resolver.publishedShapeDescriptor(occurrence);
      return descriptor === undefined || !current.resolver.isProviderDescriptor(descriptor) ? undefined : current.contextRow?.shape.targetType;
    },
    scopedTargetType: selected => existing.get(selected),
    retainSourceShape: (occurrence, shape) => {
      const descriptor = current.resolver.publishedShapeDescriptor(occurrence);
      const queries = host.semanticsFor(occurrence);
      const prepared = descriptor === undefined ? undefined : current.resolver.resolveProviderShape(
        current.contextType, descriptor, occurrence, queries, { depth: 0 }, shape.targetType);
      const members = prepared === undefined ? undefined : current.resolver.retainPublishedMembers(shape.members,
        descriptor, occurrence, queries, { depth: 0 }, prepared.targetType);
      return members === undefined ? undefined : { ...shape, members };
    },
  };
  const freeze = () => {
    const records = [];
    const diagnostics = [];
    for (const input of inputs) {
      current = input;
      host.sourceFiles = [input.file];
      host.ast = input.program.syntax;
      host.sourceFacts = input.program.sourceFacts;
      host.memoryBindings = input.program.facts.analyses.memoryBindings;
      const navigation = input.program.facts.navigation;
      host.facts = { ...input.program.facts, navigation: { ...navigation, identity: { ...navigation.identity,
        isProjectDeclaration: selected => !foreign.has(selected) && navigation.identity.isProjectDeclaration(selected) } } };
      input.resolver = createCsharpObjectShapeMemberResolver(host);
      const record = createCsharpNativeConstructionDemandQuery(host);
      records.push(record);
      for (const issue of record.issues) {
        const ast = input.program.ast;
        const range = ast.authoredRange(issue.node);
        const text = range?.kind !== "authored" ? "<unavailable>"
          : ast.getSourceText(ast.getSourceFile(issue.node)).slice(range.start, range.end).slice(0, 200);
        diagnostics.push(`${issue.code}: ${issue.message} at ${ast.kindName(issue.node)} ${text}`);
      }
    }
    return Object.freeze({ issues: Object.freeze(records.flatMap(record => record.issues)),
      diagnosticLabel: diagnostics.join("; "),
      constructionFor: selected => records.map(record => record.constructionFor(selected)).find(selected => selected !== undefined),
      sourceRefusals: Object.freeze(inputs.flatMap(input => input.program.effectiveTypes.refusals())) });
  };
  return {
    row, node, rows, existing, explicit, primitive, foreign, semantics, host, guard,
    get nullable() { return nullable; }, set nullable(value) { nullable = value; },
    declare(literal) { return inputs.find(input => input.literal === literal).declarationNode; },
    references: { set(declaration, references) {
      const input = inputs.find(input => input.declarationNode === declaration);
      assert.equal(input !== undefined && references.every(reference =>
        input.program.navigation.referencesToDeclaration(declaration).includes(reference)), true,
      "every requested alias is already the same declaration's actual checked reference");
    } },
    freeze,
    queryCount: () => relationshipQueries,
  };
}

test("native construction never reopens a checked value type for a literal or retained optional alias", () => {
  const value = fixture();
  const expected = value.row([{ identity: "user" }, { identity: "system", optional: true,
    carrier: csharpNullableTargetType(integer) }], native, { provider: true });
  value.nullable = true;
  const literal = value.node(value.row([{ identity: "user" }]), expected);
  const declaration = value.declare(literal);
  value.semantics.types.expressionType = () => assert.fail("Native construction consumes the current Source publication");
  value.semantics.types.constructSignatures = () => assert.fail("constructability belongs to the published descriptor");
  const selected = value.freeze();
  assert.equal(selected.issues.length, 0, selected.diagnosticLabel);
  const constructed = selected.constructionFor(literal);
  const retained = selected.constructionFor(declaration);
  assert.equal(constructed !== undefined && retained !== undefined && retained.shape === constructed.shape, true,
    "the declaration retains the same proven allocation and optional ABI without a value-type retry");
  assert.equal(targetTypeRefEquals(getCsharpNullableElementTargetType(retained.targetType), native), true);
});

test("native construction uses the literal's declared context and freezes its lookup", () => {
  const value = fixture();
  const expected = value.row([{ identity: "user" }, { identity: "system" }], native, { provider: true });
  const source = value.row([{ identity: "system" }, { identity: "user" }]);
  const literal = value.node(source, expected);
  const selected = value.freeze();
  assert.equal(selected.issues.length, 0, selected.diagnosticLabel);
  assert.equal(selected.constructionFor(literal)?.targetType === native, true, "one original native allocation");
  const queries = value.queryCount();
  selected.constructionFor(literal);
  assert.equal(value.queryCount(), queries, "sealed lookup does not recompute");
  assert.equal(Object.isFrozen(selected) && Object.isFrozen(selected.issues), true);
});

test("declared native construction preserves optional fields and one nullable alias state", () => {
  const value = fixture();
  const expected = value.row([{ identity: "user" },
    { identity: "system", optional: true, carrier: csharpNullableTargetType(integer) }], native, { provider: true });
  const source = value.row([{ identity: "user" }]);
  value.nullable = true;
  const literal = value.node(source, expected);
  const declaration = value.declare(literal);
  const reference = value.node({ union: [source, { absent: true }, { absent: true }] }, undefined, "reference");
  value.references.set(declaration, [reference]);
  const selected = value.freeze();
  assert.equal(selected.issues.length, 0, selected.diagnosticLabel);
  assert.equal(targetTypeRefEquals(getCsharpNullableElementTargetType(selected.constructionFor(reference)?.targetType), native), true);
  assert.equal(selected.constructionFor(literal)?.shape.members[1].optional, true);
  assert.equal(selected.constructionFor(literal)?.shape === selected.constructionFor(reference)?.shape, true);
});

test("declared native numeric storage keeps int64 and cannot override an explicit marker", () => {
  for (const explicit of [false, true]) {
    const value = fixture();
    const expected = value.row([{ identity: "user" }], native, { provider: true });
    if (explicit) value.explicit.add(value.primitive);
    const literal = value.node(value.row([{ identity: "user", carrier: floating }]), expected);
    const selected = value.freeze();
    assert.equal(selected.issues.length !== 0, explicit, `explicit authored storage remains authoritative; ${selected.diagnosticLabel}`);
    assert.equal(selected.constructionFor(literal) === undefined, explicit);
    if (!explicit) assert.equal(selected.constructionFor(literal)?.shape.members[0].type === integer, true);
  }
});

test("a published float64 initializer cannot construct an exact int64 native field", () => {
  const value = fixture();
  const expected = value.row([{ identity: "user" }], native, { provider: true });
  value.explicit.add(value.primitive);
  const literal = value.node(value.row([{ identity: "user", carrier: floating }]), expected);
  const selected = value.freeze();
  const initializer = value.host.ast.as.AsPropertyAssignment(value.host.ast.properties(literal)[0])?.Initializer;
  const outcome = initializer === undefined ? undefined : value.host.effectiveTypes.get(initializer);
  const descriptor = outcome === undefined || outcome.kind === "refused" ? undefined
    : sourceTypeDescriptorStructure(outcome.construction ?? outcome.type);
  assert.equal(descriptor?.kind === "primitive" && descriptor.primitive === "float64", true);
  assert.equal(selected.issues.length, 1);
  assert.equal(selected.issues[0].node === literal &&
    selected.issues[0].code === "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN" &&
    selected.issues[0].message === "The declared native construction cannot retain all exact fields, absence and native storage without a copied or adapted object.", true);
  assert.equal(selected.constructionFor(literal) === undefined, true);
});

test("unrelated native declarations never retarget the original literal", () => {
  const value = fixture();
  const expected = value.row([{ identity: "user" }], native, { provider: true });
  const other = value.row([{ identity: "user" }], { ...native, id: "native.Other" }, { provider: true });
  const literal = value.node(value.row([{ identity: "user" }]), expected);
  value.node(other, undefined, "parameter");
  const selected = value.freeze();
  assert.equal(selected.issues.length, 0, selected.diagnosticLabel);
  assert.equal(selected.constructionFor(literal)?.targetType === native, true, "only the literal's context selects storage");
});

test("declared native construction rejects lost fields, accessors, methods, incompatible widths and nominal storage", () => {
  const controls = [
    { fields: [{ identity: "user" }, { identity: "extra" }] },
    { fields: [] },
    { fields: [{ identity: "user", read: "accessor" }] },
    { fields: [{ identity: "user", member: { accessor: { getter: true, setter: true } } }] },
    { fields: [{ identity: "user", member: { memberKind: "method" } }] },
    { fields: [{ identity: "user", member: { bound: true } }] },
    { fields: [{ identity: "user", carrier: boolean }] },
    { fields: [{ identity: "user", optional: true, carrier: csharpNullableTargetType(integer) }] },
    { fields: [{ identity: "user" }], options: { calls: [{}] } },
    { fields: [{ identity: "user" }], options: { indexes: [{}] } },
    ...["class", "struct", "enum"].map(kind => ({ fields: [{ identity: "user" }],
      target: { ...structural, csharpSourceDeclarationKind: kind } })),
    { fields: [{ identity: "user" }], missingPublication: true },
  ];
  for (const [index, control] of controls.entries()) {
    const value = fixture();
    const expected = value.row([{ identity: "user" }], native, { provider: true });
    const source = value.row(control.fields, control.target, control.options);
    if (control.missingPublication) value.host.resolveEffectiveShape = () => undefined;
    const selected = value.guard(source, expected);
    assert.equal(selected.compatible, false, `Native guard unit boundary ${index}: the original missing, extra, optional, callable, indexed and physical-field rejection is retained`);
  }
});

test("Native guard refusal retains the exact construction fault code and reason on a valid Source boundary", () => {
  const value = fixture();
  const expected = value.row([{ identity: "user", carrier: boolean }], native, { provider: true });
  const literal = value.node(value.row([{ identity: "user" }]), expected);
  const selected = value.freeze();
  assert.equal(selected.issues.length, 1);
  assert.equal(selected.issues[0].node === literal &&
    selected.issues[0].code === "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN" &&
    selected.issues[0].message === "The declared native construction cannot retain all exact fields, absence and native storage without a copied or adapted object.", true,
    "the real construction caller forwards the unchanged Native guard fault");
  assert.equal(selected.constructionFor(literal), undefined, "the real caller publishes no incompatible Native storage");
});

test("native construction requires exact checked member subjects, not field spelling", () => {
  const value = fixture();
  const expected = value.row([{ identity: "user" }], native, { provider: true });
  const source = value.row([{ identity: "user" }]);
  const resolve = value.host.resolveEffectiveShape;
  value.host.resolveEffectiveShape = occurrence => {
    const shape = resolve(occurrence);
    return shape === undefined ? undefined : { ...shape, members: shape.members.map(member => ({ ...member,
      origins: [{ kind: "declared", declaration: occurrence }] })) };
  };
  const literal = value.node(source, expected);
  const selected = value.freeze();
  assert.equal(selected.issues.length > 0, true);
  assert.equal(selected.constructionFor(literal) === undefined, true);
});

test("native construction preserves an exact preselected carrier and rejects an incompatible one", () => {
  for (const conflict of [false, true]) {
    const value = fixture();
    const expected = value.row([{ identity: "user" }], native, { provider: true });
    const literal = value.node(value.row([{ identity: "user" }]), expected);
    value.existing.set(literal, conflict ? { ...native, id: "selected.Other" } : native);
    const selected = value.freeze();
    assert.equal(selected.issues.length !== 0, conflict);
    assert.equal(selected.constructionFor(literal) === undefined, conflict);
  }
});

test("an unrelated annotation issue never hides another literal's valid record", () => {
  const value = fixture();
  const expected = value.row([{ identity: "user", optional: true }], native, { provider: true });
  const source = value.row([]);
  const valid = value.node(source, expected);
  const invalid = value.node(source);
  const selected = value.freeze();
  assert.equal(selected.issues.length, 0, "the retired Native producer does not duplicate the Host refusal");
  assert.equal(selected.sourceRefusals.length, 1);
  assert.equal(selected.sourceRefusals[0].site === invalid, true);
  assert.equal(selected.sourceRefusals[0].code, "TSONIC_UNTYPED_OBJECT_LITERAL");
  assert.equal(selected.constructionFor(valid)?.targetType === native, true);
  assert.equal(selected.constructionFor(invalid) === undefined, true);
});

test("construction never reads storage origins, incoming graphs, histories or global failure", () => {
  const value = fixture();
  const expected = value.row([{ identity: "user" }], native, { provider: true });
  const literal = value.node(value.row([{ identity: "user" }]), expected);
  Object.defineProperty(value.host, "sourceStorage", { get() { assert.fail("no source-storage authority in construction"); } });
  const selected = value.freeze();
  assert.equal(selected.issues.length, 0);
  assert.equal(selected.constructionFor(literal)?.targetType === native, true);
});

test("constructor-valued expressions do not instantiate object-literal fields", () => {
  const value = fixture();
  const constructor = value.row([], native, { provider: true, constructs: [{}] });
  const literal = value.node(constructor, constructor);
  value.host.resolveShape = () => { throw new Error("constructor must not instantiate instance fields"); };
  const selected = value.freeze();
  assert.equal(selected.issues.length, 0);
  assert.equal(selected.constructionFor(literal) === undefined, true);
});

test("unrelated checked values never instantiate native object shapes", () => {
  const value = fixture();
  const unrelated = value.node(value.row([{ identity: "field" }]), undefined, "parameter");
  value.host.resolveShape = () => { throw new Error("unrelated value cannot instantiate a shape"); };
  const selected = value.freeze();
  assert.equal(selected.issues.length, 0);
  assert.equal(selected.constructionFor(unrelated) === undefined, true);
});

test("an untyped empty literal is not assigned an arbitrary native destination", () => {
  const value = fixture();
  const literal = value.node(value.row([]));
  value.node(value.row([], native, { provider: true }), undefined, "parameter");
  const selected = value.freeze();
  assert.equal(selected.sourceRefusals[0].code, "TSONIC_UNTYPED_OBJECT_LITERAL");
  assert.equal(selected.constructionFor(literal) === undefined, true);
});

test("declared native construction never chooses one arm of a multi-carrier source union", () => {
  const value = fixture();
  const expected = value.row([{ identity: "user" }], native, { provider: true });
  const first = value.row([{ identity: "user" }]);
  const second = value.row([{ identity: "user" }]);
  const literal = value.node({ union: [first, second] }, expected);
  const selected = value.freeze();
  assert.equal(selected.issues.some(issue => issue.code === "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN"), true,
    "multiple present source carriers cannot gain a single native allocation by choosing an arm");
  assert.equal(selected.constructionFor(literal) === undefined, true, "no partial union construction published");
});

test("a native literal selection never replaces its enclosing container", () => {
  const value = fixture();
  const expected = value.row([{ identity: "user" }], native, { provider: true });
  const literal = value.node(value.row([{ identity: "user" }]), expected);
  const container = value.node(value.row([{ identity: "other" }]), undefined, "container");
  const selected = value.freeze();
  assert.equal(selected.issues.length, 0);
  assert.equal(selected.constructionFor(literal)?.targetType === native, true);
  assert.equal(selected.constructionFor(container) === undefined, true);
});

test("native member metadata retains its finite resource guard", () => {
  const value = fixture();
  const expected = value.row([{ identity: "user" }], native, { provider: true });
  const valid = value.node(value.row([{ identity: "user" }]), expected);
  const source = value.row([{ identity: "user" }]);
  const invalid = value.node(source, expected);
  const resolve = value.host.resolveEffectiveShape;
  value.host.resolveEffectiveShape = occurrence => {
    const shape = resolve(occurrence);
    return occurrence !== invalid || shape === undefined ? shape : { ...shape, members: shape.members.map(member => ({
      ...member, origins: Array(maximumCsharpMetadataEntries).fill(member.origins[0]),
    })) };
  };
  const selected = value.freeze();
  assert.equal(selected.issues.length, 1, "one local resource failure");
  const issue = selected.issues[0];
  assert.equal(issue.code === "TSONIC_COMPILER_RESOURCE_LIMIT" && issue.node === invalid &&
    issue.message === `Native construction of this object literal exceeded the finite metadata limit of ${maximumCsharpMetadataEntries} entries.`,
    true, "resource exhaustion names the affected literal and actual limit, not unsupported source");
  assert.equal(selected.constructionFor(invalid) === undefined, true, "no unproved failed-node selection");
  assert.equal(selected.constructionFor(valid)?.targetType === native, true, "unrelated valid construction remains published");
});

test("native construction does not reclassify unrelated malformed metadata as resource exhaustion", () => {
  const value = fixture();
  const expected = value.row([{ identity: "user" }], native, { provider: true });
  value.node(value.row([{ identity: "user" }]), expected);
  const failure = new TypeError("C# immutable metadata requires plain data records.");
  value.host.resolveEffectiveShape = () => { throw failure; };
  assert.throws(() => value.freeze(), error => error === failure, "the original invalid-metadata failure is preserved");
});

test("declared empty construction keeps fresh expression identity without origin transport", () => {
  const value = fixture();
  const expected = value.row([{ identity: "user", optional: true }], native, { provider: true });
  const source = value.row([]);
  const first = value.node(source, expected);
  const second = value.node(source, expected);
  const selected = value.freeze();
  assert.equal(selected.issues.length, 0);
  assert.equal(selected.constructionFor(first) !== undefined && selected.constructionFor(second) !== undefined, true);
  assert.equal(first === second, false, "each authored literal is a distinct runtime allocation");
});

test("an open parameter sharing the same checker type gains no allocation authority", () => {
  const value = fixture();
  const expected = value.row([{ identity: "user", optional: true }], native, { provider: true });
  const source = value.row([]);
  const literal = value.node(source, expected);
  const parameter = value.node(source, undefined, "parameter");
  const selected = value.freeze();
  assert.equal(selected.issues.length, 0);
  assert.equal(selected.constructionFor(literal)?.targetType === native, true);
  assert.equal(selected.constructionFor(parameter) === undefined, true);
});

test("observed callers cannot supply an untyped producer's annotation", () => {
  const value = fixture();
  const literal = value.node(value.row([]));
  value.node(value.row([], native, { provider: true }), undefined, "call");
  const selected = value.freeze();
  assert.equal(selected.sourceRefusals[0].site === literal, true);
  assert.equal(selected.sourceRefusals[0].code, "TSONIC_UNTYPED_OBJECT_LITERAL");
  assert.equal(selected.constructionFor(literal) === undefined, true);
});

test("declared native indexed construction retains one exact allocation", () => {
  const value = fixture();
  const expected = value.row([], native, { provider: true, indexes: [{}] });
  const literal = value.node(value.row([]), expected);
  const selected = value.freeze();
  assert.equal(selected.issues.length, 0);
  assert.equal(selected.constructionFor(literal)?.targetType === native, true);
});

test("native indexed construction preserves populated, indexed and required-field safety refusals", () => {
  for (const control of ["populated", "indexed", "required"]) {
    const value = fixture();
    const expected = value.row(control === "required" ? [{ identity: "required" }] : [], native,
      { provider: true, indexes: [{}] });
    const source = value.row(control === "populated" ? [{ identity: "extra" }] : [], structural,
      control === "indexed" ? { indexes: [{}] } : {});
    const selected = value.guard(source, expected);
    assert.equal(selected.compatible, false, `Native indexed guard unit boundary: ${control}`);
  }
});

test("noninterned exactly checker-equivalent literal types remain supported", () => {
  const value = fixture();
  const expected = value.row([{ identity: "user", optional: true }], native, { provider: true });
  const source = value.row([]);
  const boundary = value.guard(source, expected);
  assert.equal(boundary.types[0] !== boundary.equivalentType && boundary.queries.types.isIdentical(boundary.types[0], boundary.equivalentType), true,
    "the two real checked types are distinct objects with proved checker equivalence; no Source query is substituted");
  assert.equal(boundary.compatible, false, "independent checker equivalence cannot publish another destination's Native allocation or origins");
  const literal = value.node(source, expected);
  const selected = value.freeze();
  assert.equal(selected.issues.length, 0);
  assert.equal(selected.constructionFor(literal)?.targetType === native, true);
});

test("foreign literals are not reclassified by the project's construction owner", () => {
  const value = fixture();
  const expected = value.row([], native, { provider: true });
  const literal = value.node(value.row([]), expected);
  value.foreign.add(literal);
  const selected = value.freeze();
  assert.equal(selected.issues.length, 0);
  assert.equal(selected.constructionFor(literal) === undefined, true);
});

test("declared empty construction retains required, callable, indexed, nominal and selected-storage refusals", () => {
  const controls = [
    { required: true }, { calls: [{}] }, { indexes: [{}] },
    { shape: { methodImplementation: {} } },
    { shape: { targetType: { ...structural, csharpSourceDeclarationKind: "class" } } },
    { selected: { kind: "pointer", pointee: native } },
  ];
  for (const [index, control] of controls.entries()) {
    const value = fixture();
    const expected = value.row([{ identity: "user", optional: !control.required }], native, { provider: true });
    const source = value.row([], structural, control);
    if (control.required || control.calls !== undefined || control.indexes !== undefined || control.shape !== undefined) {
      const selected = value.guard(source, expected);
      assert.equal(selected.compatible, false, `Native empty guard unit boundary ${index}: required, callable, indexed and existing-value safety`);
    } else {
      const literal = value.node(source, expected);
      if (control.selected !== undefined) value.existing.set(literal, control.selected);
      const selected = value.freeze();
      assert.equal(selected.issues.length > 0, true, `storage control ${index}`);
      assert.equal(selected.constructionFor(literal) === undefined, true, `storage control ${index}: no publication`);
    }
  }
});

test("optional native fields keep the full-width provider carrier", () => {
  const value = fixture();
  const expected = value.row([{ identity: "user", optional: true, carrier: csharpNullableTargetType(integer) }],
    native, { provider: true });
  const literal = value.node(value.row([]), expected);
  const selected = value.freeze();
  assert.equal(selected.issues.length, 0);
  assert.equal(targetTypeRefEquals(getCsharpNullableElementTargetType(selected.constructionFor(literal)?.shape.members[0].type), integer), true);
});

test("an existing exact native parameter needs no new literal allocation record", () => {
  const value = fixture();
  const parameter = value.node(value.row([], native, { provider: true }), undefined, "parameter");
  const selected = value.freeze();
  assert.equal(selected.issues.length, 0);
  assert.equal(selected.constructionFor(parameter) === undefined, true, "declared native carrier is unchanged");
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
  const value = fixture();
  const expected = value.row([{ identity: "user" }], native, { provider: true });
  const literal = value.node(value.row([{ identity: "user" }]), expected);
  value.host.resolveLiteralShape = (_shape, occurrence) => ({ kind: "rejected", subject: occurrence,
    reason: "Native construction has no exact source-member correspondence for its declared storage." });
  const selected = value.freeze();
  assert.equal(selected.issues.some(issue => /source-member correspondence/u.test(issue.message)), true);
  assert.equal(selected.constructionFor(literal) === undefined, true);
});

// Basis: nextgen plan R5/I7 (signed by Claude with the D1 test changes). `any` is a Host value refusal
// (TSONIC_ANY_UNSUPPORTED, forwarded before C# analysis); the C# construction owner never originates it, and meeting
// an `any` object literal is a producer invariant failure, not a C# refusal.
test("consumed any reaching native construction is an invariant failure, never a C#-originated refusal", () => {
  const value = fixture();
  value.node(value.row([{ identity: "user" }]), { any: true });
  assert.throws(() => value.freeze(), /object literal of type any must be refused by the Host/u);
});

function memberProvenanceFixture() {
  const checked = checkCsharpSource({ sourceText: `
    type Slot = { value?: number };
    type Other = { value?: number };
    type Required = { value: number };
    export const omitted: Slot = {};
    export const present: Slot = { value: 1 };
    export const other: Other = {};
    export const required: Required = { value: 1 };
    export const fresh: Slot = {};
    export const read = omitted;
  ` });
  assert.equal(checked.sourceDiagnosticsText, "", "all owner evidence comes from valid checked declarations");
  const source = csharpTestSourceProgram(checked.source);
  const ast = source.ast;
  const declarations = new Map();
  const visit = node => {
    if (ast.is.IsVariableDeclaration(node)) declarations.set(ast.text(ast.name(node)), node);
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  source.navigation.sourceFiles.forEach(visit);
  const actualQueries = source.semantics.forNode(declarations.get("omitted"));
  const queries = { ...actualQueries, types: new Proxy({}, { get() {
    return assert.fail("canonical member retention cannot reconstruct a checker inventory");
  } }) };
  const overrides = new Map();
  const represent = descriptor => {
    const selected = sourceTypeDescriptorStructure(descriptor);
    if (selected.kind === "primitive" && selected.primitive === "float64") return floating;
    if (selected.kind === "optional") return csharpNullableTargetType(represent(selected.value));
    return assert.fail(`unexpected published member kind ${selected.kind}`);
  };
  const resolver = createCsharpObjectShapeMemberResolver({ ast, navigation: source.navigation,
    effectiveTypes: { get: node => overrides.has(node) ? overrides.get(node) : source.effectiveTypes.get(node) },
    hasSemantics: file => source.semantics.includes(file), semantics: () => queries, semanticsFor: () => queries,
    sourceStorage: { memberSubjectFor: () => undefined }, memoryBindings: { hasBoundField: () => false },
    representations: { genericProjections: () => [] }, typeResolver: { resolveDescriptor: represent },
  });
  const node = (name, stage = "literal") => stage === "declaration" ? declarations.get(name)
    : ast.as.AsVariableDeclaration(declarations.get(name)).Initializer;
  const descriptor = (name, stage) => resolver.publishedShapeDescriptor(node(name, stage));
  const declared = name => {
    const type = descriptor(name, "declaration");
    assert.equal(type !== undefined, true, "the actual declared occurrence has its canonical Host inventory");
    const selected = resolver.deriveMembers(type, node(name, "declaration"), queries, { depth: 0 });
    assert.equal(selected?.length === 1, true, "one canonical origin owns the exact Native slot");
    return selected;
  };
  const retain = (members, name, stage = "literal", type = descriptor(name, stage)) => type === undefined ? undefined
    : resolver.retainPublishedMembers(members, type, node(name, stage), queries, { depth: 0 });
  return { source, queries, resolver, node, descriptor, declared, retain,
    publish: (name, outcome) => overrides.set(node(name), outcome) };
}

test("typed optional member evidence survives literal, declared value and read publication", () => {
  const value = memberProvenanceFixture();
  const owner = sourceTypeDescriptorStructure(value.descriptor("omitted", "declaration")).members[0].origin;
  const literal = value.retain(value.declared("omitted"), "omitted");
  assert.equal(literal?.length === 1 && literal[0].optional === true &&
    literal[0].origins.length === 1 && sourceTypeDescriptorMemberOriginsEqual(literal[0].origins[0], owner) &&
    value.source.effectiveTypes.get(value.node("omitted")).memberCorrespondence.length === 0, true,
  "the physical optional slot keeps its declared owner without fabricating a present source property");
  const declaration = value.retain(literal, "omitted", "declaration");
  assert.equal(declaration?.length === 1 && declaration[0].origins.length === 1 &&
    sourceTypeDescriptorMemberOriginsEqual(declaration[0].origins[0], owner) &&
    declaration[0].sourceDeclarations.includes(owner.declaration), true,
  "the declared value revalidates the same exact optional member");
  const read = value.retain(declaration, "read");
  assert.equal(read?.length === 1 && targetTypeRefEquals(read[0].type, literal[0].type), true,
    "a later read retains the same native carrier without a missing-member fallback");
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
  assert.equal(value.retain(value.declared("required"), "omitted") === undefined,
    true, "a checked absent result cannot initialize a required native field");
});

test("missing, foreign, stale and mismatched member evidence cannot inherit optional absence", () => {
  const value = memberProvenanceFixture();
  const selected = value.declared("omitted")[0];
  const { origins: _removed, ...missing } = selected;
  const controls = [
    ["missing evidence", missing],
    ["foreign declared owner", { ...selected, origins: value.declared("other")[0].origins }],
    ["stale absence", selected, { ...value.descriptor("omitted") }],
    ["mismatched present property", { ...selected, origins: [{ kind: "declared",
      declaration: value.source.ast.properties(value.node("present"))[0] }] }],
  ];
  for (const [label, member, descriptor = value.descriptor("omitted")] of controls) assert.equal(
    value.retain([member], "omitted", "literal", descriptor) === undefined,
    true, `${label}: no native slot is published from missing or unrelated proof`);
});

test("canonical member merging retains separate owners without transferring an absence proof", () => {
  const value = memberProvenanceFixture();
  const first = value.retain(value.declared("omitted"), "omitted");
  const second = value.retain(value.declared("other"), "other");
  const merged = mergeCsharpObjectShapeSubjects({ targetType: structural, members: first },
    { targetType: structural, members: second });
  const origins = merged.members[0].origins;
  assert.equal(origins.length === 2 && origins.includes(first[0].origins[0]) && origins.includes(second[0].origins[0]),
    true, "each checked source/declaration/member alternative remains intact");
  const selected = value.retain(merged.members, "other");
  assert.equal(selected?.length === 1 && selected[0].sourceDeclarations.includes(second[0].origins[0].declaration),
    true, "the exact second source selects only its own retained proof");
  assert.equal(value.retain(merged.members, "fresh")?.length === 1, true,
    "an independently published fresh occurrence owns its absence rather than borrowing a previous construction proof");
  const fresh = value.descriptor("fresh");
  value.publish("fresh", undefined);
  assert.equal(value.retain(merged.members, "fresh", "literal", fresh) === undefined,
    true, "another empty source without its canonical publication cannot inherit absence merely because its physical shape key matches");
});

test("ambiguous optional declaration owners never choose a first matching proof", () => {
  const value = memberProvenanceFixture();
  const first = value.declared("omitted");
  const second = value.declared("other");
  const merged = mergeCsharpObjectShapeSubjects({ targetType: structural, members: first }, { targetType: structural, members: second });
  const original = value.source.effectiveTypes.get(value.node("omitted"));
  const firstType = sourceTypeDescriptorStructure(value.descriptor("omitted"));
  const secondType = sourceTypeDescriptorStructure(value.descriptor("other"));
  const ambiguous = { ...firstType, members: [...firstType.members, ...secondType.members] };
  value.publish("omitted", { ...original, type: ambiguous });
  assert.equal(value.retain(merged.members, "omitted") === undefined,
    true, "different checked owners associated with the same source are ambiguous, not a success fallback");
});
