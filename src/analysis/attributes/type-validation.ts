import { nativeConstantConversion } from "../../policy/conversions/constant-conversions.js";
import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations/operations.js";

import type { CsharpConversionClassifications, CsharpValueReadClassifications } from "../../target-model/records/operations/conversions.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/program/source-evidence.js";
import { getCsharpTypeofRuntimeKind } from "../../target-model/types/runtime-kind.js";
import { isCsharpAbsenceTargetType } from "../../target-model/types/carriers/runtime-carriers.js";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import type { CsharpSourceAttributeApplicationIndex } from "./model.js";
import type { CsharpRepresentationOutcome } from "../../target-model/types/representation.js";
import { represented } from "../../policy/types/source-type-flow/representation-results.js";
import { forwardSourceRefusal } from "../source-evidence/representations.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";

export function diagnoseCsharpAttributeTypeValues(
  source: TargetSourceProgram,
  applications: CsharpSourceAttributeApplicationIndex,
): readonly TargetDiagnostic[] {
  const diagnostics: TargetDiagnostic[] = [];
  for (const application of applications.all) {
    const node = application.invocation;
    if (source.ast.is.IsNewExpression(node)) {
      const original = source.facts.applications.application(node);
      if (original.kind === "refused") {
        diagnostics.push(forwardSourceRefusal(original));
        continue;
      }
      if (original.value.kind === "construct") continue;
    }
    diagnostics.push({
      code: "CSHARP_ATTRIBUTE_CONSTRUCTION_REQUIRED",
      category: "error",
      source: "tsonic-csharp",
      message: "A C# attribute requires an inline lambda containing an exact checked construction: () => new AttributeType(...).",
      sourceNode: node,
    });
  }
  return diagnostics;
}

export interface CsharpAttributeArgumentRejection {
  readonly node: Node;
  readonly reason: string;
}

export interface CsharpAttributeArgumentEvidence {
  readonly operations: CsharpTargetOperationClassifications;
  readonly conversions: Pick<CsharpConversionClassifications, "expressionConversion">;
  readonly valueReads: CsharpValueReadClassifications;
  readonly sourceEvidence: Pick<CsharpSourceEvidenceIndex, "constantValue">;
}

export function admitCsharpAttributeArguments(
  source: Pick<TargetSourceProgram, "ast" | "facts">,
  evidence: CsharpAttributeArgumentEvidence,
  invocation: Node,
): CsharpRepresentationOutcome<readonly CsharpAttributeArgumentRejection[]> {
  const { ast } = source;
  const { operations, conversions, valueReads, sourceEvidence } = evidence;
  const publication = source.facts.applications.application(invocation);
  if (publication.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: publication });
  const application = publication.value;
  if (application.kind !== "construct" || application.identity.invocation !== invocation)
    failTargetAnalysisInvariant("tsonic-csharp", "A Native attribute requires its identical original Source construction application.", invocation);
  const construction = operations.selectedConstruction.get(invocation)?.target;
  if (construction?.kind === "resolved" && construction.call.targetMember.csharpInvocation !== undefined) {
    return represented([{ node: invocation, reason: "selects a special native invocation rather than a native attribute constructor." }]);
  }
  if (construction?.kind === "resolved" && (construction.call.sequenceArguments?.length ?? 0) > 0) {
    return represented([{ node: invocation, reason: "spreads a sequence into the attribute constructor; C# attribute arguments are constant expressions." }]);
  }
  const mappings = construction?.kind === "resolved" && construction.call.origin === "provider"
    ? construction.call.argumentMappings : undefined;
  const mappingsByArgument = new Map(mappings?.map(mapping => [mapping.effectiveArgumentIndex, mapping]));
  const rejections: CsharpAttributeArgumentRejection[] = [];
  for (const [index, authored] of application.sourceArguments.entries()) {
    if (authored.operand.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: authored.operand });
    const argument = authored.operand.value.occurrence;
    const places = application.arguments.filter(place => place.sourceArgumentIndex === index);
    if (places.some(place => place.sourceArgument !== authored.occurrence)) failTargetAnalysisInvariant("tsonic-csharp",
      "An attribute binding must retain its identical original authored argument.", invocation);
    let rejectedConversion = false;
    if (mappings !== undefined) for (const place of places) {
      const mapping = mappingsByArgument.get(place.effectiveArgumentIndex);
      if (mapping?.kind === "by-value" && nativeConstantConversion(mapping.conversion)) continue;
      rejectedConversion = true;
      rejections.push({ node: argument, reason: `argument ${index + 1} requires a ${
        mapping?.kind === "by-value" ? `'${mapping.conversion.kind}'` : `'${mapping?.kind ?? "missing"}'`} argument conversion, which is not a C# constant conversion.` });
    }
    if (!rejectedConversion && (authored.form === "spread" || !admittedConstant(argument, false))) {
      rejections.push({ node: argument, reason: `argument ${index + 1} is not a C# attribute constant; attribute arguments must be literals, .NET literal fields, native operators over constants, or one-dimensional arrays of them.` });
    }
  }
  return represented(Object.freeze(rejections));

  function admittedConstant(node: Node, element: boolean): boolean {
    const pending = [{ node, element }];
    while (pending.length > 0) {
      const current = pending.pop()!;
      const node = current.node;
      const element = current.element;
      switch (ast.kindName(node)) {
      case "KindStringLiteral":
      case "KindNoSubstitutionTemplateLiteral":
      case "KindNumericLiteral":
      case "KindTrueKeyword":
      case "KindFalseKeyword":
      case "KindNullKeyword":
        break;
      case "KindParenthesizedExpression": {
        const inner = ast.as.AsParenthesizedExpression(node)?.Expression;
        if (inner === undefined) return false;
        pending.push({ node: inner, element });
        break;
      }
      case "KindSatisfiesExpression": {
        const inner = ast.as.AsSatisfiesExpression(node)?.Expression;
        if (inner === undefined) return false;
        pending.push({ node: inner, element });
        break;
      }
      case "KindAsExpression":
      case "KindTypeAssertionExpression":
      case "KindNonNullExpression": {
        const assertion = ast.is.IsAsExpression(node) ? ast.as.AsAsExpression(node)
          : ast.is.IsTypeAssertion(node) ? ast.as.AsTypeAssertion(node) : ast.as.AsNonNullExpression(node);
        const inner = assertion?.Expression;
        const target = ast.is.IsNonNullExpression(node) ? node
          : ast.is.IsAsExpression(node) ? ast.as.AsAsExpression(node)?.Type : ast.as.AsTypeAssertion(node)?.Type;
        if (inner === undefined || target === undefined ||
          !ast.isConstAssertion(node) && !constantConversion(inner, target, "explicit")) return false;
        pending.push({ node: inner, element });
        break;
      }
      case "KindPrefixUnaryExpression": {
        const unary = operations.unaryOperation.get(node);
        if (unary?.target.kind === "literal") break;
        if (unary?.jsValue.kind !== "not-js-value" || unary.target.kind !== "resolved" ||
          unary.target.sourceOperator !== "-" && unary.target.sourceOperator !== "+" &&
          unary.target.sourceOperator !== "~" && unary.target.sourceOperator !== "!") return false;
        pending.push({ node: unary.target.operand, element });
        break;
      }
      case "KindBinaryExpression": {
        const binary = operations.binaryOperation.get(node);
        if (binary?.jsValue.kind !== "not-js-value" || binary.target.kind !== "resolved" ||
          binary.target.targetOperation.kind !== "operator") return false;
        pending.push({ node: binary.target.right, element }, { node: binary.target.left, element });
        break;
      }
      case "KindConditionalExpression": {
        const conditional = ast.as.AsConditionalExpression(node);
        const condition = conditional?.Condition;
        const whenTrue = conditional?.WhenTrue;
        const whenFalse = conditional?.WhenFalse;
        if (condition === undefined || whenTrue === undefined || whenFalse === undefined ||
          !constantConversion(whenTrue, node, "implicit") || !constantConversion(whenFalse, node, "implicit")) return false;
        if (ast.kindName(condition) !== "KindTrueKeyword" && ast.kindName(condition) !== "KindFalseKeyword" &&
          (operations.jsCondition.get(condition)?.kind !== "not-js-value" ||
            getCsharpTypeofRuntimeKind(valueReads.valueRead.get(condition)?.value) !== "boolean")) return false;
        pending.push({ node: whenFalse, element }, { node: whenTrue, element }, { node: condition, element });
        break;
      }
      case "KindIdentifier":
      case "KindPropertyAccessExpression":
      case "KindElementAccessExpression": {
        if (ast.is.IsIdentifier(node) && source.facts.navigation.sourceReferenceFor(node) === undefined &&
          isCsharpAbsenceTargetType(valueReads.valueRead.get(node)?.value)) break;
        const selection = operations.selectedProperty.get(node)?.selection;
        if (selection?.kind === "resolved" && selection.targetMember.csharpLiteral === true) break;
        const declaration = source.facts.navigation.referenceFor(node)?.declaration;
        const constant = declaration === undefined ? undefined : sourceEvidence.constantValue.get(declaration)?.value;
        if (declaration === undefined || ast.kindName(declaration) !== "KindEnumMember" ||
          typeof constant !== "bigint") return false;
        break;
      }
      case "KindArrayLiteralExpression": {
        if (element) return false;
        for (const item of ast.as.AsArrayLiteralExpression(node)?.Elements?.Nodes ?? []) {
          if (item === undefined) return false;
          pending.push({ node: item, element: true });
        }
        break;
      }
      default:
        return false;
      }
    }
    return true;
  }

  function constantConversion(expression: Node, target: Node, mode: "explicit" | "implicit"): boolean {
    const sourceType = valueReads.valueRead.get(expression)?.value;
    const targetType = valueReads.valueRead.get(target)?.value;
    const selection = conversions.expressionConversion.get(expression, sourceType, targetType, mode);
    return selection !== undefined && nativeConstantConversion(selection.selection);
  }
}
