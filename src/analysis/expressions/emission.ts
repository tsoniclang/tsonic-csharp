import type { Node } from "@tsonic/tsts";
import type { TargetUseSiteRef } from "@tsonic/target-api/analysis";
import { failTargetAnalysisInvariant, type TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpNativeDemandAnalysis } from "../../target-model/records/native-demand.js";
import type { CsharpNativeExpressionRecord, CsharpNativeDiscardEmission } from "../../target-model/records/native-demand.js";
import type { CsharpConversionClassifications } from "../../target-model/records/conversions.js";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";
import type { CsharpClassFactoryIndex } from "../../target-model/records/class-factories.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import { createCsharpExpressionEmissionRecords } from "../program/records/expression-emission.js";

export function analyzeCsharpExpressionEmission(input: { readonly source: TargetSourceProgram; readonly nodes: readonly Node[];
  readonly demand: CsharpNativeDemandAnalysis; readonly conversions: CsharpConversionClassifications;
  readonly evidence: CsharpSourceEvidenceIndex; readonly factories: CsharpClassFactoryIndex; readonly operations: CsharpTargetOperationClassifications }) {
  const { source, nodes, demand, conversions } = input;
  const expressions = new Map<Node, CsharpNativeExpressionRecord>();
  const discards = new Map<TargetUseSiteRef, CsharpNativeDiscardEmission>();
  const issues: TargetDiagnostic[] = [];
  for (const { site, use } of demand.entries) discards.set(site, use.kind === "erased" ? { kind: "sequence", steps: Object.freeze([]) }
    : use.kind === "location" ? { kind: "sequence", steps: Object.freeze([...use.children]) } : { kind: "effect", expression: use.expression });
  for (const node of new Set([...nodes, ...demand.entries.map(({ use }) => use.expression)])) {
    const selected = demand.nativeUse.expression(node);
    if (selected === undefined) continue;
    const use = selected.use;
    if (use.kind === "erased") { expressions.set(node, { ...selected, physical: undefined, conversion: undefined, bottom: undefined, storage: undefined }); continue; }
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
    const ast = source.ast;
    const core = bottom === undefined && construction.literal === undefined && construction.binary === undefined && construction.discardedPresence === undefined &&
      !forwarded.has(ast.kindName(node));
    let storage: Node | undefined;
    if (core) {
      const handler = input.operations.nativeHandler.get(node);
      if (!sourceKinds.has(ast.kindName(node)) && handler === undefined && input.evidence.sourceDefaultValue.get(node) === undefined) {
        issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: node, message: "Expression is outside the current C# planning surface." }); continue;
      }
      if (ast.is.IsClassExpression(node) && input.factories.classFactory.get(node) === undefined) {
        issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: node, message: "A class expression requires its sealed native factory." }); continue;
      }
      if (ast.is.IsClassExpression(node) || input.evidence.sourceDefaultValue.get(node) !== undefined) storage = node;
      else {
        const argument = input.evidence.sourceArgument.get(node)
          ?? failTargetAnalysisInvariant("tsonic-csharp", "An admitted source expression requires its checked argument-passing evidence.", node);
        if (argument.kind === "rejected") {
          issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: node, message: argument.reason }); continue;
        }
        storage = argument.argument.storageExpression;
      }
    }
    const integerTruncation = conversion?.kind === "integer-truncation" && use.kind === "converted"
      ? Object.freeze({ target: use.target, signed: conversion.signed }) : undefined;
    if (integerTruncation !== undefined) {
      const target = input.operations.selectedCall.get(node)?.target;
      if (target?.kind !== "resolved" || target.source.sourceArguments.length !== 2)
        failTargetAnalysisInvariant("tsonic-csharp", "An admitted native integer truncation requires its exact two-argument target call.", node);
    }
    expressions.set(node, { ...selected, physical: construction, conversion, bottom, storage, integerTruncation });
  }
  const complete = new Set<Node>();
  for (const node of expressions.keys()) {
    const path = new Set<Node>();
    let current = node;
    while (!complete.has(current)) {
      if (path.has(current)) failTargetAnalysisInvariant("tsonic-csharp", "Source expression storage forwarding must be acyclic.", current);
      path.add(current);
      const storage = expressions.get(current)?.storage;
      if (storage === undefined || storage === current) break;
      current = storage;
    }
    for (const visited of path) complete.add(visited);
  }
  return Object.freeze({ records: createCsharpExpressionEmissionRecords(expressions, discards), issues: Object.freeze(issues) });
}

const forwarded = new Set(["KindVoidExpression", "KindAsExpression", "KindTypeAssertionExpression", "KindNonNullExpression",
  "KindParenthesizedExpression", "KindSatisfiesExpression", "KindConditionalExpression", "KindArrayLiteralExpression", "KindObjectLiteralExpression"]);

const sourceKinds = new Set(["KindClassExpression", "KindIdentifier", "KindRegularExpressionLiteral", "KindTypeOfExpression", "KindDeleteExpression",
  "KindTemplateExpression", "KindPropertyAccessExpression", "KindElementAccessExpression", "KindArrowFunction", "KindFunctionExpression",
  "KindCallExpression", "KindNewExpression", "KindPrefixUnaryExpression", "KindPostfixUnaryExpression", "KindBinaryExpression",
  "KindStringLiteral", "KindNoSubstitutionTemplateLiteral", "KindNumericLiteral", "KindBigIntLiteral", "KindTrueKeyword", "KindFalseKeyword",
  "KindNullKeyword", "KindThisKeyword", "KindSuperKeyword", "KindAwaitExpression"]);
