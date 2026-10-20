import type { Node } from "@tsonic/tsts";
import type { TargetUseSiteRef } from "@tsonic/target-api/analysis";
import { failTargetAnalysisInvariant, type TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpNativeDemandAnalysis } from "../operations/native-demand-model.js";
import type { CsharpNativeExpressionRecord, CsharpNativeDiscardEmission } from "../../target-model/records/native-demand.js";
import type { CsharpConversionClassifications } from "../../target-model/records/conversions.js";
import { createCsharpExpressionEmissionRecords } from "../program/records/expression-emission.js";

export function analyzeCsharpExpressionEmission(nodes: readonly Node[], demand: CsharpNativeDemandAnalysis, conversions: CsharpConversionClassifications) {
  const expressions = new Map<Node, CsharpNativeExpressionRecord>();
  const discards = new Map<TargetUseSiteRef, CsharpNativeDiscardEmission>();
  const issues: TargetDiagnostic[] = [];
  for (const { site, use } of demand.entries) discards.set(site, use.kind === "erased" ? { kind: "sequence", steps: Object.freeze([]) }
    : use.kind === "location" ? { kind: "sequence", steps: Object.freeze([...use.children]) } : { kind: "effect", expression: use.expression });
  for (const node of new Set([...nodes, ...demand.entries.map(({ use }) => use.expression)])) {
    const selected = demand.nativeUse.expression(node);
    if (selected === undefined) continue;
    const use = selected.use;
    if (use.kind === "erased") { expressions.set(node, { ...selected, physical: undefined, conversion: undefined, bottom: undefined }); continue; }
    const construction = use.kind === "converted" && use.children.length === 1 && use.children[0]!.subject === node && use.children[0]!.role === "constructed-result"
      ? demand.nativeUse.get(use.children[0]!) ?? failTargetAnalysisInvariant("tsonic-csharp", "An admitted converted expression requires its physical construction use.", node) : use;
    if (construction.kind === "erased") failTargetAnalysisInvariant("tsonic-csharp", "An admitted native construction cannot have an erased physical use.", node);
    let bottom: CsharpNativeExpressionRecord["bottom"];
    if (construction.completion.kind === "never" && construction.evaluation.kind === "sequence") {
      const steps = construction.evaluation.steps;
      const index = steps.findIndex(step => {
        const child = demand.nativeUse.get(step.site)
          ?? failTargetAnalysisInvariant("tsonic-csharp", "An admitted native evaluation sequence requires its exact child use.", node);
        return step.guard === undefined && child.kind !== "erased" && child.completion.kind === "never";
      });
      if (index >= 0) bottom = Object.freeze({ effects: Object.freeze(steps.slice(0, index).map(step => step.site)),
        expression: demand.nativeUse.get(steps[index]!.site)!.expression });
    }
    const conversionRequired = use.kind === "converted" && use.completion.kind !== "void" && construction.completion.kind !== "never";
    const conversion = use.kind === "converted" && conversionRequired ? conversions.expressionConversion.get(node, use.carrier, use.target, use.mode) : undefined;
    if (conversionRequired && conversion === undefined) failTargetAnalysisInvariant("tsonic-csharp", "An admitted converted expression requires its exact native conversion selection.", node);
    if (conversion?.kind === "rejected") {
      issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: node, message: conversion.reason }); continue;
    }
    expressions.set(node, { ...selected, physical: construction, conversion, bottom });
  }
  return Object.freeze({ records: createCsharpExpressionEmissionRecords(expressions, discards), issues: Object.freeze(issues) });
}
