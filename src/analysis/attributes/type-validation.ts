import { nativeConstantConversion } from "../../policy/attributes/constant-conversions.js";
import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";

import type { CsharpConversionClassifications, CsharpValueReadClassifications } from "../../target-model/records/conversions.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";
import { getCsharpTypeofRuntimeKind } from "../../policy/operations/syntax/runtime-kind.js";
import { isCsharpAbsenceTargetType } from "../../target-model/types/carriers/runtime-carriers.js";
import { isAstNode, type TargetSourceProgram } from "@tsonic/target-api/source";
import type { TsonicAttributeApplicationFactIndex } from "@tsonic/source-core/facts";

export function diagnoseCsharpAttributeTypeValues(
  source: TargetSourceProgram,
  applications: TsonicAttributeApplicationFactIndex,
): readonly TargetDiagnostic[] {
  const diagnostics: TargetDiagnostic[] = [];
  for (const application of applications.all) {
    const node = application.invocation;
    const semantics = isAstNode(source.ast, node) ? source.semantics.forNode(node) : undefined;
    if (isAstNode(source.ast, node) && source.ast.is.IsNewExpression(node) &&
      semantics?.operations.call(node)?.outcome === "applicable") continue;
    diagnostics.push({
      code: "CSHARP_ATTRIBUTE_CONSTRUCTION_REQUIRED",
      category: "error",
      source: "tsonic-csharp",
      message: "A C# attribute requires an inline lambda containing an exact checked construction: () => new AttributeType(...).",
      ...(isAstNode(source.ast, node) ? { sourceNode: node } : {}),
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
  source: Pick<TargetSourceProgram, "ast" | "navigation">,
  evidence: CsharpAttributeArgumentEvidence,
  invocation: Node,
): readonly CsharpAttributeArgumentRejection[] {
  const { ast } = source;
  const { operations, conversions, valueReads, sourceEvidence } = evidence;
  const construction = operations.selectedConstruction.get(invocation)?.target;
  if (construction?.kind === "resolved" && construction.call.targetMember.csharpInvocation !== undefined) {
    return [{ node: invocation, reason: "selects a special native invocation rather than a native attribute constructor." }];
  }
  if (construction?.kind === "resolved" && (construction.call.sequenceArguments?.length ?? 0) > 0) {
    return [{ node: invocation, reason: "spreads a sequence into the attribute constructor; C# attribute arguments are constant expressions." }];
  }
  const mappings = construction?.kind === "resolved" && construction.call.origin === "provider"
    ? construction.call.argumentMappings : undefined;
  const mappingsByArgument = new Map(mappings?.map(mapping => [mapping.effectiveArgumentIndex, mapping]));
  const rejections: CsharpAttributeArgumentRejection[] = [];
  for (const [index, argument] of (ast.as.AsNewExpression(invocation)?.Arguments?.Nodes ?? []).entries()) {
    if (argument === undefined) continue;
    const mapping = mappingsByArgument.get(index);
    if (mappings !== undefined && (mapping?.kind !== "by-value" || !nativeConstantConversion(mapping.conversion))) {
      rejections.push({ node: argument, reason: `argument ${index + 1} requires a ${
        mapping?.kind === "by-value" ? `'${mapping.conversion.kind}'` : `'${mapping?.kind ?? "missing"}'`} argument conversion, which is not a C# constant conversion.` });
    } else if (!admittedConstant(argument, false)) {
      rejections.push({ node: argument, reason: `argument ${index + 1} is not a C# attribute constant; attribute arguments must be literals, .NET literal fields, native operators over constants, or one-dimensional arrays of them.` });
    }
  }
  return rejections;

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
        if (ast.is.IsIdentifier(node) && source.navigation.sourceReferenceFor(node) === undefined &&
          isCsharpAbsenceTargetType(valueReads.valueRead.get(node)?.value)) break;
        const selection = operations.selectedProperty.get(node)?.selection;
        if (selection?.kind === "resolved" && selection.targetMember.csharpLiteral === true) break;
        const declaration = source.navigation.referenceFor(node)?.declaration;
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
    return selection !== undefined && nativeConstantConversion(selection);
  }
}
