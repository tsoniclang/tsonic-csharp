import assert from "node:assert/strict";
import test from "node:test";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { nativeExpressionSequencesSource } from "../../../../tsonic/test/fixtures/native-expression-sequences.mjs";
import { checkCsharpSource, assertCsharpCheckingSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { analyzeCsharpTargetProgram } from "../../../dist/analysis/program/index.js";
import { createCsharpProviderRelationResolver } from "../../../dist/providers/relations/resolver.js";
import { createCsharpTargetConfiguration } from "../../../dist/options/csharp-target-options.js";
import { csharpBinarySelectionsEqual } from "../../../dist/analysis/expected-types/binary-equality.js";
import { csharpSourcePrimitiveTargetType, targetTypeRefEquals } from "../../../dist/target-model/types/index.js";

for (const surface of [undefined, "js"]) {
  test(`shared comma source retains all exact selected operand and result contracts on ${surface ?? "native"}`, () => {
    const checked = checkCsharpSource({ sourceText: nativeExpressionSequencesSource, surface });
    assertCsharpCheckingSucceeded(checked);
    const source = createTargetSourceProgram(checked.source);
    const analysis = analyzeCsharpTargetProgram({
      input: { source, sourcePackages: checked.sourcePackages, project: checked.project, target: checked.target,
        runtimeActivatedCapabilityIds: [], runtimeReferences: [], paths: checked.paths },
      configuration: createCsharpTargetConfiguration(checked.target, checked.paths.projectRoot, checked.paths.targetOutputRoot),
      providers: createCsharpProviderRelationResolver({ providers: [], providerPolicies: [] }),
    });
    assert.equal(analysis.kind, "resolved");
    assert.equal(analysis.diagnostics.length, 0);
    const program = analysis.value;
    let sequences = 0;
    const visit = node => {
      if (source.ast.is.IsBinaryExpression(node) && source.ast.operatorKindName(node) === "KindCommaToken") {
        const selected = program.operations.binary(node)?.target;
        assert.equal(selected?.kind, "resolved");
        assert.equal(selected.sourceOperator, ",");
        assert.equal(selected.targetOperation.kind, "sequence");
        const binary = source.ast.as.AsBinaryExpression(node);
        assert.equal(selected.left === binary.Left, true);
        assert.equal(selected.right === binary.Right, true);
        assert.equal(targetTypeRefEquals(selected.leftType, selected.leftInputType), true);
        assert.equal(targetTypeRefEquals(selected.rightType, selected.rightInputType), true);
        for (const [label, changed] of [
          ["operator", { ...selected, sourceOperator: "+" }],
          ["native operation", { ...selected, targetOperation: { kind: "operator", operator: "," } }],
          ["left identity", { ...selected, left: selected.right }],
          ["right identity", { ...selected, right: selected.left }],
          ["left carrier", { ...selected, leftInputType: csharpSourcePrimitiveTargetType("uint128") }],
          ["right carrier", { ...selected, rightInputType: csharpSourcePrimitiveTargetType("uint128") }],
          ["completion carrier", { ...selected, resultType: csharpSourcePrimitiveTargetType("uint128") }],
        ]) {
          assert.equal(csharpBinarySelectionsEqual(selected, changed), false, label);
          assert.equal(program.operations.binary(node)?.target === selected, true, label);
        }
        sequences++;
      }
      source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    for (const file of source.navigation.sourceFiles) visit(file);
    assert.equal(sequences, 9);
  });
}
