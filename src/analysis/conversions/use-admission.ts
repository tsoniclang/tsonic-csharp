import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { sourceEnclosingCallable } from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { getCsharpNullableElementTargetType } from "../../target-model/types/carriers/nullable.js";
import { csharpUntypedObjectLiteralIssue, selectCsharpLiteralDeclarationContext } from "../objects/native-construction-demand.js";
import type { CsharpConversionMode, CsharpConversionSelection } from "../../target-model/conversions/selection.js";
import type { CsharpConversionIssue, CsharpExpressionConversionClassification } from "../../target-model/records/operations/conversions.js";
import type { CsharpNativeDemandAnalysis } from "../../target-model/records/native/native-demand.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations/operations.js";
import type { CsharpTargetCallSelection } from "../../target-model/records/operations/member-selections.js";
import { csharpSelectedTargetArgumentBindings } from "../../policy/operations/members/native-use-arguments.js";
import { csharpNativeUseSite } from "../../target-model/records/native/native-demand.js";
import { requireCsharpRecord, type CsharpRequiredRecord } from "../program/records/objects/required-records.js";
import type { CsharpNativeCompletion } from "../../target-model/records/native/native-demand.js";

export interface CsharpCallConversionRequests {
  readonly completion?: { readonly source: TargetTypeRef; readonly target: TargetTypeRef };
  readonly omitted: readonly { readonly source: TargetTypeRef; readonly target: TargetTypeRef | undefined }[];
}

export function sealCsharpConversionUses(
  demand: CsharpNativeDemandAnalysis,
  operations: Pick<CsharpTargetOperationClassifications, "selectedCall" | "selectedConstruction">,
  classify: (expression: Node, source: TargetTypeRef, target: TargetTypeRef, mode: CsharpConversionMode,
    exactInteger: boolean,
    boundary?: { readonly selection: CsharpConversionSelection; readonly identityRequired: boolean },
    sourceCompletion?: CsharpNativeCompletion) =>
    { readonly key: string; readonly classification: CsharpExpressionConversionClassification } | undefined,
  classifyValue: (expression: Node, source: TargetTypeRef, target: TargetTypeRef | undefined) => CsharpConversionSelection | undefined,
  requiredRecords: CsharpRequiredRecord[],
  preparationIssues: readonly CsharpConversionIssue[],
  callConversions: ReadonlyMap<Node, CsharpCallConversionRequests>,
  context: Pick<CsharpPolicyContext, "ast" | "navigation" | "semanticsFor"> & {
    readonly objectShapes: Pick<CsharpPolicyContext["objectShapes"], "resolveTarget">;
  },
): {
  readonly expressions: Map<Node, Map<string, CsharpExpressionConversionClassification>>;
  readonly issues: readonly CsharpConversionIssue[];
} {
  const expressions = new Map<Node, Map<string, CsharpExpressionConversionClassification>>();
  const issues: CsharpConversionIssue[] = [];
  const calls = new Set<Node>();
  const completedCalls = new Set<Node>();
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
      for (const omitted of callConversions.get(use.expression)?.omitted ?? []) {
        admitValue(use.expression, omitted.source, omitted.target);
      }
      selectedArgumentUses(use.expression, operations.selectedCall.get(use.expression)?.target);
      selectedArgumentUses(use.expression, operations.selectedConstruction.get(use.expression)?.target);
    }
    if (use.completion.kind !== "value") continue;
    const sourceCompletion = use.kind === "converted" ? use.input : use.completion;
    const completion = callConversions.get(use.expression)?.completion;
    if (completion !== undefined && sourceCompletion.kind === "value" && !completedCalls.has(use.expression)) {
      completedCalls.add(use.expression);
      admitValue(use.expression, completion.source, completion.target);
    }
    const source = use.kind === "converted" && use.input.kind === "value" ? use.input.type : use.carrier;
    const target = use.kind === "converted" ? use.target : use.carrier;
    const mode = use.kind === "converted" ? use.mode : "implicit";
    admit(use.expression, source, target, mode, undefined, use.exactInteger === true, sourceCompletion);
  }
  return Object.freeze({ expressions, issues: Object.freeze(issues) });

  function admitValue(expression: Node, source: TargetTypeRef, target: TargetTypeRef | undefined): void {
    const selected = classifyValue(expression, source, target);
    if (selected === undefined) {
      if (preparationIssues.some(issue => issue.code === "CSHARP_CONVERSION_CLASSIFICATION_LIMIT_EXCEEDED")) return;
      return failTargetAnalysisInvariant("tsonic-csharp", "A consumed native default requires its completed conversion classification.", expression);
    }
    if (selected.kind === "rejected" || selected.kind === "ambiguous") {
      issues.push(Object.freeze({ node: expression, code: selected.kind === "rejected" ? selected.code ?? "CSHARP_UNSUPPORTED_AST" : "CSHARP_UNSUPPORTED_AST",
        message: selected.reason }));
      return;
    }
    if (target === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
      "An admitted native value conversion requires its exact closed destination.", expression);
    requireCsharpRecord(requiredRecords, { family: "conversion", subject: expression, source, target, mode: "implicit",
      construct: "consumed native value conversion", producer: "sealCsharpConversionUses" });
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
      const sourceCompletion = actual.use.kind === "converted" ? actual.use.input : actual.use.completion;
      admit(expression, source, target, "implicit", { selection: conversion,
        identityRequired: retainedIdentity && conversion.kind === "delegate-adapter" && conversion.strategy === "adaptation" },
      false, sourceCompletion);
      while (conversion.kind === "nullable-map") {
        source = conversion.sourceElement;
        target = conversion.targetElement;
        conversion = conversion.conversion;
        admit(expression, source, target, "implicit", { selection: conversion,
          identityRequired: retainedIdentity && conversion.kind === "delegate-adapter" && conversion.strategy === "adaptation" },
        false, sourceCompletion);
      }
    }
  }

  function admit(expression: Node, source: TargetTypeRef, target: TargetTypeRef, mode: CsharpConversionMode,
    boundary?: { readonly selection: CsharpConversionSelection; readonly identityRequired: boolean }, exactInteger = false,
    sourceCompletion?: CsharpNativeCompletion): void {
    const admitted = classify(expression, source, target, mode, exactInteger, boundary, sourceCompletion);
    if (admitted === undefined) {
      if (preparationIssues.some(issue => issue.code === "CSHARP_CONVERSION_CLASSIFICATION_LIMIT_EXCEEDED")) return;
      return failTargetAnalysisInvariant("tsonic-csharp", "A consumed native expression requires one exact completed conversion classification.", expression);
    }
    const selections = expressions.get(expression) ?? new Map();
    selections.set(admitted.key, admitted.classification);
    expressions.set(expression, selections);
    if (admitted.classification.selection.kind === "rejected" || admitted.classification.selection.kind === "ambiguous") {
      const literalIssue = mode === "implicit" && admitted.classification.selection.kind === "rejected"
        ? untypedObjectLiteralIssue(expression, target) : undefined;
      if (literalIssue !== undefined) {
        issues.push(literalIssue);
        return;
      }
      issues.push(Object.freeze({ node: expression, code: admitted.classification.selection.kind === "rejected"
        ? admitted.classification.selection.code ?? "CSHARP_UNSUPPORTED_AST" : "CSHARP_UNSUPPORTED_AST",
        message: admitted.classification.selection.reason }));
      return;
    }
    if (boundary === undefined && sourceCompletion?.kind !== "void") requireCsharpRecord(requiredRecords, { family: "conversion", subject: expression, source, target, mode,
      construct: "consumed native carrier conversion", producer: "sealCsharpConversionUses" });
    requireCsharpRecord(requiredRecords, { family: "expressionConversion", subject: expression, source, target, mode,
      construct: "consumed native expression conversion", producer: "sealCsharpConversionUses" });
  }

  function untypedObjectLiteralIssue(expression: Node, target: TargetTypeRef): CsharpConversionIssue | undefined {
    const shape = context.objectShapes.resolveTarget(getCsharpNullableElementTargetType(target) ?? target);
    if (shape?.constructible !== true) return undefined;
    const queries = context.semanticsFor(expression);
    const checked = queries.types.expressionType(expression);
    if (checked === undefined || queries.types.isUnion(checked)) return undefined;
    const symbol = queries.declarations.typeSymbol(checked);
    const declarations = symbol === undefined ? [] : queries.declarations.symbolDeclarations(symbol);
    const literal = declarations.length === 1 ? declarations[0] : undefined;
    if (literal === undefined || !context.ast.is.IsObjectLiteralExpression(literal) ||
      !context.navigation.isProjectDeclaration(literal) ||
      context.ast.getSourceFile(literal) !== context.ast.getSourceFile(expression) ||
      sourceEnclosingCallable(literal, context.ast) !== sourceEnclosingCallable(expression, context.ast) ||
      selectCsharpLiteralDeclarationContext(literal, context.semanticsFor(literal), context) !== undefined) return undefined;
    return csharpUntypedObjectLiteralIssue(literal);
  }
}
