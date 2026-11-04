import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles, createSourceSemanticsExtension, sourcePrimitive, TstsSourceProviderContractVersion } from "@tsonic/tsts";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { createCsharpNativeConstructionDemandQuery } from "../../../dist/analysis/objects/native-construction-demand.js";
import { csharpNativeConstructionMembersMatch } from "../../../dist/analysis/objects/native-construction-members.js";
import { createCsharpObjectShapeMemberResolver } from "../../../dist/analysis/objects/shapes/member-evidence.js";
import { mergeCsharpObjectShapeSubjects } from "../../../dist/analysis/objects/shapes/construction.js";
import { checkCsharpSource, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { maximumCsharpMetadataEntries } from "../../../dist/target-model/metadata/immutable.js";
import { csharpStringTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
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
      const property = { name: field.identity, type: primitive, symbol: {}, rootSymbols: [],
        optional: field.optional ?? false, readonly: field.readonly ?? false };
      const member = { sourceKey: { kind: "property", name: field.identity }, sourceName: field.identity,
        sourceSubjects: [property.symbol], sourceTypes: [primitive], targetName: `${target.id}-${index}`,
        type: field.carrier ?? integer, memberKind: "property",
        ...(field.optional ? { optional: true } : {}),
        ...(options.provider ? { exactNumericStorage: true } : {}), ...field.member };
      return { identity: field.identity, property, symbol: property.symbol, rootSymbols: [], declarations: [],
        getters: [], setters: [], read: field.read ?? "property", member };
    });
    rows.set(type, { fields: selections, shape: { sourceType: type, targetType: target,
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
    const fieldType = explicit.has(primitive) ? "Words.float64" : "number";
    const declaration = (name, selected) => `interface ${name} {
      ${selected.fields.map(field => `${field.property.readonly ? "readonly " : ""}${JSON.stringify(field.identity)}${field.property.optional ? "?" : ""}: ${fieldType};`).join(" ")}
      ${selected.calls.length === 0 ? "" : "(): number;"}
      ${selected.constructs.length === 0 ? "" : "new(): object;"}
      ${selected.indexes.length === 0 ? "" : "[key: string]: number;"}
    }`;
    const empty = { fields: [], calls: [], constructs: [], indexes: [] };
    const propertyValue = explicit.has(primitive) ? "1 as Words.float64" : "1";
    const properties = (sourceRow?.fields ?? []).map(field => field.read === "accessor"
      ? `get ${JSON.stringify(field.identity)}() { return ${propertyValue}; }` : `${JSON.stringify(field.identity)}: ${propertyValue}`).join(", ");
    const initializer = kind === "parameter" ? "other" : sourceRow?.constructs.length > 0 ? "Constructor"
      : sourceRow?.fields.some(field => field.property.optional) ? "{ ...seed }"
      : type.union === undefined ? `{ ${properties} }` : "{ ...choice }";
    const annotation = context?.any ? ": any" : context === undefined ? "" : `: ContextRow${nullable ? " | null | undefined" : ""}`;
    const nativeModel = { moduleSpecifier: "@fixture/native", providerModuleId: "Fixture.Native", exports: [{
      id: "ContextRow", name: "ContextRow", kind: "class", members: [
        ...(contextRow?.fields ?? []).map(field => ({ id: `ContextRow::${field.identity}`, name: field.identity,
          kind: "property", type: { kind: "number" }, optional: field.property.optional, readonly: field.property.readonly })),
        ...(contextRow?.indexes.length > 0 ? [{ id: "ContextRow::index", name: "index", kind: "indexer",
          signatures: [{ id: "ContextRow::index(string)", parameters: [{ name: "key", type: { kind: "string" } }],
            returnType: { kind: "number" } }] }] : []),
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
      "/src/node_modules/@fixture/words/index.d.ts": "export type float64 = number;",
      "/src/index.ts": `import type * as Words from "@fixture/words";
        ${declaration("SourceRow", sourceRow ?? empty)}
        ${contextRow?.provider ? 'import type { ContextRow } from "@fixture/native";' : declaration("ContextRow", contextRow ?? empty)}
        declare const destination: ContextRow;
        type Equivalent = {};
        declare class Constructor {}
        declare const seed: SourceRow;
        declare const choice: { user: 1 } | { user: 2 };
        function run(other: ContextRow | null | undefined): void {
          let value${annotation} = ${initializer};
          ${nullable ? "value = other;" : ""}
          void value; void other;
        }`,
    }, compilerOptions: { strict: true, target: "es2022", module: "esnext", moduleResolution: "bundler" },
    extensionHostOptions: { extensions: [createSourceSemanticsExtension({ modules: [{ moduleSpecifier: "@fixture/words",
      packageName: "@fixture/words", exports: [sourcePrimitive("float64", "float64", "number", true, 64)] }] }), providerExtension] } }).checkSource();
    assert.equal(checked.diagnostics.length, 0, "positive construction fixtures use valid checked Source");
    assert.equal(checked.extensionDiagnostics.length, 0);
    const program = createTargetSourceProgram(checked);
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
    const selected = kind === "literal" ? literal : kind === "parameter" ? parameter : reference;
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
    const nativeRows = new Map();
    const materialize = (original, sourceType) => {
      if (original === undefined || sourceType === undefined) return;
      const checkedMembers = queries.types.structuralMembers(sourceType, sourceType, "correspondence");
      const members = original.shape.members.map(member => {
        const field = original.fields.find(field => member.sourceSubjects?.includes(field.property.symbol));
        const pair = checkedMembers.kind !== "available" ? undefined : checkedMembers.members.find(pair =>
          pair.kind === "present" && pair.source.property.name === field?.identity);
        return pair?.kind !== "present" ? member : { ...member,
          sourceSubjects: [pair.source.property.symbol, ...pair.source.declarations],
          sourceDeclarations: pair.source.declarations, sourceTypes: [pair.source.property.type] };
      });
      nativeRows.set(sourceType, { original, members });
    };
    materialize(sourceRow, actualType);
    materialize(sourceRow, declaredSource);
    materialize(contextRow, contextType);
    const checkedContext = queries.types.contextualValueSelection(literal);
    const selectedContext = checkedContext.kind === "selected" ? checkedContext.component.selectedType : undefined;
    if (contextRow !== undefined && selectedContext !== undefined) materialize(contextRow, selectedContext);
    const equivalent = syntax.find(selected => program.ast.is.IsTypeAliasDeclaration(selected) &&
      program.ast.text(program.ast.name(selected)) === "Equivalent");
    const equivalentType = queries.types.authoredType(program.ast.typeNode(equivalent));
    materialize(sourceRow, equivalentType);
    const input = { program, file, literal, declarationNode, reference, queries, nativeRows, type, context,
      sourceRow, contextRow, actualType, contextType, declaredSource, equivalentType, nullable };
    inputs.push(input);
    return selected;
  };
  const guard = (source, destination) => {
    const selectedRows = [rows.get(source), rows.get(destination)];
    const declarations = selectedRows.map((selected, index) => `interface ${index === 0 ? "SourceRow" : "DestinationRow"} {
      ${selected.fields.map(field => field.read === "accessor" ? `get ${JSON.stringify(field.identity)}(): number;`
        : `${field.property.readonly ? "readonly " : ""}${JSON.stringify(field.identity)}${field.property.optional ? "?" : ""}: number;`).join(" ")}
      ${selected.calls.length === 0 ? "" : "(): number;"}
      ${selected.constructs.length === 0 ? "" : "new(): object;"}
      ${selected.indexes.length === 0 ? "" : "[key: string]: number;"}
    }`).join("\n");
    const checked = createCompilerSessionFromFiles({ currentDirectory: "/src", files: {
      "/src/index.ts": `${declarations} type Equivalent = {}; declare const source: SourceRow; declare const destination: DestinationRow;`,
    }, compilerOptions: { strict: true, target: "es2022", module: "esnext" } }).checkSource();
    assert.equal(checked.diagnostics.length, 0, "a Native guard unit boundary declares two valid types without an invalid assignment");
    const program = createTargetSourceProgram(checked);
    const file = checked.getSourceFile("/src/index.ts");
    const variables = [];
    let equivalent;
    const visit = node => {
      if (program.ast.is.IsTypeAliasDeclaration(node) && program.ast.text(program.ast.name(node)) === "Equivalent") equivalent = node;
      if (program.ast.is.IsVariableDeclaration(node)) variables.push(node);
      program.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    visit(file);
    const queries = program.semantics.forFile(file);
    const descriptors = variables.map(variable => program.effectiveTypes.get(variable));
    assert.equal(descriptors.length === 2 && descriptors.every(outcome => outcome !== undefined &&
      outcome.kind !== "refused" && outcome.type.kind === "declared" && outcome.type.source !== undefined), true,
      "both real declared descriptors come from this exact program's eager publication");
    const types = descriptors.map(outcome => outcome.type.source.selectedType);
    const shapes = selectedRows.map((selected, index) => ({
      ...selected.shape,
      sourceType: selected.shape.sourceType === undefined ? undefined : types[index],
      members: selected.shape.members.map(member => {
        const field = selected.fields.find(field => member.sourceSubjects?.includes(field.property.symbol));
        const property = field === undefined ? undefined : queries.types.propertyInfos(types[index]).find(property => property.name === field.identity);
        const declarations = property === undefined ? [] : queries.declarations.symbolDeclarations(property.symbol);
        return property === undefined ? member : { ...member, sourceSubjects: [property.symbol, ...declarations],
          sourceDeclarations: declarations, sourceTypes: [property.type] };
      }),
    }));
    const compatible = csharpNativeConstructionMembersMatch(types[0], shapes[0], shapes[1], queries,
      { ast: program.ast, sourceFacts: program.sourceFacts }, () => {});
    const equivalentType = queries.types.authoredType(program.ast.typeNode(equivalent));
    return { compatible, program, descriptors, types, shapes, queries, equivalentType };
  };
  const host = {
    providers: { resolveType(fact) {
      assert.equal(fact.providerModuleId === "Fixture.Native" && fact.exportId === "ContextRow", true,
        "the Native leaf resolver receives the real compiler-produced provider declaration fact");
      return { kind: "resolved", relations: [{ kind: "type",
        objectLiteralConstruction: { kind: "object-initializer" }, targetBinding: current.contextRow.shape.targetType }] };
    } },
    semanticsFor: selected => {
      const input = inputs.find(input => input.program.ast.getSourceFile(selected) === input.file);
      assert.equal(input !== undefined, true);
      return { ...input.queries, types: { ...input.queries.types,
        structuralMembers(source, destination, purpose) {
          assert.equal(purpose, "read", "construction requires readable members");
          relationshipQueries++;
          return input.queries.types.structuralMembers(source, destination, purpose);
        }, ...semantics.types } };
    },
    resolveShape: type => {
      const selected = current.nativeRows.get(type);
      if (selected === undefined) return undefined;
      const original = selected.original.shape;
      const mismatchedCallableLiteral = type === current.actualType &&
        (selected.original.calls.length > 0 || selected.original.indexes.length > 0);
      return { ...original, sourceType: original.sourceType === undefined ? undefined
        : mismatchedCallableLiteral ? current.declaredSource : type,
        members: original.members.map(member => selected.members.find(selected => selected.targetName === member.targetName) ?? member) };
    },
    resolveEffectiveShape: () => current.contextRow === undefined ? undefined : host.resolveShape(current.contextType),
    resolveLiteralShape: shape => ({ kind: "resolved", shape }),
    scopedTargetType: selected => existing.get(selected),
    retainSourceShape: (_node, _type, shape) => shape,
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
    freeze() {
      const records = [];
      for (const input of inputs) {
        current = input;
        host.sourceFiles = [input.file];
        host.ast = input.program.ast;
        host.effectiveTypes = input.program.effectiveTypes;
        host.sourceFacts = input.program.sourceFacts;
        host.navigation = { ...input.program.navigation,
          isProjectDeclaration: selected => !foreign.has(selected) && input.program.navigation.isProjectDeclaration(selected) };
        records.push(createCsharpNativeConstructionDemandQuery(host));
      }
      return Object.freeze({ issues: Object.freeze(records.flatMap(record => record.issues)),
        constructionFor: selected => records.map(record => record.constructionFor(selected)).find(selected => selected !== undefined),
        sourceRefusals: Object.freeze(inputs.flatMap(input => input.program.effectiveTypes.refusals())) });
    },
    queryCount: () => relationshipQueries,
  };
}

test("native construction uses the literal's declared context and freezes its lookup", () => {
  const value = fixture();
  const expected = value.row([{ identity: "user" }, { identity: "system" }], native, { provider: true });
  const source = value.row([{ identity: "system" }, { identity: "user" }]);
  const literal = value.node(source, expected);
  const selected = value.freeze();
  assert.equal(selected.issues.length, 0);
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
  assert.equal(selected.issues.length, 0);
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
    assert.equal(selected.issues.length !== 0, explicit, "explicit authored storage remains authoritative");
    assert.equal(selected.constructionFor(literal) === undefined, explicit);
    if (!explicit) assert.equal(selected.constructionFor(literal)?.shape.members[0].type === integer, true);
  }
});

test("unrelated native declarations never retarget the original literal", () => {
  const value = fixture();
  const expected = value.row([{ identity: "user" }], native, { provider: true });
  const other = value.row([{ identity: "user" }], { ...native, id: "native.Other" }, { provider: true });
  const literal = value.node(value.row([{ identity: "user" }]), expected);
  value.node(other, undefined, "parameter");
  const selected = value.freeze();
  assert.equal(selected.issues.length, 0);
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
    { fields: [{ identity: "user" }], options: { shape: { sourceType: undefined } } },
  ];
  for (const [index, control] of controls.entries()) {
    const value = fixture();
    const expected = value.row([{ identity: "user" }], native, { provider: true });
    const source = value.row(control.fields, control.target, control.options);
    const selected = value.guard(source, expected);
    assert.equal(selected.compatible, false, `Native guard unit boundary ${index}: the original missing, extra, optional, callable, indexed and physical-field rejection is retained`);
  }
});

test("Native guard refusal retains the exact construction fault code and reason on a valid Source boundary", () => {
  const value = fixture();
  const expected = value.row([{ identity: "user" }], native, { provider: true });
  const literal = value.node(value.row([{ identity: "user", carrier: boolean }]), expected);
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
  value.rows.get(source).shape.members[0].sourceSubjects = [{}];
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
  const member = value.rows.get(source).shape.members[0];
  value.rows.get(source).shape.members = Array(maximumCsharpMetadataEntries).fill(member);
  const invalid = value.node(source, expected);
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
  value.semantics.types.structuralMembers = () => { throw failure; };
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
  assert.equal(boundary.compatible, true, "the Native guard admits the valid empty source and optional destination");
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
    if (control.required || control.calls !== undefined || control.indexes !== undefined) {
      const selected = value.guard(source, expected);
      assert.equal(selected.compatible, false, `Native empty guard unit boundary ${index}: required, callable and indexed safety`);
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
    const value = fixture();
    const expected = value.row([{ identity: "user", carrier: csharpTsValueTargetType() }], native, { provider: true });
    const literal = value.node(value.row([{ identity: "user", carrier: sourceCarrier }]), expected);
    const selected = value.freeze();
    assert.equal(selected.issues.length === 0, accepted, "native reference payload retains its allocation");
    assert.equal(selected.constructionFor(literal) !== undefined, accepted, "no numeric boxing or partial publication");
  }
});

test("native storage publication still requires exact source-member correspondence", () => {
  const value = fixture();
  const expected = value.row([{ identity: "user" }], native, { provider: true });
  const literal = value.node(value.row([{ identity: "user" }]), expected);
  value.host.retainSourceShape = () => undefined;
  const selected = value.freeze();
  assert.equal(selected.issues.some(issue => /source-member correspondence/u.test(issue.message)), true);
  assert.equal(selected.constructionFor(literal) === undefined, true);
});

test("consumed any is refused without a dynamic object-construction path", () => {
  const value = fixture();
  const literal = value.node(value.row([{ identity: "user" }]), { any: true });
  const selected = value.freeze();
  assert.equal(selected.issues[0].code, "TSONIC_ANY_UNSUPPORTED");
  assert.equal(selected.constructionFor(literal) === undefined, true);
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
  ` });
  assert.equal(checked.sourceDiagnosticsText, "", "all owner evidence comes from valid checked declarations");
  const source = createTargetSourceProgram(checked.source);
  const ast = source.ast;
  const declarations = new Map();
  const visit = node => {
    if (ast.is.IsVariableDeclaration(node)) declarations.set(ast.text(ast.name(node)), node);
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  source.navigation.sourceFiles.forEach(visit);
  const queries = source.semantics.forNode(declarations.get("omitted"));
  const owner = name => queries.types.authoredType(ast.typeNode(declarations.get(name)));
  const actual = name => queries.types.expressionType(ast.as.AsVariableDeclaration(declarations.get(name)).Initializer);
  const resolver = createCsharpObjectShapeMemberResolver({});
  const member = ownerType => {
    const selected = queries.types.structuralMembers(ownerType, ownerType, "correspondence");
    assert.equal(selected.kind === "available" && selected.members.length === 1 && selected.members[0].kind === "present",
      true, "one checked declared property owns the native slot");
    const declared = selected.members[0].destination;
    const property = declared.property;
    return { sourceKey: { kind: "property", name: "value" }, sourceName: "value", targetName: "value",
      sourceSubjects: [property.symbol, ...property.rootSymbols, ...declared.declarations], sourceTypes: [property.type],
      memberKind: "property", type: property.optional ? csharpNullableTargetType(floating) : floating,
      ...(property.optional ? { optional: true } : {}) };
  };
  const declared = ownerType => {
    const selected = resolver.retainMemberDeclarationEvidence([member(ownerType)], ownerType, queries);
    assert.equal(selected !== undefined, true, "the declared member has checked typed ownership evidence");
    return selected;
  };
  return { queries, resolver, owner, actual, declared };
}

test("typed optional member evidence survives literal, declared value and read publication", () => {
  const value = memberProvenanceFixture();
  const owner = value.owner("omitted");
  const actual = value.actual("omitted");
  const literal = value.resolver.instantiateMemberEvidence(value.declared(owner), actual, value.queries, owner);
  assert.equal(literal?.length === 1 && literal[0].optional === true &&
    literal[0].sourceMemberEvidence[0].ownerType === owner && literal[0].sourceMemberEvidence[0].sourceType === actual &&
    literal[0].sourceMemberEvidence[0].correspondence.kind === "absent", true,
  "the physical optional slot keeps its declared owner without fabricating a present source property");
  const declaration = value.resolver.instantiateMemberEvidence(literal, owner, value.queries, actual);
  assert.equal(declaration?.length === 1 && declaration[0].sourceMemberEvidence[0].ownerType === owner &&
    declaration[0].sourceMemberEvidence[0].correspondence.kind === "present", true,
  "the declared value revalidates the same exact optional member");
  const read = value.resolver.instantiateMemberEvidence(declaration, owner, value.queries, owner);
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
  const owner = value.owner("required");
  assert.equal(value.resolver.instantiateMemberEvidence(value.declared(owner), value.actual("omitted"), value.queries, owner) === undefined,
    true, "a checked absent result cannot initialize a required native field");
});

test("missing, foreign, stale and mismatched member evidence cannot inherit optional absence", () => {
  const value = memberProvenanceFixture();
  const owner = value.owner("omitted");
  const selected = value.declared(owner)[0];
  const evidence = selected.sourceMemberEvidence[0];
  const { sourceMemberEvidence: _removed, ...missing } = selected;
  const controls = [
    ["missing evidence", missing],
    ["foreign declared owner", { ...selected, sourceMemberEvidence: [{ ...evidence, ownerType: value.owner("other") }] }],
    ["stale absence", { ...selected, sourceMemberEvidence: [{ ...evidence,
      correspondence: { kind: "absent", destination: evidence.correspondence.destination } }] }],
    ["mismatched present property", { ...selected, sourceMemberEvidence: [{ ...evidence,
      correspondence: { ...evidence.correspondence, source: { ...evidence.correspondence.source,
        property: { ...evidence.correspondence.source.property, symbol: {} } } } }] }],
  ];
  for (const [label, member] of controls) assert.equal(
    value.resolver.instantiateMemberEvidence([member], value.actual("omitted"), value.queries, owner) === undefined,
    true, `${label}: no native slot is published from missing or unrelated proof`);
});

test("canonical member merging retains separate owners without transferring an absence proof", () => {
  const value = memberProvenanceFixture();
  const firstOwner = value.owner("omitted");
  const secondOwner = value.owner("other");
  const firstType = value.actual("omitted");
  const secondType = value.actual("other");
  const first = value.resolver.instantiateMemberEvidence(value.declared(firstOwner), firstType, value.queries, firstOwner);
  const second = value.resolver.instantiateMemberEvidence(value.declared(secondOwner), secondType, value.queries, secondOwner);
  const merged = mergeCsharpObjectShapeSubjects({ targetType: structural, sourceType: firstType, members: first },
    { targetType: structural, sourceType: secondType, members: second });
  const evidence = merged.members[0].sourceMemberEvidence;
  assert.equal(evidence.length === 2 && evidence.includes(first[0].sourceMemberEvidence[0]) &&
    evidence.includes(second[0].sourceMemberEvidence[0]), true, "each checked source/declaration/member alternative remains intact");
  assert.equal(value.resolver.instantiateMemberEvidence(merged.members, secondType, value.queries, merged.sourceType)?.length === 1,
    true, "the exact second source selects only its own retained proof");
  assert.equal(value.resolver.instantiateMemberEvidence(merged.members, value.actual("fresh"), value.queries, merged.sourceType) === undefined,
    true, "another empty source cannot inherit absence merely because its physical shape key matches");
});

test("ambiguous optional declaration owners never choose a first matching proof", () => {
  const value = memberProvenanceFixture();
  const firstOwner = value.owner("omitted");
  const secondOwner = value.owner("other");
  const actual = value.actual("omitted");
  const first = value.resolver.instantiateMemberEvidence(value.declared(firstOwner), actual, value.queries, firstOwner);
  const second = value.resolver.instantiateMemberEvidence(value.declared(secondOwner), actual, value.queries, secondOwner);
  const merged = mergeCsharpObjectShapeSubjects({ targetType: structural, sourceType: actual, members: first },
    { targetType: structural, sourceType: actual, members: second });
  assert.equal(value.resolver.instantiateMemberEvidence(merged.members, actual, value.queries, actual) === undefined,
    true, "different checked owners associated with the same source are ambiguous, not a success fallback");
});
