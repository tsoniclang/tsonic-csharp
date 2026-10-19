import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { CsharpProviderAcquisitionRejection, assertCsharpProviderLookupPurpose,
  csharpProviderBindingFromResolution } from "../../dist/providers/model/relation-resolver.js";
import { createCsharpProviderRelationResolver } from "../../dist/providers/native/projection/relation-resolution.js";
import { csharpReferenceIdentityCarrier } from "../../dist/policy/operations/operators/reference-equality.js";
import { validateBinaryTargetSemantics } from "../../dist/policy/operations/operators/operator-validation.js";
import { isCsharpThrowableType } from "../../dist/policy/types/resolution/target-hierarchy.js";
import { resolveSourceProfileType } from "../../dist/policy/types/resolution/source-profiles.js";
import { validateCsharpProviderConstraints } from "../../dist/policy/operations/members/instantiation/constraint-satisfaction.js";
import { selectCsharpNativeMemoryLayout } from "../../dist/policy/operations/pointers/native-memory.js";
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
  return { providers: { findTargetBindingByTargetId: reject, findTargetBindingByMetadataName: reject }, reads: () => reads };
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
  }, { kind: "value", call: {}, sourceType: {}, fields: [], byteSize: 4, byteAlignment: 4, stride: 4,
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
        selectedType, typeArguments: [], selectedTypeArguments: [] }] }) },
      types: { resolveSelectedType: () => carrier },
    }, { issues: [], definitions: [definition], definitionForDeclaration: () => definition,
      definitionForTarget: () => undefined });
  }],
];

for (const [name, invoke] of policyFamilies) {
  test(`${name} cannot turn an expected native acquisition rejection into false or absence`, () => {
    const state = rejectingProviders();
    const host = { providers: state.providers, projectTypes: { directSupertypes: () => [] } };
    assert.throws(() => invoke(host), error => error instanceof CsharpProviderAcquisitionRejection && error.diagnostic === diagnostic,
      "the one adapter carries the exact original diagnostic");
    assert.equal(state.reads(), 1, "the rejecting query is evaluated once without fallback");
  });
}

test("an interrupted native type computation publishes no poisoned kind in a fresh analysis", () => {
  const interrupted = createCsharpTypeDefinitionRegistry(() => csharpProviderBindingFromResolution(rejected));
  assert.throws(() => interrupted.nativeDeclarationKind(carrier), CsharpProviderAcquisitionRejection);
  const fresh = createCsharpTypeDefinitionRegistry(() => csharpProviderBindingFromResolution({ kind: "resolved", binding }));
  assert.equal(fresh.nativeDeclarationKind(carrier), "class", "a fresh analysis sees the actual native result");
  assert.equal(fresh.nativeDeclarationKind(carrier), "class", "only the completed native kind is memoized");
});

const recordSource = "export function read(values: Record<string, number>): number { return values.answer; }";

test("the pre-seal analysis boundary preserves acquisition rejection and publishes no program, plan or artifacts", () => {
  let reads = 0;
  const compiled = compileCsharpSource({ sourceText: recordSource, compileTarget(request, observer) {
    return compileCsharpTarget({ ...request, providers: { ...request.providers,
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

test("the expected acquisition abort has one constructor, one throw owner and one pre-seal translator", () => {
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
  const adapter = resolve(root, "src/providers/model/relation-resolver.ts");
  const boundary = resolve(root, "src/analysis/program/analyze.ts");
  assert.equal(declarations.length === 1 && declarations[0] === adapter, true, "one expected error type owner");
  assert.equal(constructions.length === 1 && constructions[0] === adapter, true, "only the native lookup adapter constructs the abort");
  assert.equal(translators.length === 1 && translators[0] === boundary, true, "only the pre-seal entry translates the abort");
  const source = readFileSync(boundary, "utf8");
  assert.equal((source.match(/catch\s*\(/gu) ?? []).length, 1, "one expected-error catch in the analysis entry");
  assert.equal(/if\s*\(error instanceof CsharpProviderAcquisitionRejection\)[\s\S]*rejectedTargetStage\([\s\S]*error\.diagnostic/u.test(source), true,
    "the sole translator returns the original acquisition diagnostic");
  assert.equal(/throw error;/u.test(source), true, "all other errors escape unchanged");
  for (const file of ["analysis/project-types/type-definitions.ts", "analysis/project-types/analyze.ts", "analysis/conversions/validation.ts",
    "analysis/objects/native-construction-demand.ts", "analysis/objects/value-domain-carriers.ts"]) {
    const content = readFileSync(resolve(root, "src", file), "utf8");
    assert.equal(/catch\s*\(error\)[\s\S]*throw error;/u.test(content), true, `${file}: the existing narrow catch preserves unrelated errors`);
    assert.equal(/instanceof CsharpProviderAcquisitionRejection/u.test(content), false, `${file}: no second acquisition translator`);
  }
});
