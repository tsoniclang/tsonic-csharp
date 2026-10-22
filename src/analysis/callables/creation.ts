import type { AstReader, Node } from "@tsonic/tsts";
import { HasSyntacticModifier, ModifierFlagsAsync, type SourceLiteralIndex } from "@tsonic/target-api/source";
import { csharpLiteralReturnsFit } from "./return-expressions.js";
import type { CsharpCaptureStorage } from "../../target-model/records/capture-storage.js";
import type { CsharpExpectedTypeClassifications } from "../../target-model/records/expected-types.js";

import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";
import type { CsharpStorageClassifications } from "../../target-model/records/storage.js";
import type { CsharpConversionClassifications } from "../../target-model/records/conversions.js";
import { csharpConversionIsApplicable } from "../../policy/conversions/applicability.js";
import { getCsharpLambdaSignature, getCsharpTaskResultTargetType } from "../../target-model/types/carriers/delegates.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { getCsharpMethodValue } from "../../target-model/types/method-values.js";
import type { CsharpCallableContractIndex } from "../../target-model/records/callable-values.js";
import type { CsharpCallableCreationIndex } from "../../target-model/records/callable-values.js";
import { csharpCallableValueType } from "../../policy/types/callables/value-type.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";

export interface CsharpCallableCreationInput {
  readonly ast: AstReader;
  readonly nodes: readonly Node[];
  readonly captures: Pick<CsharpCaptureStorage, "captureClosure" | "lambdaCreation" | "namedSelf">;
  readonly contracts: CsharpCallableContractIndex;
  readonly expectedTypes: Pick<CsharpExpectedTypeClassifications, "callableTarget">;
  readonly storage: Pick<CsharpStorageClassifications, "lambdaParameterType">;
  readonly evidence: Pick<CsharpSourceEvidenceIndex, "nodeTargetType" | "compileTimeMetadata">;
  readonly conversions: Pick<CsharpConversionClassifications, "conversion">;
  readonly literals: SourceLiteralIndex;
}

export function analyzeCsharpCallableCreations(input: CsharpCallableCreationInput): CsharpCallableCreationIndex {
  const producer = createCsharpCallableCreationProducer();
  for (const node of input.nodes) {
    if (input.evidence.compileTimeMetadata.get(node) ||
      !input.ast.is.IsArrowFunction(node) && !input.ast.is.IsFunctionExpression(node)) continue;
    const allocation = input.captures.lambdaCreation.get(node);
    if (allocation.kind === "discarded") {
      producer.publish(node, Object.freeze({ kind: "discarded" }));
      continue;
    }
    const closure = input.captures.captureClosure.get(node);
    const observedSelf = (input.captures.namedSelf.get(node)?.values.length ?? 0) !== 0;
    const sourceCarrier = input.evidence.nodeTargetType.get(node);
    const contextualCarrier = input.expectedTypes.callableTarget.get(node);
    const contract = input.contracts.get({ kind: "declaration", declaration: node });
    const native = contract === undefined ? undefined : input.contracts.closedInputType(node) ?? csharpCallableValueType(contract);
    const carrier = closure !== undefined ? closure.method.type : observedSelf || getCsharpMethodValue(sourceCarrier) !== undefined ? sourceCarrier
      : contextualCarrier !== undefined && matches(contextualCarrier) ? contextualCarrier : native;
    if (carrier === undefined) {
      producer.publish(node, Object.freeze({ kind: "pending" }));
      continue;
    }
    const valid = getCsharpMethodValue(sourceCarrier) !== undefined && carrier === sourceCarrier || matches(carrier);
    producer.publish(node, valid
      ? Object.freeze({ kind: "selected", carrier })
      : Object.freeze({ kind: "pending" }));

    function matches(candidate: TargetTypeRef): boolean {
      const signature = getCsharpLambdaSignature(candidate);
      const parameters = input.ast.parameters(node);
      if (contract === undefined || signature === undefined || signature.parameterPassingModes.length !== signature.parameters.length ||
        parameters.length > signature.parameters.length ||
        signature.parameterPassingModes.slice(parameters.length).some(mode => mode !== "by-value") ||
        !parameters.every((parameter, index) => {
          if (parameter === undefined) return false;
          const native = contract.parameters[index]?.targetParameter;
          const nativeParameter = input.storage.lambdaParameterType.get(parameter);
          return native !== undefined && nativeParameter !== undefined && targetTypeRefEquals(nativeParameter, signature.parameters[index]!) &&
            native.passingMode === signature.parameterPassingModes[index] &&
            (native.paramsArray === true) === (signature.restParameterIndex === index);
        })) return false;
      const completion = input.conversions.conversion.get(contract.returnType, signature.returnType, "implicit");
      // An async body completes the delegate's task with each returned value, so Func<long, Task<long>> matches the
      // contextual Func<long, Task<long?>> when its result converts implicitly.
      const async = HasSyntacticModifier(input.ast, node, ModifierFlagsAsync);
      const bodyResult = async ? getCsharpTaskResultTargetType(contract.returnType) : undefined;
      const delegateResult = async ? getCsharpTaskResultTargetType(signature.returnType) : undefined;
      const awaited = bodyResult === undefined || delegateResult === undefined ? undefined
        : input.conversions.conversion.get(bodyResult, delegateResult, "implicit");
      // A literal-only body returns through the delegate's own return context, so `() => 9n` matches Func<long>.
      return completion !== undefined && csharpConversionIsApplicable(completion, "implicit") ||
        awaited !== undefined && csharpConversionIsApplicable(awaited, "implicit") ||
        csharpLiteralReturnsFit(input.ast, input.literals, node, signature.returnType);
    }
  }
  return producer.seal();
}

import { createCsharpCallableCreationProducer } from "../program/records/callable-creations.js";
