import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { assertCsharpProviderLookupPurpose,
  csharpProviderBindingFromResolution } from "../../dist/providers/model/relation-resolver.js";
import { createCsharpProviderRelationResolver } from "../../dist/providers/native/projection/relation-resolution.js";
import { csharpReferenceIdentityCarrier } from "../../dist/policy/operations/operators/reference-equality.js";
import { validateBinaryTargetSemantics } from "../../dist/policy/operations/operators/operator-validation.js";
import { isCsharpThrowableType } from "../../dist/analysis/project-types/throwable-types.js";
import { resolveSourceProfileType } from "../../dist/analysis/source-evidence/types/resolution/source-profiles.js";
import { validateCsharpProviderConstraints } from "../../dist/analysis/operations/members/calls/constraint-satisfaction.js";
import { selectCsharpNativeMemoryLayout } from "../../dist/analysis/operations/pointers/native-memory.js";
import { createCsharpTypeDefinitionRegistry } from "../../dist/analysis/project-types/type-definitions.js";
import { analyzeCsharpProjectTypePolicy } from "../../dist/analysis/project-types/catalog/resolution.js";
import { compileCsharpTarget } from "../../dist/backend/compile.js";
import { compileCsharpSource, assertCsharpCheckingSucceeded, assertCsharpCompilationSucceeded } from "../helpers/direct-csharp-session.mjs";

const root = resolve(new URL("../..", import.meta.url).pathname);
const diagnostic = Object.freeze({ extensionId: "fixture.native-acquisition", extensionCode: "FIXTURE_NATIVE_ACQUISITION_REJECTED",
  numericCode: 9200000, category: "error", identity: "fixture-native-rejection", message: "Original native acquisition refusal." });
const rejected = Object.freeze({ kind: "rejected", diagnostic });
const carrier = Object.freeze({ kind: "target-named", id: "Fixture.Native", csharpAllowsRefLikeTypeArguments: [] });
const binding = Object.freeze({ id: carrier.id, sourceName: "Native", targetName: "Fixture.Native", target: "csharp", kind: "class",
  csharpType: carrier });

function provider(id, result) {
  return { identity: { id, version: "1" }, validateReferences: () => undefined,
    findTargetBindingByTargetId: () => result, findTargetBindingByMetadataName: () => result };
}

test("query-local native resolution prefers coherent winners without retaining another provider's rejection", () => {
  let first = rejected;
  const loser = { ...provider("loser", rejected), findTargetBindingByTargetId: () => first };
  const winner = provider("winner", { kind: "resolved", binding });
  const resolver = createCsharpProviderRelationResolver({ providers: [loser, winner], providerPolicies: [] });
  assert.equal(resolver.findTargetBindingByTargetId(carrier.id, "ordinary").binding === binding, true,
    "the complete winner owns this exact query");
  const missing = createCsharpProviderRelationResolver({ providers: [loser], providerPolicies: [] });
  assert.equal(missing.findTargetBindingByTargetId(carrier.id, "ordinary").diagnostic === diagnostic, true,
    "a rejected lookup retains the original diagnostic object");
  first = { kind: "missing" };
  assert.equal(missing.findTargetBindingByTargetId("Fixture.Other", "ordinary").kind, "missing",
    "the earlier rejection never poisons a different query");
  assert.equal(missing.validateReferences().length, 0, "reference validation is not a global query-error flush");
});

test("query-local native resolution rejects contradictory complete winners rather than choosing the first", () => {
  const resolver = createCsharpProviderRelationResolver({ providers: [provider("first", { kind: "resolved", binding }),
    provider("second", { kind: "resolved", binding: { ...binding, kind: "struct" } })], providerPolicies: [] });
  for (const [method, query] of [["findTargetBindingByTargetId", carrier.id], ["findTargetBindingByMetadataName", binding.targetName]]) {
    const result = resolver[method](query, "ordinary");
    assert.equal(result.kind, "rejected", `${method}: contradictory complete evidence is refused`);
    assert.equal(result.diagnostic.extensionCode, "CSHARP_PROVIDER_TARGET_BINDING_CONFLICT", `${method}: native conflict owner`);
  }
});

test("the native lookup boundary rejects the deleted unqualified purpose and bare-binding result forms", () => {
  for (const value of [undefined, null, "", "speculative", {}])
    assert.throws(() => assertCsharpProviderLookupPurpose(value), TypeError, "no implicit lookup purpose");
  assert.doesNotThrow(() => assertCsharpProviderLookupPurpose("ordinary"));
  assert.doesNotThrow(() => assertCsharpProviderLookupPurpose("inheritance"));
  for (const value of [binding, undefined, { kind: "unknown" }])
    assert.throws(() => csharpProviderBindingFromResolution(value), TypeError, "no obsolete optional binding API");
  assert.equal(csharpProviderBindingFromResolution({ kind: "resolved", binding }) === binding, true, "exact binding identity retained");
  assert.equal(csharpProviderBindingFromResolution({ kind: "missing" }) === undefined, true, "an actual nonmatch remains absent");
});

function rejectingProviders() {
  let reads = 0;
  const reject = (_query, purpose) => {
    assert.equal(purpose, "ordinary", "policy queries cannot prepare a runtime assembly");
    reads += 1;
    return rejected;
  };
  return { providers: createCsharpProviderRelationResolver({
    providers: [{ identity: { id: "rejecting", version: "1" }, validateReferences: () => undefined,
      findTargetBindingByTargetId: reject, findTargetBindingByMetadataName: reject }], providerPolicies: [],
  }), reads: () => reads };
}

const policyFamilies = [
  ["reference identity", host => csharpReferenceIdentityCarrier(carrier, host)],
  ["operator admission", host => validateBinaryTargetSemantics("+", carrier, carrier, host)],
  ["throwable hierarchy", host => isCsharpThrowableType(host, carrier)],
  ["source-profile carrier", host => resolveSourceProfileType({ host }, { kind: "record" },
    [{ kind: "string" }, { kind: "source-primitive", name: "int32" }], undefined)],
  ["native generic constraints", host => validateCsharpProviderConstraints(host, {
    targetBinding: { id: "Fixture.Container", typeParameters: [] }, bindingArguments: [],
    targetMember: { id: "Fixture.Container.Member", typeParameters: [] }, methodArguments: [],
    invocationArguments: [{ targetType: carrier }], sourceFile: {},
  })],
  ["native memory layout", host => selectCsharpNativeMemoryLayout({ ...host,
    ast: { getSourceFile: () => undefined }, types: { resolveSelectedType: () => carrier },
    semantics: () => ({ types: { propertyInfos: () => [] } }),
    projectTypes: { catalog: { definitionForTarget: () => undefined } },
  }, { kind: "value", call: {}, sourceType: {}, fields: [], byteSize: 4n, byteAlignment: 4n, stride: 4n,
    dataLayout: { addressWidth: 64, byteOrder: "little" } }, {})],
  ["project heritage kind", host => {
    const declaration = Object.freeze({});
    const heritage = Object.freeze({});
    const selectedType = Object.freeze({});
    const definition = { id: "project:Derived", sourceName: "Derived", kind: "class", declaration,
      sourceFile: {}, typeParameterBindings: [] };
    return analyzeCsharpProjectTypePolicy({ ...host, ast: {},
      semanticsFor: () => ({ declarations: { typeAliasSymbol: () => undefined, typeSymbol: () => undefined },
        types: { isTypeReference: () => false } }),
      navigation: { declaredHeritage: () => ({ kind: "resolved", edges: [{ kind: "extends", heritage,
        selectedType, typeArguments: [], selectedTypeArguments: [] }] }),
        classConstructors: () => ({ kind: "resolved", implicit: false }) },
      types: { resolveSelectedType: () => carrier },
    }, { issues: [], definitions: [definition], definitionForDeclaration: () => definition,
      definitionForTarget: () => undefined });
  }],
];

for (const [name, invoke] of policyFamilies) {
  test(`${name} cannot turn an expected native acquisition rejection into false or absence`, () => {
    const state = rejectingProviders();
    const host = { providers: state.providers, projectTypes: { directSupertypes: () => [] } };
    invoke(host);
    assert.equal(state.providers.failures().length, 1, "the owning provider retains one expected refusal");
    assert.equal(state.providers.failures()[0] === diagnostic, true, "the exact original diagnostic is value data");
    assert.equal(state.reads(), 1, "the rejecting query is evaluated once without fallback");
  });
}

test("an interrupted native type computation publishes no poisoned kind in a fresh analysis", () => {
  const state = rejectingProviders();
  const interrupted = createCsharpTypeDefinitionRegistry(id =>
    csharpProviderBindingFromResolution(state.providers.findTargetBindingByTargetId(id, "ordinary")));
  assert.equal(interrupted.nativeDeclarationKind(carrier), undefined, "a rejected lookup publishes no native kind");
  assert.equal(state.providers.failures()[0] === diagnostic, true, "the refusal survives independently of the absent kind");
  const fresh = createCsharpTypeDefinitionRegistry(() => csharpProviderBindingFromResolution({ kind: "resolved", binding }));
  assert.equal(fresh.nativeDeclarationKind(carrier), "class", "a fresh analysis sees the actual native result");
  assert.equal(fresh.nativeDeclarationKind(carrier), "class", "only the completed native kind is memoized");
});

const recordSource = "export function read(values: Record<string, number>): number { return values.answer; }";

test("the pre-seal analysis boundary preserves acquisition rejection and publishes no program, plan or artifacts", () => {
  let reads = 0;
  const compiled = compileCsharpSource({ sourceText: recordSource, compileTarget(request, observer) {
    return compileCsharpTarget({ ...request, providers: { ...request.providers,
      failures: () => reads === 0 ? [] : [diagnostic],
      findTargetBindingByMetadataName(_name, purpose) {
        assert.equal(purpose, "ordinary", "the rejected carrier query is not runtime preparation");
        reads += 1;
        return rejected;
      },
    } }, observer);
  } });
  assertCsharpCheckingSucceeded(compiled);
  assert.equal(reads > 0, true, "the actual policy pipeline reached the rejected native query");
  assert.equal(compiled.result.diagnostics.length, 1, "one original acquisition diagnostic");
  assert.equal(compiled.result.diagnostics[0].message, diagnostic.message, "no generic wrapper diagnostic");
  assert.equal(compiled.result.diagnostics[0].source, diagnostic.extensionId, "original diagnostic owner preserved");
  assert.equal(compiled.result.diagnostics[0].code, `TS${diagnostic.numericCode}`, "the public diagnostic mapping is unchanged");
  assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined, true, "no rejected stage is published");
  assert.equal(compiled.artifacts.size, 0, "planning and emission never continue");
  const fresh = compileCsharpSource({ sourceText: recordSource });
  assertCsharpCompilationSucceeded(fresh);
  assert.equal(fresh.artifacts.size > 0, true, "a fresh analysis is not poisoned by the rejected predecessor");
});

test("unrelated exceptions keep their exact identity at the analysis boundary", () => {
  const original = new Error("Unrelated native policy implementation failure.");
  assert.throws(() => compileCsharpSource({ sourceText: recordSource, compileTarget(request, observer) {
    return compileCsharpTarget({ ...request, providers: { ...request.providers,
      findTargetBindingByMetadataName() { throw original; },
    } }, observer);
  } }), error => error === original, "only the named expected acquisition rejection is translated");
});

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : entry.name.endsWith(".ts") ? [path] : [];
  });
}

test("expected acquisition failures are values rejected by the sole pre-seal analysis owner", () => {
  const files = sourceFiles(resolve(root, "src"));
  const declarations = [];
  const constructions = [];
  const translators = [];
  for (const path of files) {
    const source = readFileSync(path, "utf8");
    if (/class CsharpProviderAcquisitionRejection\b/u.test(source)) declarations.push(path);
    if (/new CsharpProviderAcquisitionRejection\(/u.test(source)) constructions.push(path);
    if (/instanceof CsharpProviderAcquisitionRejection\b/u.test(source)) translators.push(path);
  }
  const boundary = resolve(root, "src/analysis/program/analyze.ts");
  assert.equal(declarations.length, 0, "the expected error class is removed");
  assert.equal(constructions.length, 0, "no expected refusal is thrown");
  assert.equal(translators.length, 0, "no layer catches an expected refusal");
  const source = readFileSync(boundary, "utf8");
  assert.equal((source.match(/catch\s*\(/gu) ?? []).length, 0, "unrelated exceptions escape without interception");
  assert.match(source, /const failures = request\.providers\.failures\(\);/u);
  assert.match(source, /failures\.map\(diagnostic => targetDiagnosticFromExtension\(undefined, diagnostic\)\)/u);
  const resolver = readFileSync(resolve(root, "src/providers/native/projection/relation-resolution.ts"), "utf8");
  assert.match(resolver, /failures\.set\(canonicalProviderValue\(diagnostic\), diagnostic\)/u);
});
