import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpConversionSelection } from "../../target-model/conversions/selection.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpDelegateContractProducer } from "../program/records/callables/callable-conversions.js";
import { getCsharpCallableValueSignature, getCsharpDelegateSignature } from "../../target-model/types/carriers/delegates.js";
import { getCsharpMethodValue } from "../../target-model/types/method-values.js";
import { getCsharpNullableElementTargetType } from "../../target-model/types/carriers/nullable.js";
import { isCsharpVoidTargetType } from "../../target-model/types/identity.js";
import type { AstReader, Node } from "@tsonic/tsts";
import type { CsharpCaptureStorage } from "../../target-model/records/callables/capture-storage.js";
import type { CsharpConversionIssue } from "../../target-model/records/operations/conversions.js";
import { selectCsharpTypeEmission } from "../../policy/types/resolution/type-emission.js";

export function admitCsharpDelegateEmission(producer: CsharpDelegateContractProducer,
  source: TargetTypeRef, target: TargetTypeRef, selected: CsharpConversionSelection): void {
  if (selected.kind === "nullable-map") { admitCsharpDelegateEmission(producer, selected.sourceElement, selected.targetElement, selected.conversion); return; }
  if (selected.kind === "provider-argument-adapter") {
    admitCsharpDelegateEmission(producer, source, selected.adapter.inputType, selected.sourceToInput);
    admitCsharpDelegateEmission(producer, selected.adapter.resultType, target, selected.resultToTarget);
    return;
  }
  if (selected.kind !== "delegate-adapter" || producer.records.delegateContract.get(source, target) !== undefined) return;
  const sourceMethod = getCsharpMethodValue(source);
  const sourceSignature = sourceMethod !== undefined && sourceMethod.typeParameters.length !== 0
    ? undefined : getCsharpCallableValueSignature(source);
  const targetSignature = getCsharpDelegateSignature(target);
  if (sourceSignature === undefined || targetSignature === undefined)
    failTargetAnalysisInvariant("tsonic-csharp", "An admitted delegate conversion requires its exact native source and destination signatures.");
  producer.publish(source, target, { sourceSignature, targetSignature, targetCarrier: getCsharpNullableElementTargetType(target) ?? target,
    sourceVoid: isCsharpVoidTargetType(sourceSignature.returnType), targetVoid: isCsharpVoidTargetType(targetSignature.returnType) });
  for (const [index, conversion] of selected.parameterConversions.entries()) {
    const input = targetSignature.parameters[index];
    const output = sourceSignature.parameters[index];
    if (input !== undefined && output !== undefined) admitCsharpDelegateEmission(producer, input, output, conversion);
  }
  if (selected.returnConversion.kind !== "void-return")
    admitCsharpDelegateEmission(producer, sourceSignature.returnType, targetSignature.returnType, selected.returnConversion);
}

export function admitCsharpDelegateOperand(ast: AstReader, captures: CsharpCaptureStorage, producer: CsharpDelegateContractProducer,
  node: Node, source: TargetTypeRef, target: TargetTypeRef, selection: CsharpConversionSelection): readonly CsharpConversionIssue[] {
  if (selection.kind !== "delegate-adapter") return [];
  const contract = producer.records.delegateContract.get(source, target)
    ?? failTargetAnalysisInvariant("tsonic-csharp", "An admitted delegate operand requires its exact native conversion contract.", node);
  const refuse = (message: string): readonly CsharpConversionIssue[] => [{ node, code: "CSHARP_UNSUPPORTED_AST", message }];
  if (!selectCsharpTypeEmission({ carrier: source }) || !selectCsharpTypeEmission({ carrier: contract.targetCarrier }))
    return refuse("C# delegate adaptation requires exact renderable source and target signatures.");
  if (contract.targetSignature.parameters.some(carrier => !selectCsharpTypeEmission({ carrier })))
    return refuse("C# delegate adaptation requires renderable exact target parameter types.");
  const lambda = (ast.is.IsArrowFunction(node) || ast.is.IsFunctionExpression(node)) && captures.captureClosure.get(node) === undefined &&
    captures.lambdaCreation.get(node).kind === "inline";
  if (lambda && selection.strategy === "native-binding" && (contract.sourceSignature.returnPassing !== undefined ||
    contract.sourceSignature.parameterPassingModes.some(mode => mode !== "by-value")))
    return refuse("A by-reference native delegate binding requires an exact native method group or delegate value.");
  if (lambda && (!selectCsharpTypeEmission({ carrier: contract.sourceSignature.returnType }) ||
    contract.sourceSignature.parameters.some(carrier => !selectCsharpTypeEmission({ carrier }))))
    return refuse("An adapted lambda requires its exact native function parameters and return type.");
  return [];
}
