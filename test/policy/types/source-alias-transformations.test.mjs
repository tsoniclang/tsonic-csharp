import assert from "node:assert/strict";
import test from "node:test";
import { createTsonicPlugin as nodejsCapability } from "../../../../csharp-nodejs/dist/index.js";
import { assertCsharpCompilationSucceeded, compileCsharpSource, analyzeCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { resolveTypeReferenceNode } from "../../../dist/analysis/source-evidence/types/resolution/source-references.js";
import { resolveCsharpProviderIndexedAccess } from "../../../dist/analysis/source-evidence/types/resolution/indexed-access.js";
import { getCsharpNullableElementTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { createCsharpSourceUnionDefinitions } from "../../../dist/analysis/source-evidence/types/resolution/union-definitions.js";
import { csharpAbsenceTargetType, getCsharpRuntimeUnionArms } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpExceptionTargetType, csharpRuntimeErrorTargetType, csharpSourcePrimitiveTargetType, csharpStringTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { createSourceErrorProviderFixture } from "../../fixtures/dotnet-provider/source-error-bindings.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("source union representation absorbs only an existing unambiguous native reference arm", () => {
  const exception = csharpExceptionTargetType();
  const error = csharpRuntimeErrorTargetType();
  const string = csharpStringTargetType();
  const integer = csharpSourcePrimitiveTargetType("int32");
  const foreign = { ...exception, id: "ForeignOwner::Exception" };
  const interfaceA = { ...exception, id: "NativeOwner::A" };
  const interfaceB = { ...exception, id: "NativeOwner::B" };
  const ambiguous = { ...exception, id: "NativeOwner::Both" };
  const definitions = createCsharpSourceUnionDefinitions({
    providers: createSourceErrorProviderFixture(),
    projectTypes: () => ({ directSupertypes: source => source === ambiguous ? [interfaceA, interfaceB] : [] }),
    objectShapes: { resolveTarget: () => undefined },
    structuralTypes: { resolveTarget: () => undefined },
  }, () => assert.fail("a direct union must not reconstruct any original source type"));
  const queries = { types: { aliasApplication: () => undefined } };
  const select = members => definitions.resolve({}, queries, { depth: 0 }, () => members);
  for (const members of [[error, exception], [exception, error]]) {
    const carrier = select(members);
    assert.equal(carrier === exception, true, "the original selected base reference, not an invented common ancestor");
    assert.equal(definitions.physicalArm(error, carrier) === exception, true, "the narrower source carrier maps to its real native base");
    assert.equal(definitions.physicalArm(exception, carrier) === exception, true, "the native base arm retains its own identity");
    const optional = select([...members, csharpAbsenceTargetType()]);
    assert.equal(getCsharpNullableElementTargetType(optional) === exception, true, "one native absence is preserved");
    const distinct = select([...members, string]);
    const arms = getCsharpRuntimeUnionArms(distinct);
    assert.equal(arms?.length === 2 && arms.includes(exception) && arms.includes(string), true,
      "an unrelated string arm remains physically distinct");
  }
  for (const [label, members] of [
    ["foreign native owner", [error, foreign]],
    ["value carrier", [integer, exception]],
    ["tuple carrier", [{ kind: "tuple", elements: [integer] }, exception]],
    ["unrelated native interfaces", [interfaceA, interfaceB]],
    ["ambiguous native bases", [ambiguous, interfaceA, interfaceB]],
  ]) {
    const arms = getCsharpRuntimeUnionArms(select(members));
    assert.equal(arms?.length === members.length && members.every(member =>
      arms.some(arm => targetTypeRefEquals(arm, member))), true, `${label}: no unproved absorption or third common ancestor`);
  }
  assert.equal(definitions.physicalArm(foreign, exception) === undefined, true, "a foreign native identity cannot acquire a base relation");
  assert.equal(definitions.physicalArm(integer, exception) === undefined, true, "numeric carriers do not become reference arms");
});

test("native provider error unions preserve the same reference in both orders and with absence", () => {
  const compiled = compileCsharpSource({ surface: "js", capabilities: [nodejsCapability()], sourceText: `
    import type { TransportError } from "./contracts.js";
    export function first(value: Error | TransportError): Error | TransportError { return value; }
    export function second(value: TransportError | Error): TransportError | Error { return value; }
    export function optional(value: Error | TransportError | null | undefined): Error | TransportError | null | undefined { return value; }
  `, files: { "contracts.ts": `
    import type { Readable } from "node:stream";
    export type TransportError = NonNullable<Parameters<Readable["destroy"]>[0]>;
  ` } });
  assertCsharpCompilationSucceeded(compiled);
  const generated = [...compiled.artifacts.values()].join("\n");
  assert.match(generated, /(?:System\.)?Exception first\((?:System\.)?Exception value\)/u);
  assert.match(generated, /(?:System\.)?Exception second\((?:System\.)?Exception value\)/u);
  assert.doesNotMatch(generated, /Union<|TsValue|DynamicInvoke|System\.Reflection/u,
    "the selected native reference does not require a union wrapper, box or dynamic adapter");
  executeCsharpConstruction(compiled, "native-error-reference-union", false, false, [], `
using System;
using Generated = Tsonic.Generated.Index;
Exception immutable = new InvalidOperationException("native");
var writable = new Tsonic.CSharp.Runtime.Error("source");
for (var index = 0; index < 1000; index++) {
    if (!ReferenceEquals(Generated.first(immutable), immutable) || !ReferenceEquals(Generated.second(writable), writable) ||
        !ReferenceEquals(Generated.optional(writable), writable) || Generated.optional(null) is not null)
        throw new Exception("native reference identity");
}
var before = GC.GetAllocatedBytesForCurrentThread();
for (var index = 0; index < 10000; index++) {
    if (!ReferenceEquals(Generated.first(immutable), immutable) || !ReferenceEquals(Generated.second(writable), writable) ||
        !ReferenceEquals(Generated.optional(writable), writable) || Generated.optional(null) is not null)
        throw new Exception("native reference or absence identity");
}
if (GC.GetAllocatedBytesForCurrentThread() != before) throw new Exception("native reference union allocation");
`);
});

test("checked native tuple indexes retain exact slots and reject foreign or malformed correspondence", () => {
  const { source, analysis } = analyzeCsharpSource({ surface: "js", capabilities: [nodejsCapability()], sourceText: `
    import type { Readable } from "node:stream";
    type Arguments = Parameters<Readable["destroy"]>;
    type Selected = Arguments[0];
    type One = 1;
    type Unbounded = number;
    export function preserve(value: Arguments): Arguments { return value; }
  ` });
  assert.equal(analysis.kind, "resolved", "the source publishes its real checked native tuple");
  const aliases = source.navigation.nodes.filter(node => source.ast.is.IsTypeAliasDeclaration(node));
  const alias = name => aliases.find(node => source.ast.text(source.ast.name(node)) === name);
  const node = source.ast.typeNode(alias("Selected"));
  const owner = source.ast.as.AsIndexedAccessTypeNode(node).ObjectType;
  const queries = source.semantics.forNode(node);
  const tuple = analysis.value.records.nodeTargetType.get(owner);
  assert.equal(tuple?.kind, "tuple", "the exact owner is a finite native tuple");
  assert.equal(tuple.elements.length, 1, "the original source signature has one native scalar slot");
  const element = tuple.elements[0];
  const present = getCsharpNullableElementTargetType(element);
  assert.equal(present?.kind === "target-named" && present.id.endsWith("::System.Exception"), true,
    "native provider identity and its one absence state precede indexing");
  const syntax = source.ast.as.AsIndexedAccessTypeNode(node);
  const ownerType = queries.types.authoredType(owner);
  const indexType = queries.types.authoredType(syntax.IndexType);
  const checked = queries.types.selectIndexedAccess(ownerType, indexType);
  assert.equal(checked?.kind === "resolved" && checked.members.length === 1, true, "one original checked property slot");
  const scope = { host: { ast: source.ast }, resolveNodeWithState(actual, file) {
    assert.equal(actual === owner && file === queries.sourceFile, true, "the same authored owner and file reach native resolution");
    return tuple;
  } };
  assert.equal(resolveCsharpProviderIndexedAccess(scope, node, queries, { depth: 0 }) === element, true,
    "indexing returns the identical native element, without a source-Error reconstruction or absence copy");
  const selected = checked.members[0];
  const one = queries.types.authoredType(source.ast.typeNode(alias("One")));
  const unbounded = queries.types.authoredType(source.ast.typeNode(alias("Unbounded")));
  const foreign = source.navigation.declarationSymbol(alias("One"), queries.sourceFile);
  assert.equal(one !== undefined && unbounded !== undefined && foreign !== undefined, true,
    "negative controls use actual checked out-of-range/unbounded types and a distinct declaration symbol");
  for (const [label, member] of [
    ["foreign property", { ...selected, property: { ...selected.property, symbol: foreign } }],
    ["out of range", { ...selected, indexType: one, property: { ...selected.property, name: "1" } }],
    ["unbounded index", { ...selected, indexType: unbounded }],
    ["wrong read component", { ...selected, readType: one }],
    ["wrong optional slot", { ...selected, property: { ...selected.property, optional: !selected.property.optional } }],
  ]) {
    const altered = { ...queries, types: { ...queries.types,
      selectIndexedAccess: () => ({ ...checked, members: [member] }) } };
    const rejected = resolveCsharpProviderIndexedAccess(scope, node, altered, { depth: 0 });
    assert.equal(rejected?.kind === "opaque" && rejected.id === "native-tuple-index-evidence-unavailable", true,
      `${label}: required native correspondence cannot fall through to a different source carrier`);
  }
  const truncated = { ...scope, resolveNodeWithState: () => ({ ...tuple, elements: [] }) };
  assert.equal(resolveCsharpProviderIndexedAccess(truncated, node, queries, { depth: 0 })?.kind, "opaque",
    "a missing native element is not fabricated or silently truncated");
});

test("checked component transformations do not require native carriers for discarded inputs", () => {
  const node = {};
  const name = {};
  const selectedType = {};
  const sourceFile = {};
  const component = { selectedType: {} };
  const carrier = { kind: "source-primitive", name: "int64" };
  for (const kind of ["component", "non-nullish", "parameter-list", "callable", "unresolved"]) {
    const transformation = { kind, component };
    const queries = {
      sourceFile,
      types: { authoredType: () => selectedType, standardTransformation: () => transformation },
      facts: { typeSubjects: () => [] },
    };
    let selections = 0;
    const result = resolveTypeReferenceNode({
      host: {
        ast: { as: { AsTypeReferenceNode: () => ({ TypeName: name }) },
          typeArguments: () => assert.fail("a checked projection must not resolve its discarded input carrier") },
        navigation: { sourceReferenceFor: () => undefined },
      },
      resolveDirectSourceFacts: () => undefined,
      resolveStandardSourceTypeTransformation: (actual, actualQueries, state, root, selected) => {
        selections += 1;
        assert.equal(actual === transformation, true, kind);
        assert.equal(actualQueries === queries, true, kind);
        assert.equal(root === node && selected === selectedType, true, kind);
        assert.equal(state.depth, 0, kind);
        return kind === "unresolved" ? undefined : carrier;
      },
    }, node, queries, { depth: 0 });
    assert.equal(result === (kind === "unresolved" ? undefined : carrier), true, kind);
    assert.equal(selections, 1, kind);
  }
});

test("provider-derived error aliases retain exact native components through unions and delegates", () => {
  const compiled = compileCsharpSource({
    surface: "js",
    capabilities: [nodejsCapability()],
    sourceText: `
      import type {
        TransportError, RequestFailure, NextControl, NextFunction,
        CloseCallback, ExactCallback, ExactArguments, ExactResult,
      } from "./contracts.js";
      export function transport(value: TransportError): TransportError { return value; }
      export function failure(value: RequestFailure): RequestFailure { return value; }
      export function control(value: NextControl): NextControl { return value; }
      export function next(value: NextFunction): NextFunction { return value; }
      export function close(value: CloseCallback): CloseCallback { return value; }
      export function exact(value: ExactCallback, arguments_: ExactArguments): ExactResult {
        return value(arguments_[0], arguments_[1]);
      }
    `,
    files: {
      "contracts.ts": `
        import type { Readable } from "node:stream";
        import type { int64 } from "@tsonic/core/types.js";
        export type TransportError = NonNullable<Parameters<Readable["destroy"]>[0]>;
        export type RequestFailure = Error | TransportError;
        export type NextControl = string | RequestFailure | null | undefined;
        export type NextFunction = (value?: NextControl) => void | Promise<void>;
        export type CloseCallback = (error?: RequestFailure) => void;
        export type ExactCallback = (value: int64, error?: TransportError) => int64;
        export type ExactArguments = Parameters<ExactCallback>;
        export type ExactResult = ReturnType<ExactCallback>;
      `,
    },
  });
  assertCsharpCompilationSucceeded(compiled);
  const generated = [...compiled.artifacts.values()].join("\n");
  assert.match(generated, /(?:System\.)?Exception transport\((?:System\.)?Exception value\)/u);
  assert.match(generated, /long exact\(/u);
  assert.doesNotMatch(generated, /source-alias-representation-unavailable|source-fact-dependent-type-transform|Convert\.ToDouble|DynamicInvoke|System\.Reflection/u);
});

test("provider method parameter projections survive an indirect tuple alias", () => {
  const compiled = compileCsharpSource({
    surface: "js",
    capabilities: [nodejsCapability()],
    sourceText: `
      import type { Readable } from "node:stream";
      type DestroyArguments = Parameters<Readable["destroy"]>;
      type TransportError = NonNullable<DestroyArguments[0]>;
      export function preserve(value: DestroyArguments): DestroyArguments { return value; }
      export function forward(value: TransportError): TransportError { return value; }
    `,
  });
  assertCsharpCompilationSucceeded(compiled);
  const generated = [...compiled.artifacts.values()].join("\n");
  assert.match(generated, /(?:System\.)?Exception forward\((?:System\.)?Exception value\)/u);
  assert.match(generated, /ValueTuple<(?:System\.)?Exception\?>/u);
});

test("provider-derived error union carriers do not depend on prior scalar alias resolution", () => {
  const declarations = {
    handlers: "export function handlers(values: Handler[]): Handler[] { return values; }",
    control: "export function control(value: NextControl): NextControl { return value; }",
    failure: "export function failure(value: RequestFailure): RequestFailure { return value; }",
    transport: "export function transport(value: TransportError): TransportError { return value; }",
  };
  for (const first of Object.keys(declarations)) {
    const order = [first, ...Object.keys(declarations).filter(name => name !== first)];
    const compiled = compileCsharpSource({
      surface: "js",
      capabilities: [nodejsCapability()],
      sourceText: `
        import type { Handler, NextControl, RequestFailure, TransportError } from "./contracts.js";
        ${order.map(name => declarations[name]).join("\n")}
      `,
      files: {
        "contracts.ts": `
          import type { Readable } from "node:stream";
          export type TransportError = NonNullable<Parameters<Readable["destroy"]>[0]>;
          export type RequestFailure = Error | TransportError;
          export type NextControl = string | RequestFailure | null | undefined;
          export type NextFunction = (value?: NextControl) => void | Promise<void>;
          export interface Handler { (next: NextFunction): void; }
        `,
      },
    });
    assertCsharpCompilationSucceeded(compiled);
    const generated = [...compiled.artifacts.values()].join("\n");
    assert.match(generated, /(?:System\.)?Exception failure\((?:System\.)?Exception value\)/u, first);
    assert.doesNotMatch(generated, /source-alias-representation-unavailable|source-fact-dependent-type-transform|DynamicInvoke|System\.Reflection/u, first);
  }
});
