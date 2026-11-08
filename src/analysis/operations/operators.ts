import type { Node } from "@tsonic/tsts";
import type { SourceOperation, SourceValueOperand } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpRepresentationOutcome } from "../../target-model/types/representation.js";
import type { CsharpOperationSelection, CsharpResolvedBinaryOperation, CsharpResolvedDestructuringAssignmentOperation, CsharpResolvedUnaryOperation } from "../../target-model/records/operations/operator-selection.js";
import type { TargetTypeRef } from "../../target-model/types/native-type-data.js";
import type { CsharpSourceOperator } from "../../target-model/syntax/operators.js";
import { isCsharpDestructuringAssignmentPattern, csharpSourcePrimitiveOperators } from "../../target-model/syntax/operators.js";
import { csharpSourcePrimitiveTargetType } from "../../target-model/types/carriers/scalar-types.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { selectCsharpNativeBinaryOperation, selectCsharpNativeUnaryOperation, rejectCsharpOperator as rejected, csharpBinaryOperationRequiresLocation } from "../../policy/operations/operators/rules.js";
import { selectCsharpGenericNumericOperation } from "./numeric/generic.js";
import { selectCsharpAssignmentLocation } from "./assignment-location.js";
import { selectCsharpExactLiteralConversion } from "../../policy/conversions/literals.js";

export type CsharpOperationTargetTypeQuery = (node: Node) => TargetTypeRef | undefined;

export function selectCsharpBinaryOperation(
  input: CsharpPolicyContext, node: Node, targetTypeFor: CsharpOperationTargetTypeQuery,
): CsharpOperationSelection<CsharpResolvedBinaryOperation> {
  const publication = input.facts.values.operation(node);
  if (publication.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: publication });
  const source = publication.value;
  if (source.occurrence !== node) failTargetAnalysisInvariant("tsonic-csharp", "An operator requires its identical published Source occurrence.", node);
  const result = input.representation.represent(source.result, "value", node);
  if (result.kind !== "represented") return result;
  const resultType = result.value.carrier;
  if (source.kind === "and" || source.kind === "or" || source.kind === "coalesce") {
    const left = operand(input, source.control, targetTypeFor);
    if (left.kind !== "represented") return left;
    if (source.disposition === "left") return Object.freeze({ kind: "resolved",
      sourceOperator: source.kind === "and" ? "&&" : source.kind === "or" ? "||" : "??", left: source.control.occurrence,
      right: undefined,
      leftType: left.value, rightType: undefined, leftInputType: left.value,
      rightInputType: undefined, resultType: left.value,
      targetOperation: Object.freeze({ kind: "conditional-value", operator: source.kind === "and" ? "&&" : source.kind === "or" ? "||" : "??", branch: "left" }) });
    const rightSource = source.kind === "and" ? source.whenTrue : source.kind === "or" ? source.whenFalse : source.whenAbsent;
    if (rightSource.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: rightSource });
    const right = operand(input, rightSource.value, targetTypeFor);
    if (right.kind !== "represented") return right;
    if (source.kind === "coalesce" && source.disposition === "right") return Object.freeze({ kind: "resolved",
      sourceOperator: "??", left: source.control.occurrence, right: rightSource.value.occurrence,
      leftType: left.value, rightType: right.value, leftInputType: left.value, rightInputType: resultType, resultType,
      targetOperation: Object.freeze({ kind: "conditional-value", operator: "??", branch: "right" }) });
    return selectCsharpBinaryOperands(input, source.control.occurrence, rightSource.value.occurrence,
      source.kind === "and" ? "&&" : source.kind === "or" ? "||" : "??", resultType,
      occurrence => occurrence === source.control.occurrence ? left.value : occurrence === rightSource.value.occurrence ? right.value : targetTypeFor(occurrence),
      source.disposition);
  }
  if (source.kind === "assignment") {
    const destination = input.representation.represent(source.destination.applied, "storage", source.target);
    if (destination.kind !== "represented") return destination;
    const right = operand(input, source.source, targetTypeFor);
    if (right.kind !== "represented") return right;
    return selectCsharpBinaryOperands(input, source.target, source.source.occurrence, "=", resultType,
      occurrence => occurrence === source.target ? destination.value.carrier : occurrence === source.source.occurrence ? right.value : targetTypeFor(occurrence));
  }
  if (source.kind === "compound") {
    const left = operand(input, source.operands[0], targetTypeFor);
    if (left.kind !== "represented") return left;
    const right = operand(input, source.operands[1], targetTypeFor);
    if (right.kind !== "represented") return right;
    const destination = input.representation.represent(source.destination.applied, "storage", source.target);
    if (destination.kind !== "represented") return destination;
    const calculation = input.representation.represent(source.calculation, "value", node);
    if (calculation.kind !== "represented") return calculation;
    const operator = csharpSourcePrimitiveOperators[source.operator];
    if (!compoundOperators.has(operator)) return rejected("The published Source compound operator has no legal Native read-modify-write law.");
    const selected = selectCsharpBinaryOperands(input, source.operands[0].occurrence, source.operands[1].occurrence,
      operator, calculation.value.carrier,
      occurrence => occurrence === source.operands[0].occurrence ? left.value : occurrence === source.operands[1].occurrence ? right.value : targetTypeFor(occurrence));
    if (selected.kind !== "resolved") return selected;
    const target = selected.targetOperation;
    const location = selectCsharpAssignmentLocation(input, source.target, targetTypeFor);
    const assigned = target.kind === "operator" ? { kind: "operator" as const, operator: `${target.operator}=` }
      : target.kind === "generic-numeric" ? { ...target, operator: `${target.operator}=` }
      : target.kind === "bigint-call" ? { ...target, assignment: true, location } : undefined;
    if (assigned === undefined) return rejected("The selected Native calculation has no corresponding exact compound assignment law.");
    return Object.freeze({ ...selected, left: source.target, leftType: left.value, resultType,
      sourceOperator: `${operator}=` as CsharpSourceOperator, targetOperation: Object.freeze(assigned),
      compound: Object.freeze({ storage: source.target, readType: left.value,
        storageType: destination.value.carrier, calculation: selected }) });
  }
  if (source.kind === "sequence") {
    const values: { readonly occurrence: Node; readonly carrier: TargetTypeRef }[] = [];
    for (const value of source.operands) {
      const selected = operand(input, value, targetTypeFor);
      if (selected.kind !== "represented") return selected;
      values.push(Object.freeze({ occurrence: value.occurrence, carrier: selected.value }));
    }
    const first = values[0];
    const last = values.at(-1);
    if (first === undefined || last === undefined) failTargetAnalysisInvariant("tsonic-csharp", "A Source sequence requires its complete nonempty evaluation vector.", node);
    return Object.freeze({ kind: "resolved", sourceOperator: ",", left: first.occurrence, right: last.occurrence,
      leftType: first.carrier, rightType: last.carrier, leftInputType: first.carrier, rightInputType: resultType, resultType,
      targetOperation: Object.freeze({ kind: "sequence", operands: Object.freeze(values),
        resultUse: input.facts.navigation.expressionResultUse(last.occurrence) }) });
  }
  const operands = source.kind === "binary" ? source.operands
    : source.kind === "in" || source.kind === "instanceof" ? [source.left, source.right] : undefined;
  if (operands?.length !== 2 || operands[0] === undefined || operands[1] === undefined) return rejected(
    "A Native binary operation requires its complete original Source binary operand record.");
  const left = operand(input, operands[0], targetTypeFor);
  if (left.kind !== "represented") return left;
  const right = operand(input, operands[1], targetTypeFor);
  if (right.kind !== "represented") return right;
  const operator = source.kind === "binary" ? csharpSourcePrimitiveOperators[source.operator] : source.kind;
  return selectCsharpBinaryOperands(input, operands[0].occurrence, operands[1].occurrence, operator, resultType,
    occurrence => occurrence === operands[0]!.occurrence ? left.value : occurrence === operands[1]!.occurrence ? right.value : targetTypeFor(occurrence));
}

export function selectCsharpBinaryOperands(
  input: CsharpPolicyContext, left: Node, right: Node, sourceOperator: CsharpSourceOperator,
  resultType: TargetTypeRef | undefined, targetTypeFor: CsharpOperationTargetTypeQuery,
  disposition?: "left" | "right" | "dynamic",
): CsharpOperationSelection<CsharpResolvedBinaryOperation> {
  const leftType = targetTypeFor(left);
  const rightType = targetTypeFor(right);
  if (leftType === undefined || rightType === undefined || resultType === undefined) return rejected(
    "The Native operation requires the actual physical carrier of every evaluated operand and its published result.");
  const leftScalar = input.literals.scalar(left);
  if (leftScalar.kind !== "represented") return leftScalar;
  const rightScalar = input.literals.scalar(right);
  if (rightScalar.kind !== "represented") return rightScalar;
  return selectCsharpNativeBinaryOperation(input, { left, right, sourceOperator, resultType, leftType, rightType, disposition,
    leftScalar: leftScalar.value, rightScalar: rightScalar.value,
    genericNumeric: selectCsharpGenericNumericOperation(input, sourceOperator, left, right, leftType, rightType),
    leftStorage: leftType, rightStorage: rightType,
    resultUse: sourceOperator === "," ? input.facts.navigation.expressionResultUse(right) : undefined,
    assignmentLocation: csharpBinaryOperationRequiresLocation(sourceOperator, leftType, rightType)
      ? selectCsharpAssignmentLocation(input, left, targetTypeFor) : "unsupported" });
}

export function selectCsharpDestructuringAssignmentOperation(
  input: CsharpPolicyContext, node: Node, targetTypeFor: CsharpOperationTargetTypeQuery,
): CsharpOperationSelection<CsharpResolvedDestructuringAssignmentOperation> {
  const publication = input.facts.values.operation(node);
  if (publication.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: publication });
  if (publication.value.kind !== "assignment" || !isCsharpDestructuringAssignmentPattern(input.ast, publication.value.target)) return rejected(
    "A destructuring assignment requires its exact original Source assignment publication.");
  const assignment = publication.value;
  input.representation.source.assertEvidence(assignment.result);
  const source = operand(input, assignment.source, targetTypeFor);
  if (source.kind !== "represented") return source;
  return Object.freeze({ kind: "resolved", sourceOperator: "=", targetOperation: { kind: "operator", operator: "=" },
    pattern: assignment.target, source: assignment.source.occurrence, sourceType: source.value, resultType: source.value });
}

export function selectCsharpUnaryOperation(
  input: CsharpPolicyContext, node: Node, targetTypeFor: CsharpOperationTargetTypeQuery,
): CsharpOperationSelection<CsharpResolvedUnaryOperation> {
  const publication = input.facts.values.operation(node);
  if (publication.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: publication });
  const source = publication.value;
  const selectedOperand = source.kind === "update" ? source.operand : source.kind === "unary" ? source.operands[0] : undefined;
  if (selectedOperand === undefined) return rejected("A Native unary operation requires its original Source unary or update record.");
  const result = input.representation.represent(source.result, "value", node);
  if (result.kind !== "represented") return result;
  const operator = source.kind === "update" ? source.operator === "increment" ? "++" : "--"
    : source.kind === "unary" ? csharpSourcePrimitiveOperators[source.operator] : undefined;
  if (operator !== "++" && operator !== "--" && operator !== "!" && operator !== "~" && operator !== "+" && operator !== "-") return rejected(
    "The published Source unary operator has no selected Native law.");
  if (source.kind === "unary" && (operator === "+" || operator === "-")) {
    let syntax = selectedOperand.occurrence;
    while (input.ast.is.IsParenthesizedExpression(syntax)) {
      const inner = input.ast.as.AsParenthesizedExpression(syntax)?.Expression;
      if (inner === undefined) break;
      syntax = inner;
    }
    if (input.ast.is.IsNumericLiteral(syntax) || input.ast.is.IsBigIntLiteral(syntax)) {
      const unit = input.facts.descriptors.scalarLiteral(source.result);
      if (unit.kind === "present") {
        const literal = selectCsharpExactLiteralConversion(unit.value, undefined, result.value.carrier);
        if (literal.kind === "resolved") return Object.freeze({ kind: "literal", sourceOperator: operator,
          resultType: result.value.carrier, recipe: literal.recipe });
        if (literal.kind === "rejected") return rejected(literal.reason);
      }
    }
  }
  const selected = operand(input, selectedOperand, targetTypeFor);
  if (selected.kind !== "represented") return selected;
  const destination = source.kind === "update"
    ? input.representation.represent(source.destination.applied, "storage", selectedOperand.occurrence) : undefined;
  if (destination !== undefined && destination.kind !== "represented") return destination;
  const selectedOperation = selectCsharpNativeUnaryOperation(input, operator, selectedOperand.occurrence,
    selected.value, result.value.carrier, source.kind === "update" ? source.form : "prefix");
  return selectedOperation.kind !== "resolved" || destination === undefined ? selectedOperation
    : Object.freeze({ ...selectedOperation, storageType: destination.value.carrier });
}

function operand(input: CsharpPolicyContext, value: SourceValueOperand,
  physical: CsharpOperationTargetTypeQuery): CsharpRepresentationOutcome<TargetTypeRef> {
  input.representation.source.assertEvidence(value.value);
  const carrier = physical(value.occurrence);
  return carrier === undefined ? Object.freeze({ kind: "native-refused", source: "tsonic-csharp",
    code: "CSHARP_OPERATOR_OPERAND_ABI_MISSING", site: value.occurrence,
    message: "An evaluated Source operand requires its completed physical Native value carrier." })
    : Object.freeze({ kind: "represented", value: carrier });
}

const compoundOperators = new Set<string>(["+", "-", "*", "/", "%", "**", "&", "|", "^", "<<", ">>", ">>>"]);
