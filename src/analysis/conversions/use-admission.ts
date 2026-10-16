import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpConversionMode, CsharpConversionSelection } from "../../target-model/conversions/selection.js";
import type { CsharpConversionIssue, CsharpExpressionConversionClassification } from "../../target-model/records/conversions.js";
import type { CsharpNativeDemandAnalysis } from "../operations/native-demand-model.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpTargetCallSelection } from "../../target-model/records/member-selections.js";
import { csharpSelectedTargetArgumentBindings } from "../../policy/operations/members/selection/native-use-arguments.js";
import { csharpNativeUseSite } from "../../target-model/records/native-demand.js";
import { requireCsharpRecord, type CsharpRequiredRecord } from "../program/records/required-records.js";

export function sealCsharpConversionUses(
  demand: CsharpNativeDemandAnalysis,
  operations: Pick<CsharpTargetOperationClassifications, "selectedCall" | "selectedConstruction">,
  classify: (expression: Node, source: TargetTypeRef, target: TargetTypeRef, mode: CsharpConversionMode,
    boundary?: { readonly selection: CsharpConversionSelection; readonly identityRequired: boolean }) =>
    { readonly key: string; readonly classification: CsharpExpressionConversionClassification } | undefined,
  classifyValue: (expression: Node, source: TargetTypeRef, target: TargetTypeRef) => CsharpConversionSelection | undefined,
  requiredRecords: CsharpRequiredRecord[],
  preparationIssues: readonly CsharpConversionIssue[],
): {
  readonly expressions: Map<Node, Map<string, CsharpExpressionConversionClassification>>;
  readonly issues: readonly CsharpConversionIssue[];
} {
  const expressions = new Map<Node, Map<string, CsharpExpressionConversionClassification>>();
  const issues: CsharpConversionIssue[] = [];
  const calls = new Set<Node>();
  for (const entry of demand.entries) {
    const use = entry.use;
    if (use.kind === "erased") continue;
    const defaultValue = use.defaultValue;
    if (defaultValue !== undefined) {
      if (defaultValue.normalize) admitValue(use.expression, defaultValue.source, defaultValue.storage);
      if (defaultValue.kind !== "absence") admitValue(use.expression, defaultValue.present, defaultValue.target);
    }
    if (!calls.has(use.expression)) {
      calls.add(use.expression);
      selectedArgumentUses(use.expression, operations.selectedCall.get(use.expression)?.target);
      selectedArgumentUses(use.expression, operations.selectedConstruction.get(use.expression)?.target);
    }
    if (use.completion.kind !== "value") continue;
    const source = use.kind === "converted" && use.input.kind === "value" ? use.input.type : use.carrier;
    const target = use.kind === "converted" ? use.target : use.carrier;
    const mode = use.kind === "converted" ? use.mode : "implicit";
    admit(use.expression, source, target, mode);
  }
  return Object.freeze({ expressions, issues: Object.freeze(issues) });

  function admitValue(expression: Node, source: TargetTypeRef, target: TargetTypeRef): void {
    const selected = classifyValue(expression, source, target);
    if (selected === undefined) {
      if (preparationIssues.some(issue => issue.code === "CSHARP_CONVERSION_CLASSIFICATION_LIMIT_EXCEEDED")) return;
      return failTargetAnalysisInvariant("tsonic-csharp", "A consumed native default requires its completed conversion classification.", expression);
    }
    if (selected.kind === "rejected") {
      issues.push(Object.freeze({ node: expression, code: selected.code ?? "CSHARP_UNSUPPORTED_AST",
        message: selected.reason }));
      return;
    }
    requireCsharpRecord(requiredRecords, { family: "conversion", subject: expression, source, target, mode: "implicit",
      construct: "consumed native default conversion", producer: "sealCsharpConversionUses" });
  }

  function selectedArgumentUses(owner: Node, selection: CsharpTargetCallSelection | undefined): void {
    if (selection?.kind !== "resolved" || selection.call.origin !== "provider") return;
    const bindings = csharpSelectedTargetArgumentBindings(selection.call);
    if (bindings.kind !== "bound") return;
    const argumentsByIndex = new Map(selection.call.arguments.map(argument => [argument.effectiveArgumentIndex, argument]));
    const bindingsByIndex = new Map(bindings.bindings.map(binding => [binding.slot.effectiveIndex, binding]));
    for (const mapping of selection.call.argumentMappings) {
      if (mapping.kind !== "by-value") continue;
      const argument = argumentsByIndex.get(mapping.effectiveArgumentIndex);
      const binding = bindingsByIndex.get(mapping.effectiveArgumentIndex);
      const expression = argument === undefined ? undefined : selection.source.sourceArguments[argument.sourceArgumentIndex]?.expression;
      if (expression === undefined || binding === undefined) continue;
      const actual = demand.nativeUse.expression(expression);
      if (actual === undefined || actual.site.subject !== owner || actual.site.role !== csharpNativeUseSite(owner, binding.slot).role ||
        actual.use.kind === "erased" || actual.use.completion.kind !== "value") continue;
      let source = mapping.sourceType;
      let target = mapping.targetType;
      let conversion = mapping.conversion;
      const retainedIdentity = selection.call.targetMember.csharpInvocation?.kind === "native-event-remove";
      admit(expression, source, target, "implicit", { selection: conversion,
        identityRequired: retainedIdentity && conversion.kind === "delegate-adapter" && conversion.strategy === "adaptation" });
      while (conversion.kind === "nullable-map") {
        source = conversion.sourceElement;
        target = conversion.targetElement;
        conversion = conversion.conversion;
        admit(expression, source, target, "implicit", { selection: conversion,
          identityRequired: retainedIdentity && conversion.kind === "delegate-adapter" && conversion.strategy === "adaptation" });
      }
    }
  }

  function admit(expression: Node, source: TargetTypeRef, target: TargetTypeRef, mode: CsharpConversionMode,
    boundary?: { readonly selection: CsharpConversionSelection; readonly identityRequired: boolean }): void {
    const admitted = classify(expression, source, target, mode, boundary);
    if (admitted === undefined) {
      if (preparationIssues.some(issue => issue.code === "CSHARP_CONVERSION_CLASSIFICATION_LIMIT_EXCEEDED")) return;
      return failTargetAnalysisInvariant("tsonic-csharp", "A consumed native expression requires one exact completed conversion classification.", expression);
    }
    const selections = expressions.get(expression) ?? new Map();
    selections.set(admitted.key, admitted.classification);
    expressions.set(expression, selections);
    if (admitted.classification.selection.kind === "rejected") {
      issues.push(Object.freeze({ node: expression, code: admitted.classification.selection.code ?? "CSHARP_UNSUPPORTED_AST",
        message: admitted.classification.selection.reason }));
      return;
    }
    if (boundary === undefined) requireCsharpRecord(requiredRecords, { family: "conversion", subject: expression, source, target, mode,
      construct: "consumed native carrier conversion", producer: "sealCsharpConversionUses" });
    requireCsharpRecord(requiredRecords, { family: "expressionConversion", subject: expression, source, target, mode,
      construct: "consumed native expression conversion", producer: "sealCsharpConversionUses" });
  }
}
