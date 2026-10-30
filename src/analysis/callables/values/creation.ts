import type { Node } from "@tsonic/tsts";
import { HasSyntacticModifier, ModifierFlagsAsync, sourceCallableDefinitionIsDiscarded,
  sourceExpressionCallArgument, sourceExpressionResultDisposition,
  type SourceLiteralIndex, type TargetSourceProgram } from "@tsonic/target-api/source";
import { csharpLiteralReturnsFit } from "../calls/return-expressions.js";
import type { CsharpCaptureStorage } from "../../../target-model/records/callables/capture-storage.js";

import type { CsharpSourceEvidenceIndex } from "../../../target-model/records/program/source-evidence.js";
import type { CsharpStorageClassifications } from "../../../target-model/records/storage/storage.js";
import type { CsharpConversionClassifications } from "../../../target-model/records/operations/conversions.js";
import { csharpConversionIsApplicable } from "../../../policy/conversions/applicability.js";
import { csharpArgumentVectorCallbackResultMatches } from "../../../policy/conversions/callable-completions.js";
import { getCsharpLambdaSignature, getCsharpTaskResultTargetType, getCsharpExpressionTreeDelegateType } from "../../../target-model/types/carriers/delegates.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { getCsharpMethodValue } from "../../../target-model/types/method-values.js";
import type { CsharpCallableContractIndex } from "../../../target-model/records/callables/callable-values.js";
import type { CsharpCallableCreationIndex } from "../../../target-model/records/callables/callable-values.js";
import { csharpCallableValueType } from "../../../policy/types/callables/value-type.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpTargetOperationClassifications } from "../../../target-model/records/operations/operations.js";
import type { CsharpNativeCallableAllocation } from "../../../target-model/records/native/native-demand.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";

export interface CsharpCallableCreationInput {
  readonly source: TargetSourceProgram;
  readonly nodes: readonly Node[];
  readonly captures: Pick<CsharpCaptureStorage, "captureClosure" | "lexicalCaptures" | "namedSelf">;
  readonly contracts: CsharpCallableContractIndex;
  readonly operations: Pick<CsharpTargetOperationClassifications, "selectedCall" | "selectedConstruction">;
  readonly storage: Pick<CsharpStorageClassifications, "lambdaParameterType" | "storageType">;
  readonly evidence: Pick<CsharpSourceEvidenceIndex, "nodeTargetType" | "contextualType" | "compileTimeMetadata">;
  readonly conversions: Pick<CsharpConversionClassifications, "conversion">;
  readonly literals: SourceLiteralIndex;
}

export function analyzeCsharpCallableCreations(input: CsharpCallableCreationInput): CsharpCallableCreationIndex {
  const producer = createCsharpCallableCreationProducer();
  const { ast } = input.source;
  for (const node of input.nodes) {
    if (input.evidence.compileTimeMetadata.get(node) ||
      !ast.is.IsArrowFunction(node) && !ast.is.IsFunctionExpression(node)) continue;
    if (sourceCallableDefinitionIsDiscarded(node, ast, input.source.navigation)) {
      producer.publish(node, Object.freeze({ kind: "discarded" }));
      continue;
    }
    const captures = input.captures.lexicalCaptures.find(candidate => candidate.owner === node);
    if (captures === undefined || captures.values.some(value => value.type === undefined) ||
      captures.receivers.some(receiver => receiver.type === undefined)) {
      producer.publish(node, Object.freeze({ kind: "pending" }));
      continue;
    }
    const closure = input.captures.captureClosure.get(node);
    const observedSelf = (input.captures.namedSelf.get(node)?.values.length ?? 0) !== 0;
    const sourceCarrier = input.evidence.nodeTargetType.get(node);
    const argument = sourceExpressionCallArgument(node, input.source);
    const operation = argument === undefined ? undefined : ast.is.IsNewExpression(argument.call)
      ? input.operations.selectedConstruction.get(argument.call) : input.operations.selectedCall.get(argument.call);
    const nativeArguments = operation?.sourceArgumentParameterTypes;
    const checked = argument === undefined ? undefined : input.source.semantics.forNode(argument.call).operations.call(argument.call);
    const nativeBindings = checked?.sourceArgumentBindings.filter(binding =>
      argument !== undefined && binding.sourceArgumentIndex === argument.argumentIndex && binding.sourceForm === "value" &&
      checked.sourceArguments[binding.sourceArgumentIndex]?.expression === argument.argument) ?? [];
    const immediate = nativeBindings.length === 1 ? nativeArguments?.[checked!.sourceArgumentBindings.indexOf(nativeBindings[0]!)] : undefined;
    if (argument !== undefined && immediate === undefined) {
      producer.publish(node, Object.freeze({ kind: "pending" }));
      continue;
    }
    const disposition = sourceExpressionResultDisposition(ast, node);
    const contextual = argument !== undefined ? immediate
      : disposition.kind === "stored" && ast.is.IsVariableDeclaration(disposition.use)
        ? input.storage.storageType.get(disposition.use)
        : input.evidence.contextualType.get(node)?.targetType;
    const contextualCarrier = getCsharpNullableElementTargetType(contextual) ?? contextual;
    const contract = input.contracts.get({ kind: "declaration", declaration: node });
    const closed = input.contracts.closedInputType(node);
    const native = contract === undefined ? undefined : closed ?? csharpCallableValueType(contract);
    const asynchronous = HasSyntacticModifier(ast, node, ModifierFlagsAsync);
    const carrier = closure !== undefined ? closure.method.type
      : closed !== undefined && (contract?.bodyInputs !== undefined || contract?.nativeParameters.some(parameter => parameter.targetParameter.optional === true)) ? closed
      : observedSelf || getCsharpMethodValue(sourceCarrier) !== undefined ? sourceCarrier
      : contextualCarrier !== undefined && (!asynchronous ||
        getCsharpTaskResultTargetType(getCsharpLambdaSignature(contextualCarrier)?.returnType) !== undefined) &&
        matches(contextualCarrier) ? contextualCarrier : native;
    if (carrier === undefined || contract === undefined) {
      producer.publish(node, Object.freeze({ kind: "pending" }));
      continue;
    }
    const valid = getCsharpMethodValue(sourceCarrier) !== undefined && carrier === sourceCarrier || matches(carrier);
    const staticBody = captures.values.length === 0 && captures.receivers.length === 0 && !observedSelf;
    const selectedArgument = operation?.target;
    const invocationOnly = argument !== undefined && selectedArgument?.kind === "resolved" &&
      selectedArgument.call.origin === "source-profile" &&
      selectedArgument.call.invocationOnlyCallableArgumentIndexes?.includes(argument.argumentIndex) === true &&
      selectedArgument.call.arguments.filter(binding => binding.sourceArgumentIndex === argument.argumentIndex).length === 1 &&
      selectedArgument.call.arguments.some(binding => binding.sourceArgumentIndex === argument.argumentIndex && binding.sourceForm === "value");
    const direct = disposition.kind === "consumed" && ast.is.IsCallExpression(disposition.use);
    const allocation: CsharpNativeCallableAllocation = Object.freeze(
      getCsharpExpressionTreeDelegateType(carrier) !== undefined ? { kind: "quotation", staticBody: false }
        : observedSelf ? { kind: "fresh", staticBody: false }
        : invocationOnly || direct ? staticBody ? { kind: "cached", staticBody: true }
          : { kind: direct ? "direct" : "inline", staticBody: false }
          : { kind: "fresh", staticBody });
    producer.publish(node, valid
      ? Object.freeze({ kind: "selected", carrier, allocation })
      : Object.freeze({ kind: "pending" }));

    function matches(candidate: TargetTypeRef): boolean {
      const signature = getCsharpLambdaSignature(candidate);
      const parameters = contract?.nativeParameters;
      const tupleIndexes = new Map<Node, number>();
      if (contract === undefined || parameters === undefined || signature === undefined || signature.parameterPassingModes.length !== signature.parameters.length ||
        parameters.length > signature.parameters.length ||
        signature.parameterPassingModes.slice(parameters.length).some(mode => mode !== "by-value") ||
        !parameters.every((parameter, index) => {
          const node = parameter.sourceParameter;
          const native = parameter.targetParameter;
          const incoming = input.storage.lambdaParameterType.get(node);
          const tuple = ast.as.AsParameterDeclaration(node)?.DotDotDotToken !== undefined && incoming?.kind === "tuple";
          const tupleIndex = tupleIndexes.get(node) ?? 0;
          if (tuple) tupleIndexes.set(node, tupleIndex + 1);
          const nativeParameter = contract.bodyInputs !== undefined ? native.type
            : tuple && incoming?.kind === "tuple" ? incoming.elements[tupleIndex] : incoming;
          return native !== undefined && nativeParameter !== undefined && targetTypeRefEquals(nativeParameter, signature.parameters[index]!) &&
            native.passingMode === signature.parameterPassingModes[index] &&
            (native.paramsArray === true) === (signature.restParameterIndex === index);
        })) return false;
      const completion = input.conversions.conversion.get(contract.returnType, signature.returnType, "implicit");
      // An async body completes the delegate's task with each returned value, so Func<long, Task<long>> matches the
      // contextual Func<long, Task<long?>> when its result converts implicitly.
      const bodyResult = asynchronous ? getCsharpTaskResultTargetType(contract.returnType) : undefined;
      const delegateResult = asynchronous ? getCsharpTaskResultTargetType(signature.returnType) : undefined;
      const awaited = bodyResult === undefined || delegateResult === undefined ? undefined
        : input.conversions.conversion.get(bodyResult, delegateResult, "implicit");
      // A literal-only body returns through the delegate's own return context, so `() => 9n` matches Func<long>.
      return csharpArgumentVectorCallbackResultMatches(contract.returnType, signature.returnType) ||
        completion !== undefined && csharpConversionIsApplicable(completion, "implicit") ||
        awaited !== undefined && csharpConversionIsApplicable(awaited, "implicit") ||
        csharpLiteralReturnsFit(ast, input.literals, node, signature.returnType, expression => input.source.semantics.forNode(expression));
    }
  }
  return producer.seal();
}

import { createCsharpCallableCreationProducer } from "../../program/records/callables/callable-creations.js";
