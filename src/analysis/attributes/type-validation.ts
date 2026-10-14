import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpConversionSelection } from "../../target-model/conversions/selection.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
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

export function admitCsharpAttributeArguments(
  policy: CsharpPolicyContext,
  operations: CsharpTargetOperationClassifications,
  invocation: Node,
): readonly CsharpAttributeArgumentRejection[] {
  const { ast } = policy;
  const construction = operations.selectedConstruction.get(invocation)?.target;
  if (construction?.kind === "resolved" && construction.call.targetMember.csharpInvocation?.kind === "static-factory-construction") {
    return [{ node: invocation, reason: "selects a static factory rather than a native attribute constructor." }];
  }
  if (construction?.kind === "resolved" && (construction.call.sequenceArguments?.length ?? 0) > 0) {
    return [{ node: invocation, reason: "spreads a sequence into the attribute constructor; C# attribute arguments are constant expressions." }];
  }
  const mappings = construction?.kind === "resolved" && construction.call.origin === "provider"
    ? construction.call.argumentMappings : undefined;
  const rejections: CsharpAttributeArgumentRejection[] = [];
  for (const [index, argument] of (ast.as.AsNewExpression(invocation)?.Arguments?.Nodes ?? []).entries()) {
    if (argument === undefined) continue;
    const mapping = mappings?.find(candidate => candidate.effectiveArgumentIndex === index);
    if (mappings !== undefined && (mapping?.kind !== "by-value" || !nativeConstantConversion(mapping.conversion))) {
      rejections.push({ node: argument, reason: `argument ${index + 1} requires a ${
        mapping?.kind === "by-value" ? `'${mapping.conversion.kind}'` : `'${mapping?.kind ?? "missing"}'`} argument conversion, which is not a C# constant conversion.` });
    } else if (!admittedConstant(argument, false)) {
      rejections.push({ node: argument, reason: `argument ${index + 1} is not a C# attribute constant; attribute arguments must be literals, .NET literal fields, native operators over constants, or one-dimensional arrays of them.` });
    }
  }
  return rejections;

  function admittedConstant(node: Node, element: boolean): boolean {
    switch (ast.kindName(node)) {
      case "KindStringLiteral":
      case "KindNoSubstitutionTemplateLiteral":
      case "KindNumericLiteral":
      case "KindTrueKeyword":
      case "KindFalseKeyword":
      case "KindNullKeyword":
        return true;
      case "KindParenthesizedExpression": {
        const inner = ast.as.AsParenthesizedExpression(node)?.Expression;
        return inner !== undefined && admittedConstant(inner, element);
      }
      case "KindAsExpression": {
        const inner = ast.as.AsAsExpression(node)?.Expression;
        return inner !== undefined && admittedConstant(inner, element) && sameResolvedType(inner, node);
      }
      case "KindPrefixUnaryExpression": {
        const unary = operations.unaryOperation.get(node);
        return unary?.jsValue.kind === "not-js-value" && unary.target.kind === "resolved" &&
          (unary.target.sourceOperator === "-" || unary.target.sourceOperator === "+" ||
            unary.target.sourceOperator === "~" || unary.target.sourceOperator === "!") &&
          admittedConstant(unary.target.operand, element);
      }
      case "KindBinaryExpression": {
        const binary = operations.binaryOperation.get(node);
        return binary?.jsValue.kind === "not-js-value" && binary.target.kind === "resolved" &&
          binary.target.targetOperation.kind === "operator" &&
          admittedConstant(binary.target.left, element) && admittedConstant(binary.target.right, element);
      }
      case "KindConditionalExpression": {
        const conditional = ast.as.AsConditionalExpression(node);
        const branches = [conditional?.WhenTrue, conditional?.WhenFalse];
        return conditional?.Condition !== undefined && admittedConstant(conditional.Condition, element) &&
          branches.every(branch => branch !== undefined && admittedConstant(branch, element) && sameResolvedType(branch, node));
      }
      case "KindIdentifier":
      case "KindPropertyAccessExpression":
      case "KindElementAccessExpression": {
        const selection = operations.selectedProperty.get(node)?.selection;
        return selection?.kind === "resolved" && selection.targetMember.csharpLiteral === true;
      }
      case "KindArrayLiteralExpression":
        return !element && (ast.as.AsArrayLiteralExpression(node)?.Elements?.Nodes ?? []).every(item =>
          item !== undefined && admittedConstant(item, true));
      default:
        return false;
    }
  }

  function sameResolvedType(left: Node, right: Node): boolean {
    const leftType = policy.types.resolveNode(left, ast.getSourceFile(left));
    const rightType = policy.types.resolveNode(right, ast.getSourceFile(right));
    return leftType !== undefined && rightType !== undefined && targetTypeRefEquals(leftType, rightType);
  }
}

function nativeConstantConversion(conversion: CsharpConversionSelection): boolean {
  switch (conversion.kind) {
    case "identity":
      return true;
    case "implicit":
      return conversion.proof === "literal" || conversion.proof === "numeric" ||
        conversion.proof === "reference" || conversion.proof === "nullable";
    case "cast":
      return conversion.proof === "numeric" || conversion.proof === "reference" || conversion.proof === "nullable";
    default:
      return false;
  }
}
