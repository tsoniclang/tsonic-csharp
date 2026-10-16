import type { AstReader, Node } from "@tsonic/tsts";
import type { CsharpCaptureStorage } from "../../target-model/records/capture-storage.js";
import type { CsharpExpectedTypeClassifications } from "../../target-model/records/expected-types.js";
import type { CsharpNativeCallableCreation } from "../../target-model/records/native-demand.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";
import type { CsharpStorageClassifications } from "../../target-model/records/storage.js";
import type { CsharpConversionClassifications } from "../../target-model/records/conversions.js";
import { csharpConversionIsApplicable } from "../../target-model/conversions/selection.js";
import { getCsharpLambdaSignature } from "../../target-model/types/carriers/delegates.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { getCsharpMethodValue } from "../../target-model/types/method-values.js";
import type { CsharpCallableContractIndex, CsharpCallableCreationIndex } from "./model.js";
import { csharpCallableValueType } from "./value-type.js";
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
}

export function analyzeCsharpCallableCreations(input: CsharpCallableCreationInput): CsharpCallableCreationIndex {
  const creations = new WeakMap<Node, CsharpNativeCallableCreation>();
  for (const node of input.nodes) {
    if (input.evidence.compileTimeMetadata.get(node) ||
      !input.ast.is.IsArrowFunction(node) && !input.ast.is.IsFunctionExpression(node)) continue;
    const allocation = input.captures.lambdaCreation.get(node);
    if (allocation.kind === "discarded") {
      creations.set(node, Object.freeze({ kind: "discarded" }));
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
      creations.set(node, Object.freeze({ kind: "pending" }));
      continue;
    }
    const valid = getCsharpMethodValue(sourceCarrier) !== undefined && carrier === sourceCarrier || matches(carrier);
    creations.set(node, valid
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
          const nativeParameter = input.storage.lambdaParameterType.get(parameter) ?? native?.type;
          return native !== undefined && nativeParameter !== undefined && targetTypeRefEquals(nativeParameter, signature.parameters[index]!) &&
            native.passingMode === signature.parameterPassingModes[index] &&
            (native.paramsArray === true) === (signature.restParameterIndex === index);
        })) return false;
      const completion = input.conversions.conversion.get(contract.returnType, signature.returnType, "implicit");
      return completion !== undefined && csharpConversionIsApplicable(completion, "implicit");
    }
  }
  return Object.freeze({
    callableCreation: Object.freeze({ get: (expression: Node) => creations.get(expression) }),
    callableTarget: Object.freeze({ get: (expression: Node) => {
      const creation = creations.get(expression);
      return creation?.kind === "selected" ? creation.carrier : undefined;
    } }),
  });
}
