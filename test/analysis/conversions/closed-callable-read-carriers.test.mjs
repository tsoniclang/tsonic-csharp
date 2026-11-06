import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpAnalysisTarget, compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { resolveNodeValueWithState } from "../../../dist/analysis/source-evidence/types/resolution/nodes.js";
import { getCsharpCallableValueSignature } from "../../../dist/target-model/types/carriers/delegates.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { csharpStringTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";

const sourceText = `
  import type { int32 } from "@tsonic/core/types.js";
  export function foreign(value: int32): int32 { return value; }
  export function run(values: int32[]): int32[] {
    const mapper = (value: int32): int32 => value + 1;
    const alias = mapper;
    return values.map(alias);
  }
`;

let original;
function fixture() {
  if (original !== undefined) return original;
  let analysis;
  const compiled = compileCsharpSource({ surface: "js", sourceText,
    compileTarget(request, observer) {
      return compileCsharpAnalysisTarget(request, { ...observer, analyzed(program) {
        analysis = program;
        observer.analyzed(program);
      } });
    } });
  assertCsharpCompilationSucceeded(compiled);
  assert.equal(analysis !== undefined, true, "the real original compilation publishes its Native records");
  const source = analysis.source;
  const ast = source.ast;
  const file = source.navigation.sourceFiles.find(value => ast.getFileName(value) === "/project/index.ts");
  const nodes = [];
  const visit = node => {
    nodes.push(node);
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(file);
  const alias = nodes.find(node => ast.is.IsIdentifier(node) && ast.text(node) === "alias" && ast.is.IsCallExpression(ast.parent(node)));
  const declaration = source.navigation.sourceReferenceFor(alias)?.declaration;
  const mapper = nodes.find(node => ast.is.IsVariableDeclaration(node) && ast.text(ast.name(node)) === "mapper");
  const arrow = ast.as.AsVariableDeclaration(mapper)?.Initializer;
  const foreign = nodes.find(node => ast.is.IsFunctionDeclaration(node) && ast.text(ast.name(node)) === "foreign");
  const contract = analysis.records.callableDeclaration.get(arrow)?.contract;
  const foreignContract = analysis.records.callableDeclaration.get(foreign)?.contract;
  assert.equal(alias !== undefined && declaration !== undefined && contract !== undefined && foreignContract !== undefined, true,
    "all proof subjects are original compiler nodes and selected Native declaration contracts");
  const storage = analysis.records.storageType.get(alias);
  original = { compiled, analysis, source, file, alias, declaration, arrow, contract, foreignContract, storage };
  return original;
}

function selectedRead(value, changes = {}) {
  const { source, alias, declaration, contract, storage, file } = value;
  const node = changes.node ?? alias;
  const outcome = Object.hasOwn(changes, "outcome") ? changes.outcome : source.effectiveTypes.get(node);
  const principal = Object.hasOwn(changes, "principal") ? changes.principal : source.effectiveTypes.get(declaration);
  const selected = Object.hasOwn(changes, "selected") ? changes.selected : storage;
  const principalSelected = Object.hasOwn(changes, "principalSelected") ? changes.principalSelected : storage;
  const selectedContract = Object.hasOwn(changes, "contract") ? changes.contract : contract;
  const owner = Object.hasOwn(changes, "owner") ? changes.owner : selectedContract;
  const forbidden = () => assert.fail("a published callable never retries checked Source inference or shape selection");
  const rejections = [];
  let physicalReads = 0;
  const host = { ast: source.ast, target: value.compiled.target, navigation: source.navigation,
    effectiveTypes: { get(subject) {
      return subject === node ? outcome : subject === declaration ? principal : source.effectiveTypes.get(subject);
    } }, typeParameterConstraints: {}, semantics: forbidden, semanticsFor: forbidden,
    representations: {
      scopedTargetType(subject) {
        physicalReads += 1;
        return subject === node ? selected : subject === declaration ? principalSelected : undefined;
      },
      closedInputContract(subject) {
        return subject === node || subject === declaration ? selectedContract
          : subject === selectedContract?.sourceDeclaration ? owner : undefined;
      },
    },
  };
  const result = resolveNodeValueWithState({ host }, node, file, { depth: 0,
    rejectNativeResolution: rejection => rejections.push(rejection) });
  return { result, outcome, rejections, physicalReads };
}

test("an unchanged real alias read retains its one selected Native callback ABI without a projection", () => {
  const value = fixture();
  const outcome = value.source.effectiveTypes.get(value.alias);
  const principal = value.source.effectiveTypes.get(value.declaration);
  assert.equal(outcome?.kind === "resolved" && principal?.kind === "resolved" &&
    outcome.type.kind === "callable" && principal.type.kind === "callable", true);
  assert.equal(outcome.type.calls[0].parameters.length, 1, "Source logical arity stays authored");
  assert.equal(principal.type.calls[0].parameters.length, 1, "the same declaration keeps its logical signature");
  assert.equal(getCsharpCallableValueSignature(value.storage)?.parameters.length, 3, "the selected native input is the existing callback ABI");
  const { result } = selectedRead(value);
  assert.equal(result.selectedType === value.storage && result.nativeType === value.storage, true,
    "the earliest Native producer retains the existing selected carrier");
  assert.equal(result.effectiveType === outcome, true, "the exact Host publication is retained unchanged");
  const selectedPrincipal = selectedRead(value, { node: value.declaration });
  assert.equal(selectedPrincipal.result.selectedType === value.storage, true, "the same principal supplies read storage");
  for (const carrier of [value.analysis.records.nodeTargetType.get(value.alias),
    value.analysis.records.readStorageTargetType.get(value.alias)]) {
    assert.equal(getCsharpCallableValueSignature(carrier)?.parameters.length, 3,
      "both original early read producers retain the selected ABI before expected-use demands");
  }
  const read = value.analysis.records.valueRead.get(value.alias);
  for (const carrier of [read.value, read.narrowedRead, read.flowReadValue]) {
    assert.equal(targetTypeRefEquals(carrier, value.storage), true,
      "the finalized read preserves that canonical carrier across analysis iterations");
  }
  assert.equal(value.analysis.records.flowReadProjection.get(value.alias)?.kind, "identity", "the genuine complete analysis uses the same identity read");
  assert.doesNotMatch(value.compiled.artifacts.get("src/Index.cs"), /new Func|__tsonic_callable_|__tsonic_adapter_/u,
    "closed alias reads do not introduce outlined adapters or fresh delegates");
});

for (const [label, change] of [
  ["missing selected ABI", value => ({ selected: undefined })],
  ["missing principal ABI", value => ({ principalSelected: undefined })],
  ["missing closed contract", value => ({ contract: undefined })],
  ["foreign same-width declaration", value => ({ contract: value.foreignContract })],
  ["copied contract record", value => ({ contract: { ...value.contract }, owner: value.contract })],
  ["mismatched selected ABI", value => ({ selected: csharpDelegateTargetType("System.Func", [csharpStringTargetType()], csharpStringTargetType()) })],
  ["mismatched ABI parameter contract", value => {
    const selected = csharpDelegateTargetType("System.Func", [csharpStringTargetType()], csharpStringTargetType());
    return { selected, principalSelected: selected };
  }],
  ["mismatched contract result", value => {
    const contract = { ...value.contract, returnType: csharpStringTargetType() };
    return { contract, owner: contract };
  }],
  ["missing principal publication", value => ({ principal: undefined })],
  ["non-exact Source read", value => {
    const principal = value.source.effectiveTypes.get(value.declaration);
    return { principal: { ...principal, type: { kind: "optional", value: principal.type } } };
  }],
]) {
  test(`${label} cannot replace a real logical callable read with its storage ABI`, () => {
    const value = fixture();
    const { result, outcome } = selectedRead(value, change(value));
    assert.equal(result.effectiveType === outcome, true, "missing or foreign proof keeps the original Host publication");
    assert.equal(getCsharpCallableValueSignature(result.selectedType)?.parameters.length, 1, "the original logical read is not retargeted");
    assert.equal(targetTypeRefEquals(result.selectedType, value.storage), false, "a failed proof cannot promote arbitrary storage");
  });
}

for (const state of ["missing", "refused", "unavailable", "foreign"]) {
  test(`a ${state} Host publication cannot be bypassed by a selected Native callable`, () => {
    const value = fixture();
    const actual = value.source.effectiveTypes.get(value.alias);
    const outcome = state === "missing" ? undefined : state === "refused" ? {
      kind: "refused", source: "tsonic", code: "TSONIC_LOCAL_TYPE_CONFLICT", site: value.alias,
      reason: "The original Source group has conflicting declared fills.",
    } : state === "unavailable" ? { ...actual, type: { ...actual.type, calls: [] } }
      : { ...actual, provenance: { ...actual.provenance, occurrence: value.file } };
    if (state === "foreign") {
      assert.throws(() => selectedRead(value, { outcome }), error =>
        error.diagnostic?.code === "TSONIC_INTERNAL_ANALYSIS_INVARIANT" && error.diagnostic.sourceNode === value.alias);
      return;
    }
    const selected = selectedRead(value, { outcome });
    assert.equal(selected.result === undefined, true, "Source absence, refusal or unrepresentability remains authoritative");
    assert.equal(selected.physicalReads, 0, "no Native storage retry precedes the actual Source outcome");
    assert.equal(selected.rejections.length, state === "refused" ? 1 : 0);
    if (state === "refused") assert.equal(selected.rejections[0].subject === value.alias &&
      selected.rejections[0].code === outcome.code && selected.rejections[0].reason === outcome.reason, true,
    "the original code, reason and node are preserved");
  });
}

test("an actual narrowed optional callable keeps its present read and nullable storage distinct", () => {
  let analysis;
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    import type { int32 } from "@tsonic/core/types.js";
    export function run(values: int32[], mapper: ((value: int32) => int32) | undefined): int32[] {
      if (mapper === undefined) return [];
      return values.map(mapper);
    }
  `, compileTarget(request, observer) {
    return compileCsharpAnalysisTarget(request, { ...observer, analyzed(program) {
      analysis = program;
      observer.analyzed(program);
    } });
  } });
  assertCsharpCompilationSucceeded(compiled);
  const source = analysis.source;
  const nodes = [];
  const visit = node => {
    if (source.ast.is.IsIdentifier(node) && source.ast.text(node) === "mapper" && source.ast.is.IsCallExpression(source.ast.parent(node))) nodes.push(node);
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of analysis.sourceFiles) visit(file);
  assert.equal(nodes.length, 1, "one actual narrowed callback argument");
  const node = nodes[0];
  const refinement = analysis.records.valueRefinement.get(node);
  const read = analysis.records.valueRead.get(node);
  assert.equal(refinement?.exact, false, "the present callable is not its declared optional principal");
  assert.equal(getCsharpCallableValueSignature(read.value)?.parameters.length, 1, "the present logical callable stays one-parameter");
  assert.equal(targetTypeRefEquals(read.flowReadStorage, read.flowReadValue), false, "real absence storage is not silently replaced");
  assert.equal(analysis.records.flowReadProjection.get(node)?.kind, "conversion", "the existing nullable projection remains required");
});

for (const [label, body, arity] of [
  ["retained unannotated aliases", `const alias = self; if (alias !== self) throw new Error("identity");`, 3],
  ["authored alias signature", `const alias: (value: int32) => int32 = self; if (alias !== self) throw new Error("identity");`, 1],
  ["escaping named callable", `escaped = self;`, 1],
]) {
  test(`${label} retain their exact declared or closed Native callable authority`, () => {
    let analysis;
    const compiled = compileCsharpSource({ surface: "js", sourceText: `
      import type { int32 } from "@tsonic/core/types.js";
      export let escaped: ((value: int32) => int32) | undefined;
      export function run(values: int32[]): int32[] {
        return values.map(function self(value: int32): int32 { ${body} return value + 1; });
      }
    `, compileTarget(request, observer) {
      return compileCsharpAnalysisTarget(request, { ...observer, analyzed(program) {
        analysis = program;
        observer.analyzed(program);
      } });
    } });
    assertCsharpCompilationSucceeded(compiled);
    const ast = analysis.source.ast;
    const reads = [];
    const visit = node => {
      if (ast.is.IsIdentifier(node) && ast.text(node) === "self" && analysis.records.valueRead.get(node) !== undefined &&
        !ast.is.IsFunctionExpression(ast.parent(node))) reads.push(node);
      ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    for (const file of analysis.sourceFiles) visit(file);
    assert.equal(reads.length > 0, true, "the actual named callable is read");
    for (const node of reads) {
      const published = analysis.source.effectiveTypes.get(node);
      assert.equal(published?.kind === "resolved" && published.type.kind === "callable" &&
        published.type.calls[0].parameters.length === 1, true, "Source never acquires synthetic callback parameters");
      assert.equal(getCsharpCallableValueSignature(analysis.records.valueRead.get(node).value)?.parameters.length, arity,
        "only the same closed, unannotated, nonescaping binding acquires its selected callback ABI");
    }
  });
}

test("a same-shaped foreign alias does not inherit another selected callback's Native ABI", () => {
  let analysis;
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    import type { int32 } from "@tsonic/core/types.js";
    export function run(values: int32[]): int32[] {
      const foreign = (value: int32): int32 => value;
      const alias = foreign;
      const result = values.map(function selected(value: int32): int32 { return value; });
      if (result.length === values.length) return [alias(3)];
      return result;
    }
  `, compileTarget(request, observer) {
    return compileCsharpAnalysisTarget(request, { ...observer, analyzed(program) {
      analysis = program;
      observer.analyzed(program);
    } });
  } });
  assertCsharpCompilationSucceeded(compiled);
  const ast = analysis.source.ast;
  const reads = [];
  const visit = node => {
    if (ast.is.IsIdentifier(node) && ast.text(node) === "alias" && ast.is.IsCallExpression(ast.parent(node))) reads.push(node);
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of analysis.sourceFiles) visit(file);
  assert.equal(reads.length, 1, "one genuine foreign binding read");
  const read = analysis.records.valueRead.get(reads[0]);
  assert.equal(getCsharpCallableValueSignature(read.value)?.parameters.length, 1,
    "equal logical signature and nearby selected callback are not binding identity");
  assert.equal(targetTypeRefEquals(read.flowReadStorage, read.flowReadValue), true, "the original foreign delegate needs no physical projection");
});
