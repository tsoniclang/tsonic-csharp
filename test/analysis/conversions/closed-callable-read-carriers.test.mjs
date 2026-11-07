import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpAnalysisTarget, compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { hostProgram, representationServices, representations } from "../../representation/host-fixture.mjs";
import { isCsharpRefusal } from "../../../dist/representation/index.js";
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
  const ast = source.syntax;
  const file = source.sourceFiles.find(value => ast.getFileName(value) === "/project/index.ts");
  const nodes = [];
  const visit = node => {
    nodes.push(node);
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(file);
  const alias = nodes.find(node => ast.is.IsIdentifier(node) && ast.text(node) === "alias" && ast.is.IsCallExpression(ast.parent(node)));
  const declaration = source.facts.navigation.identity.target(alias)?.declaration;
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

// The Host publishes the LOGICAL callable read (authored arity); the C# representation of that publication is the
// logical delegate. The selected Native callback ABI (JS map callback: value, index, array) is a target-only storage
// decision recorded by the analysis records below; it never rewrites the Host publication (I2, I4, R2).
test("an unchanged real alias read retains its one selected Native callback ABI without a projection", () => {
  const value = fixture();
  const outcome = value.source.facts.values.type(value.alias);
  const principal = value.source.facts.values.type(value.declaration);
  assert.equal(outcome?.kind === "resolved" && principal?.kind === "resolved" &&
    outcome.type.kind === "callable" && principal.type.kind === "callable", true);
  assert.equal(outcome.type.calls[0].parameters.length, 1, "Source logical arity stays authored");
  assert.equal(principal.type.calls[0].parameters.length, 1, "the same declaration keeps its logical signature");
  assert.equal(getCsharpCallableValueSignature(value.storage)?.parameters.length, 3, "the selected native input is the existing callback ABI");
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

// The same program through the Host fixture: the representation reads only the Host publication.
function hostRead(override) {
  const program = hostProgram(sourceText, { surface: "js" });
  const alias = program.nodes.find(node => program.ast.is.IsIdentifier(node) && program.ast.text(node) === "alias" &&
    program.ast.is.IsCallExpression(program.ast.parent(node)));
  const facts = override === undefined ? program.facts : Object.freeze({ ...program.facts,
    values: Object.freeze({ ...program.facts.values, type: node => node === alias ? override(program.facts.values.type(node), program) : program.facts.values.type(node) }) });
  const services = representationServices(program, { facts, profile: "js",
    shapes: Object.freeze({ retainShape: shape => shape, resolveCallableValue: signature => signature }) });
  return { program, alias, represented: representations(services).value(alias) };
}

test("the representation of the Host alias read is the logical delegate, never the storage ABI", () => {
  const { represented } = hostRead();
  assert.equal(isCsharpRefusal(represented) || represented.kind === "refused", false);
  assert.equal(getCsharpCallableValueSignature(represented)?.parameters.length, 1,
    "missing Native proof keeps the original logical read; the representation never retargets to storage");
});

for (const state of ["refused", "unavailable", "foreign"]) {
  test(`a ${state} Host publication cannot be bypassed by a selected Native callable`, () => {
    if (state === "foreign") {
      assert.throws(() => hostRead((actual, program) => ({ ...actual,
        provenance: { ...actual.provenance, occurrence: program.files[0] } })), error =>
        error.diagnostic?.code === "TSONIC_INTERNAL_ANALYSIS_INVARIANT",
      "a publication owned by another occurrence is an invariant failure (I4), not a retry");
      return;
    }
    let refusal;
    const { represented } = hostRead((actual, program) => {
      if (state === "unavailable") return { ...actual, type: { ...actual.type, calls: [] } };
      refusal = Object.freeze({ kind: "refused", code: "TSONIC_LOCAL_TYPE_CONFLICT", site: program.files[0],
        message: "The original Source group has conflicting declared fills." });
      return refusal;
    });
    if (state === "refused") {
      assert.equal(represented === refusal, true, "the Host refusal is forwarded unchanged: code, message and site (R5)");
      return;
    }
    assert.equal(isCsharpRefusal(represented) && represented.code === "CSHARP_CALLABLE_OVERLOADS", true,
      "a callable publication without one call signature has no .NET delegate; no Native storage retry");
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
    if (source.syntax.is.IsIdentifier(node) && source.syntax.text(node) === "mapper" && source.syntax.is.IsCallExpression(source.syntax.parent(node))) nodes.push(node);
    source.syntax.forEachChild(node, child => { if (child !== undefined) visit(child); });
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
    const ast = analysis.source.syntax;
    const reads = [];
    const visit = node => {
      if (ast.is.IsIdentifier(node) && ast.text(node) === "self" && analysis.records.valueRead.get(node) !== undefined &&
        !ast.is.IsFunctionExpression(ast.parent(node))) reads.push(node);
      ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    for (const file of analysis.sourceFiles) visit(file);
    assert.equal(reads.length > 0, true, "the actual named callable is read");
    for (const node of reads) {
      const published = analysis.source.facts.values.type(node);
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
  const ast = analysis.source.syntax;
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
