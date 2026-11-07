import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded, compileCsharpAnalysisTarget } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { admitCsharpConversionSelection } from "../../../dist/analysis/conversions/validation.js";
import { csharpConversionIsApplicable } from "../../../dist/policy/conversions/applicability.js";

function projectNodes(source) {
  const result = [];
  const visit = node => {
    result.push(node);
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  source.navigation.sourceFiles.forEach(visit);
  return result;
}

test("an exact Source number erasure belongs to its occurrence conversion, never the int64 producer", () => {
  const compiled = compileCsharpSource({ sourceText: `export function run(): unknown {
    const original = 8;
    const erased: unknown = original;
    return erased;
  }` });
  assertCsharpCompilationSucceeded(compiled);
  const program = compiled.result.program;
  const { ast } = program.source;
  const nodes = [];
  const visit = node => {
    nodes.push(node);
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(compiled.source.getSourceFile("/project/index.ts"));
  const declaration = nodes.find(node => ast.is.IsVariableDeclaration(node) && ast.text(ast.name(node)) === "erased");
  const occurrence = declaration === undefined ? undefined : ast.as.AsVariableDeclaration(declaration).Initializer;
  assert.equal(occurrence !== undefined, true, "the real checked use retains its original initializer occurrence");
  const fact = program.source.effectiveTypes.slotAdmission(occurrence);
  assert.equal(fact?.kind === "admitted" && fact.use === occurrence && fact.slot === declaration &&
    fact.conversion.kind === "exact-number-erasure", true,
  "only the already-published exact Source admission authorizes this numeric erasure");
  const use = program.records.nativeExpression.get(occurrence)?.use;
  const read = program.records.valueRead.get(occurrence)?.value;
  assert.equal(use?.kind === "converted" && use.input.kind === "value", true,
    "the actual Native use retains both its input and prepared destination");
  assert.equal(read?.kind === "source-primitive" && read.name === "int64", true,
    "a broad use never retargets the native producer");
  const selection = program.records.expressionConversion.get(occurrence, use.input.type, use.target, "implicit")?.selection;
  console.log("NUMBER_ERASURE_BASELINE", JSON.stringify({ source: read.name, selection: selection?.kind,
    sourceAdmission: fact.conversion.kind }));
  assert.equal(selection?.kind === "number-erasure", true,
    "the exact use must establish float64 completion before the existing Native broad-value conversion");
});

for (const surface of ["native", "js"]) {
  for (const [label, sourceText, expected] of [
    ["literal", "export function run():unknown { return 8; }", "8D"],
    ["argument", "function accept(value:unknown):unknown{return value;} export function run():unknown{const original=8;return accept(original);}", "8D"],
    ["large", "export function run():unknown { const original=1152921504606846976;const erased:unknown=original;return erased;}", "1152921504606846976D"],
    ["negative", "export function run():unknown { const original=-1152921504606846976;const erased:unknown=original;return erased;}", "-1152921504606846976D"],
  ]) {
    test(`${surface} exact-number erasure ${label} executes with one float64 completion`, () => {
      const compiled = compileCsharpSource({ surface, sourceText });
      assertCsharpCompilationSucceeded(compiled);
      const { program } = compiled.result;
      const admissions = projectNodes(program.source).map(node => ({ node, fact: program.source.effectiveTypes.slotAdmission(node) }))
        .filter(entry => entry.fact?.kind === "admitted" && entry.fact.conversion.kind === "exact-number-erasure");
      assert.equal(admissions.length > 0, true, "the actual Source operation publishes its numeric-erasure authority");
      for (const { node, fact } of admissions) {
        const record = program.records.nativeExpression.get(node);
        assert.equal(record?.use.kind === "converted" && record.conversion?.kind === "number-erasure" &&
          record.conversion.admission === fact && record.conversion.intermediate.name === "float64", true,
        "the sealed occurrence retains the exact same admission and its physical result");
        assert.equal(program.records.valueRead.get(node)?.value?.name === "int64", true,
          "Source number erasure never changes the original native producer");
      }
      executeCsharpConstruction(compiled, `number-erasure-${surface}-${label}`, false, false, [], `
var result = Tsonic.Generated.Index.run();
if (result.unwrap() is not double value || value != ${expected} ||
    Tsonic.CSharp.Runtime.TsValue.ApplyDynamicTypeof(result) != "number")
    throw new System.Exception("exact numeric erasure result");
`);
    });
  }

  test(`${surface} an explicit wide integer does not acquire number-origin erasure`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `import type {int64} from "@tsonic/core/types.js";
      export function run():unknown {const original:int64=9007199254740993n;const erased:unknown=original;return erased;}` });
    assertCsharpCompilationSucceeded(compiled);
    const { program } = compiled.result;
    for (const node of projectNodes(program.source)) {
      const admission = program.source.effectiveTypes.slotAdmission(node);
      assert.equal(admission?.kind === "admitted" && admission.conversion.kind === "exact-number-erasure", false,
        "a retained explicit integer is not reclassified by its native width or value");
    }
    executeCsharpConstruction(compiled, `number-erasure-wide-${surface}`, false, false, [], `
var result = Tsonic.Generated.Index.run();
if (result.unwrap() is not long value || value != 9007199254740993L ||
    Tsonic.CSharp.Runtime.TsValue.ApplyDynamicTypeof(result) != "bigint")
    throw new System.Exception("explicit integer identity");
`);
  });

  test(`${surface} an inexact number-origin integer keeps its original Host refusal`, () => {
    let publication;
    const compiled = compileCsharpSource({ surface, sourceText: `export function run():unknown {
      const original=9007199254740993;const erased:unknown=original;return erased;
    }`, compileTarget(request, observer) {
      publication = request.input.source;
      return compileCsharpAnalysisTarget(request, observer);
    } });
    const refused = publication === undefined ? [] : projectNodes(publication)
      .map(node => ({ node, fact: publication.effectiveTypes.slotAdmission(node) }))
      .filter(entry => entry.fact?.kind === "refused");
    assert.equal(refused.length > 0, true, "the Source occurrence, not Native finite-fit guessing, owns refusal");
    for (const { node, fact } of refused) assert.equal(fact.use === node && fact.refusal === publication.effectiveTypes.get(node) &&
      fact.refusal.code === "TSONIC_LOCAL_TYPE_NUMBER_ERASURE_INEXACT", true, "the identical Host refusal record survives");
    assert.equal(compiled.targetDiagnostics.some(diagnostic => diagnostic.code === "TSONIC_LOCAL_TYPE_NUMBER_ERASURE_INEXACT"), true);
    assert.equal(compiled.artifacts.size, 0, "an unproven erasure emits no Native artifact");
  });
}

test("the sealed number-erasure plan validates both physical children without a new pair conversion law", () => {
  const compiled = compileCsharpSource({ sourceText: "export function run():unknown {const original=8;const erased:unknown=original;return erased;}" });
  assertCsharpCompilationSucceeded(compiled);
  const { program } = compiled.result;
  const record = projectNodes(program.source).map(node => program.records.nativeExpression.get(node))
    .find(record => record?.conversion?.kind === "number-erasure");
  assert.equal(record?.use.kind === "converted" && record.use.input.kind === "value", true);
  const source = record.use.input.type;
  const target = record.use.target;
  const policy = { providers: { findTargetBindingByTargetId: () => ({ kind: "missing" }) },
    projectTypes: { directSupertypes: () => [] }, typeDefinitions: program.typeDefinitions };
  assert.equal(admitCsharpConversionSelection(policy, source, target, record.conversion) === record.conversion, true);
  assert.equal(csharpConversionIsApplicable(record.conversion, "implicit"), true);
  assert.equal(csharpConversionIsApplicable(record.conversion, "explicit"), false);
  for (const changed of [
    { ...record.conversion, intermediate: source },
    { ...record.conversion, sourceToIntermediate: { kind: "identity" } },
    { ...record.conversion, intermediateToTarget: { kind: "identity" } },
    { ...record.conversion, admission: { ...record.conversion.admission, conversion: { kind: "identity" } } },
  ]) assert.equal(admitCsharpConversionSelection(policy, source, target, changed).kind === "rejected", true,
    "a stale intermediate, child or Source conversion discriminator cannot be emitted");
});
