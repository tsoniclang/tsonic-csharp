import type { AstReader, Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpNativeUse } from "../../../target-model/records/native/native-demand.js";
import type { CsharpProgramRecordInput } from "../../program/records/create.js";
import type { CsharpConstructorArgumentEvidence } from "./constructors.js";
import { csharpConstructorBaseCall } from "../../callables/emission/constructor-entry.js";

export function analyzeCsharpConstructorArguments(
  ast: AstReader,
  nodes: readonly Node[],
  records: Omit<CsharpProgramRecordInput, "constructors">,
  admitted: (node: Node) => boolean,
): ReadonlyMap<Node, CsharpConstructorArgumentEvidence> {
  const arguments_ = new Map<Node, CsharpConstructorArgumentEvidence>();
  const sequences = new Map<CsharpNativeUse, boolean>();
  const active = new Set<CsharpNativeUse>();
  const expression = (node: Node): CsharpNativeUse => records.nativeDemand.nativeUse.expression(node)?.use ??
    failTargetAnalysisInvariant("tsonic-csharp", "A constructor argument requires its admitted native expression.", node);
  const childUses = (use: Exclude<CsharpNativeUse, { readonly kind: "erased" }>): readonly CsharpNativeUse[] =>
    use.children.map(site => records.nativeDemand.nativeUse.get(site) ??
      failTargetAnalysisInvariant("tsonic-csharp", "A constructor expression requires every admitted evaluation operand.", use.expression));
  const sequence = (use: CsharpNativeUse): boolean => {
    const previous = sequences.get(use);
    if (previous !== undefined) return previous;
    if (active.has(use)) failTargetAnalysisInvariant("tsonic-csharp", "Constructor native evaluation must be acyclic.", use.expression);
    active.add(use);
    const selected = select(use);
    active.delete(use);
    sequences.set(use, selected);
    return selected;
  };
  const select = (use: CsharpNativeUse): boolean => {
    if (use.kind === "erased" || use.literal !== undefined) return false;
    const node = use.expression;
    const emission = records.expressionEmission.nativeExpression.get(node);
    if (emission?.bottom !== undefined || use.completion.kind === "never") return true;
    if (ast.is.IsArrowFunction(node) || ast.is.IsFunctionExpression(node)) {
      if (records.captureStorage.captureClosure.get(node) !== undefined) return false;
      const creation = records.callableCreations.callableCreation.get(node);
      if (creation?.kind === "discarded") return false;
      if (creation?.kind !== "selected") failTargetAnalysisInvariant("tsonic-csharp", "A constructor callable argument requires its completed native creation fact.", node);
      return creation.allocation.kind !== "quotation" &&
        (creation.allocation.kind !== "inline" || ast.is.IsFunctionExpression(node) && records.captureStorage.namedSelf.get(node) !== undefined);
    }
    if (use.kind === "converted" && emission?.physical !== undefined && emission.physical !== use) {
      return sequence(emission.physical) || use.completion.kind === "void" && emission.physical.completion.kind === "value";
    }
    const children = childUses(use);
    if (ast.is.IsVoidExpression(node)) return children.some(child => child.kind !== "erased" &&
      (child.completion.kind === "value" || sequence(child)));
    if (ast.is.IsConditionalExpression(node)) return children.some(child => sequence(child) ||
      child.kind !== "erased" && child.completion.kind !== "value");
    const binary = use.binary ?? (records.operations.operatorForm.get(node) === "selected"
      ? records.operations.binaryOperation.get(node)?.target : undefined);
    if (binary?.kind === "resolved") {
      const operation = binary.targetOperation;
      const left = expression(binary.left);
      if (left.kind !== "erased" && left.completion.kind === "never") return true;
      if (operation.kind === "conditional-value" && operation.branch === "left") return sequence(left);
      const right = expression(binary.right);
      if (operation.kind === "sequence" || operation.kind === "conditional-value" && operation.branch === "right") {
        return sequence(left) || left.kind !== "erased" && left.completion.kind === "value" || sequence(right);
      }
      if (sequence(left) || sequence(right)) return true;
      if (operation.kind === "conditional-value" || operation.kind === "union-coalesce") {
        return right.kind !== "erased" && right.completion.kind !== "value";
      }
      if (operation.kind === "closed-value-coalesce" || operation.kind === "bigint-call") {
        return operation.assignment && operation.location === "reference-receiver";
      }
      const native = records.binaryEmission.nativeBinaryEmission.get(node, binary);
      if (native?.syntax === "assignment" && native.narrowedCoalescing) return true;
      if (operation.kind === "operator" && operation.operator === "??") {
        return right.kind !== "erased" && right.completion.kind !== "value";
      }
    }
    const mutation = records.operations.jsArrayMutation.get(node);
    if (mutation?.kind === "set-typed-element" && mutation.calculation !== undefined) return true;
    if (ast.is.IsArrayLiteralExpression(node)) {
      const literal = records.arrayLiterals.arrayLiteral.get(node, use.carrier);
      if (literal === undefined) failTargetAnalysisInvariant("tsonic-csharp", "A constructor array operand requires its native construction record.", node);
      if (literal.kind === "collection") return true;
      if (literal.kind === "array" && literal.contributions.some(contribution => contribution.spread)) {
        if (!literal.nativeSpread) return true;
        for (const contribution of literal.contributions) {
          if (!contribution.spread) continue;
          if (records.operations.borrowedSequence.get(contribution.expression) !== undefined) return true;
        }
      }
    }
    if (ast.is.IsObjectLiteralExpression(node) && use.objectShape !== undefined) {
      const literal = records.objectLiterals.objectLiteral.get(use.objectShape, node);
      if (literal?.kind === "native" && (!literal.initialization.inlineUnique || literal.members.some(member =>
        member.kind === "spread" && (member.presence.kind !== "required" || member.fields.length !== 1)))) return true;
    }
    if (ast.is.IsCallExpression(node) || ast.is.IsNewExpression(node)) {
      const arguments_ = records.targetArguments.targetArgumentsEmission.get(node);
      if (arguments_ !== undefined) for (const operand of arguments_.operands) {
        if (operand.kind === "sequence") continue;
        const selected = records.targetArguments.callArgumentEmission.get(operand.expression, operand.parameter, operand.form, operand.mapping);
        if (selected?.kind === "argument-vector") return true;
        if (arguments_.reordered) {
          const argument = expression(operand.expression);
          if (argument.kind !== "erased" && argument.completion.kind === "value" &&
            !records.nativeConstants.nativeConstant.get(operand.expression, argument.completion.type)) return true;
        }
      }
    }
    return use.completion.kind !== "value" || children.some(sequence);
  };
  for (const node of nodes) {
    if (!ast.is.IsConstructorDeclaration(node) || !admitted(node)) continue;
    const baseCall = csharpConstructorBaseCall(ast, node);
    if (baseCall === undefined) continue;
    const selected = records.operations.selectedCall.get(baseCall);
    for (const [index, argument] of ast.arguments(baseCall).entries()) {
      if (argument === undefined) failTargetAnalysisInvariant("tsonic-csharp", "A base constructor requires dense authored arguments.", baseCall);
      const use = expression(argument);
      const passing = records.argumentPassing.argumentPassing.get(argument);
      if (passing === undefined) failTargetAnalysisInvariant("tsonic-csharp", "A base constructor requires its source argument-passing admission.", argument);
      arguments_.set(argument, Object.freeze({
        carrier: selected?.sourceArgumentParameterTypes?.[index] ?? (use.kind === "erased" ? undefined
          : use.kind === "converted" ? use.target : use.completion.kind === "value" ? use.completion.type : use.carrier),
        completion: use.kind === "erased" ? "void" : use.completion.kind,
        passing: passing.passing,
        sequenced: sequence(use),
      }));
    }
  }
  return arguments_;
}
