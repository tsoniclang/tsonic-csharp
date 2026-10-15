import type { Node, SourceFile } from "@tsonic/tsts";
import { isAstNode } from "@tsonic/target-api/source";
import type { TsonicAttributeApplicationFactIndex } from "@tsonic/source-core/facts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { targetBinaryOperator } from "../../policy/operations/index.js";
import { selectCsharpSourceArgumentGrouping } from "../../policy/operations/members/selection/source-argument-groups.js";
import type { ResolvedSourceCallInfo } from "../../target-model/records/members.js";
import type { CsharpJsValueOperationSelection } from "../../target-model/operations/js-values.js";
import type {
  CsharpBinaryClassification,
  CsharpCallForm,
  CsharpNativeHandler,
  CsharpOperationIssue,
  CsharpOperatorForm,
  CsharpPropertyClassification,
  CsharpUnaryClassification,
  CsharpSourceCallArgumentClassification,
} from "../../target-model/records/operations.js";
import type { CsharpSafetyApplicationFactIndex, CsharpSafetyOperation } from "../../target-model/records/safety.js";
import type { CsharpSourceFlowCallSelection } from "../../target-model/records/source-flow.js";
import type { CsharpJsStringConversionSelection } from "../../target-model/records/explicit-js-string.js";
import type { CsharpJsArrayMutationSelection } from "../../target-model/records/js-array-mutations.js";
import type { CsharpMemoryBindingSelection } from "../../target-model/records/memory-bindings.js";
import type { CsharpNativePointerOperationSelection } from "../../target-model/records/native-pointers.js";
import type { CsharpTypedLocationOperationSelection } from "../../target-model/records/typed-locations.js";
import type { CsharpClosedTypeTest } from "../../target-model/operations/type-tests.js";
import {
  csharpDestructuringAssignmentSyntax,
  isCsharpAssignmentOperator,
  sourceOperatorFromKindName,
} from "../../target-model/syntax/operators.js";

export function classifyCsharpSourceCallArguments(
  policy: CsharpPolicyContext,
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
): Pick<CsharpSourceCallArgumentClassification,
  "sourceNativeParameters" | "sourceParameterTypes" | "sourceArgumentParameterTypes" | "sourceArgumentGrouping"> {
  const sourceNativeParameters = policy.types.resolveSourceCallParameters(source, sourceFile);
  const sourceArgumentParameterTypes = Object.freeze(source.sourceArgumentBindings.map(binding =>
    policy.types.resolveSourceCallArgumentParameter(source, binding, sourceFile)));
  return {
    sourceNativeParameters,
    sourceParameterTypes: Object.freeze(source.sourceSelectedSignatureParameters.map((_, index) =>
      policy.types.resolveSourceCallParameter(source, index, sourceFile))),
    sourceArgumentParameterTypes,
    sourceArgumentGrouping: selectCsharpSourceArgumentGrouping(source, sourceNativeParameters, sourceArgumentParameterTypes),
  };
}

export interface CsharpOperationErasureIndexes {
  readonly attributeApplications: TsonicAttributeApplicationFactIndex;
  readonly safetyApplications: Pick<CsharpSafetyApplicationFactIndex, "safetyOperation">;
}

export interface CsharpOperationErasure extends CsharpOperationErasureIndexes {
  readonly demandedInvocations: ReadonlySet<Node>;
  readonly issues: CsharpOperationIssue[];
}

export function createCsharpOperationErasure(
  ast: CsharpPolicyContext["ast"],
  indexes: CsharpOperationErasureIndexes,
  issues: CsharpOperationIssue[],
): CsharpOperationErasure {
  return Object.freeze({
    ...indexes,
    demandedInvocations: new Set(indexes.attributeApplications.all.flatMap(application =>
      isAstNode(ast, application.invocation) ? [application.invocation] : [])),
    issues,
  });
}

export function csharpErasedExpressionStatement(
  ast: CsharpPolicyContext["ast"],
  statement: Node,
  erasure: CsharpOperationErasureIndexes,
): boolean {
  const expression = ast.as.AsExpressionStatement(statement)?.Expression;
  if (expression === undefined) return false;
  if (erasure.attributeApplications.forSubject(expression) !== undefined) return true;
  const safety = erasure.safetyApplications.safetyOperation.get(expression);
  return safety?.kind === "safety-builder" ||
    safety?.kind === "unsafe-context" && safety.fact.kind === "remaining-block";
}

export function selectCsharpNativeHandler(
  memoryBinding: CsharpMemoryBindingSelection | undefined,
  safety: CsharpSafetyOperation | undefined,
  jsStringConversion: CsharpJsStringConversionSelection | undefined,
  nativePointer: CsharpNativePointerOperationSelection | undefined,
  typedLocation: CsharpTypedLocationOperationSelection | undefined,
): CsharpNativeHandler | undefined {
  if (memoryBinding !== undefined) return "memory-binding";
  if (safety !== undefined) return "explicit-safety";
  if (jsStringConversion !== undefined && jsStringConversion.kind !== "not-js-string-conversion") return "js-string-conversion";
  if (nativePointer !== undefined && nativePointer.kind !== "not-native-pointer") return "native-pointer";
  return typedLocation !== undefined && typedLocation.kind !== "not-typed-location" ? "typed-location" : undefined;
}

export function selectCsharpCallForm(
  typeTest: CsharpClosedTypeTest | undefined,
  sourceFlow: CsharpSourceFlowCallSelection,
  jsValue: CsharpJsValueOperationSelection,
): CsharpCallForm {
  return Object.freeze(typeTest !== undefined ? { kind: "type-test" as const, typeTest }
    : sourceFlow.kind === "keep-alive"
    ? { kind: "keep-alive" as const, sourceFlow: Object.freeze({ kind: "keep-alive" as const, valueExpression: sourceFlow.valueExpression }) }
    : jsValue.kind !== "not-js-value" ? { kind: "js-value" as const, operation: jsValue }
    : { kind: "target" as const });
}

export function selectCsharpOperatorForm(
  ast: CsharpPolicyContext["ast"],
  node: Node,
  mutation: CsharpJsArrayMutationSelection | undefined,
  binary: CsharpBinaryClassification | undefined,
  unary: CsharpUnaryClassification | undefined,
  property: (subject: Node) => CsharpPropertyClassification | undefined,
): CsharpOperatorForm {
  const operator = sourceOperatorFromKindName(ast.operatorKindName(node));
  if (!ast.is.IsBinaryExpression(node)) {
    if (mutation === undefined || mutation.kind !== "not-js-array-mutation") return "js-array-mutation";
    const operand = ast.is.IsPrefixUnaryExpression(node)
      ? ast.as.AsPrefixUnaryExpression(node)?.Operand
      : ast.as.AsPostfixUnaryExpression(node)?.Operand;
    if ((operator === "++" || operator === "--") && operand !== undefined && ast.is.IsPropertyAccessExpression(operand)) {
      const operandProperty = property(operand);
      const shapeProperty = operandProperty?.sourceOwned?.jsValueProperty;
      if (operandProperty?.selection.kind === "source-owned" &&
        (shapeProperty === undefined || shapeProperty.kind !== "not-js-value-object-shape")) return "js-value-object-shape-update";
    }
    return operator !== undefined && (unary === undefined || unary.jsValue.kind !== "not-js-value")
      ? "js-value-operation" : "selected";
  }
  if (csharpDestructuringAssignmentSyntax(ast, node) !== undefined) return "destructuring-assignment";
  if (mutation === undefined || mutation.kind !== "not-js-array-mutation") return "js-array-mutation";
  if (operator === "instanceof") return "type-test";
  const expression = ast.as.AsBinaryExpression(node);
  const left = expression?.Left;
  const operands = left !== undefined && expression?.Right !== undefined;
  if (operands && operator !== undefined && operator !== "=" && (binary === undefined || binary.jsValue.kind !== "not-js-value")) {
    return "js-value-operation";
  }
  if ((operator === "===" || operator === "==" || operator === "!==" || operator === "!=") &&
    binary?.typeofComparison !== undefined) return "typeof-comparison";
  if (left === undefined || !operands || operator === undefined || !isCsharpAssignmentOperator(operator) ||
    targetBinaryOperator(operator) === undefined) return "selected";
  if (ast.is.IsPropertyAccessExpression(left)) {
    const leftProperty = property(left);
    if (leftProperty === undefined) return "selected";
    const shapeProperty = leftProperty.sourceOwned?.jsValueProperty;
    if (leftProperty.selection.kind === "source-owned" && ast.as.AsPropertyAccessExpression(left)?.Expression !== undefined &&
      (shapeProperty === undefined || shapeProperty.kind !== "not-js-value-object-shape")) return "js-value-write";
    if (operator !== "=") return "selected";
    return binary?.propertyWrite === undefined || binary.propertyWrite.kind !== "not-js-value" ? "js-value-write" : "selected";
  }
  if (ast.is.IsElementAccessExpression(left)) {
    return binary?.elementWrite === undefined || binary.elementWrite.kind !== "not-js-value" ? "js-value-write" : "selected";
  }
  return "selected";
}
