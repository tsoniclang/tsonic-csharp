import { assertNoTargetDiagnostics } from "../../../../../tsonic/test/scripts/diagnostic-assertions.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../../helpers/native-construction.mjs";
import { freshArraySpreadCostSource } from "../../../../../tsonic/test/fixtures/fresh-array-spread.mjs";
import { analyzeCsharpTargetProgram } from "../../../../dist/analysis/program/index.js";
import { createCsharpProviderRelationResolver } from "../../../../dist/providers/relations/resolver.js";
import { createCsharpTargetConfiguration } from "../../../../dist/options/csharp-target-options.js";
import { createCsharpPlanningContext, createCsharpMemberPlanningContext } from "../../../../dist/backend/planner/context.js";
import { planExpression, planExpressionWithExpectedType } from "../../../../dist/backend/planner/expressions/index.js";
import { planNativeCollectionArrayLiteralExpression } from "../../../../dist/backend/planner/expressions/array-literals/native-collection.js";
import { csharpListTargetType, csharpSourcePrimitiveTargetType } from "../../../../dist/target-model/types/index.js";
import { csharpTypeFromTargetTypeRef } from "../../../../dist/backend/planner/types/target-types.js";
import { printCsharpCompilationUnit } from "../../../../dist/print/source/printer.js";

test("native collection construction fills only its declared native builder", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ sourceText: freshArraySpreadCostSource });
  assertCsharpCompilationSucceeded(compiled);
  const source = createTargetSourceProgram(compiled.source);
  const analysis = analyzeCsharpTargetProgram({
    input: { source, sourcePackages: compiled.sourcePackages, project: compiled.project, target: compiled.target,
      runtimeActivatedCapabilityIds: [], runtimeReferences: [], paths: compiled.paths },
    configuration: createCsharpTargetConfiguration(compiled.target, compiled.paths.projectRoot, compiled.paths.targetOutputRoot),
    providers: createCsharpProviderRelationResolver({ providers: [], providerPolicies: [] }),
  });
  assert.equal(analysis.kind, "resolved");
  assertNoTargetDiagnostics(analysis.diagnostics);
  const arrays = [];
  const visit = node => {
    if (source.ast.is.IsArrayLiteralExpression(node)) arrays.push(node);
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of analysis.value.sourceFiles) visit(file);
  const node = arrays[0];
  assert.ok(node);
  const context = createCsharpMemberPlanningContext(createCsharpPlanningContext(analysis.value));
  const element = csharpSourcePrimitiveTargetType("float64");
  const carrier = csharpListTargetType(element);
  const diagnostics = [];
  const planner = { planExpression, planExpressionWithExpectedType };
  const planned = planNativeCollectionArrayLiteralExpression(node, source.ast.getSourceFile(node), context,
    diagnostics, carrier, element, planner);
  assert.equal(planned?.completion.kind, "value");
  assertNoTargetDiagnostics(diagnostics);
  const output = printCsharpCompilationUnit({ kind: "CompilationUnit", usings: [], members: [{
    kind: "NamespaceDeclaration", name: "Tsonic.Generated", members: [{ kind: "ClassDeclaration", name: "Index",
      modifiers: ["public", "static"], members: [
        { kind: "MethodDeclaration", name: "widen", modifiers: ["public", "static"],
          returnType: csharpTypeFromTargetTypeRef(carrier),
          parameters: [{ name: "values", type: { kind: "ArrayType", elementType: { kind: "PredefinedType", name: "byte" } } }],
          body: { kind: "Block", statements: [...planned.prelude,
            { kind: "ReturnStatement", expression: planned.completion.expression }] } },
        ...context.scope.generatedMethods.values(),
      ] }],
  }] });
  assert.doesNotMatch(output, /new double\[|\.Select\(|Func<|foreach/);
  executeCsharpConstruction({ ...compiled, artifacts: new Map([["src/Index.cs", output]]) }, "native-list-spread-cost", false, false, [], `
using System;
using System.Collections.Generic;
using Index = Tsonic.Generated.Index;
foreach (int length in new[] { 1, 2, 10, 128 }) {
    byte[] input = new byte[length];
    Array.Fill(input, (byte)7);
    for (int index = 0; index < 1000; index++) { GC.KeepAlive(Index.widen(input)); GC.KeepAlive(Handwritten(input)); }
    long before = GC.GetAllocatedBytesForCurrentThread();
    for (int index = 0; index < 10000; index++) {
        List<double> result = Index.widen(input);
        if (result.Count != length || result[0] != 7 || result[length - 1] != 7) throw new Exception("native collection values");
        GC.KeepAlive(result);
    }
    long generated = GC.GetAllocatedBytesForCurrentThread() - before;
    before = GC.GetAllocatedBytesForCurrentThread();
    for (int index = 0; index < 10000; index++) GC.KeepAlive(Handwritten(input));
    long handwritten = GC.GetAllocatedBytesForCurrentThread() - before;
    if (generated != handwritten) throw new Exception($"native list allocation: {generated} != {handwritten}");
}
static List<double> Handwritten(byte[] source) {
    List<double> result = new List<double>(source.Length);
    for (int index = 0; index < source.Length; index++) result.Add(source[index]);
    return result;
}
`);
  const missing = { ...carrier, csharpArrayLiteralConstructionType: { ...carrier, csharpArrayLiteralBuilder: undefined } };
  const invalid = [];
  assert.equal(planNativeCollectionArrayLiteralExpression(node, source.ast.getSourceFile(node), context,
    invalid, missing, element, planner), undefined);
  assert.ok(invalid.some(diagnostic => /construction metadata/.test(diagnostic.message)));
});
