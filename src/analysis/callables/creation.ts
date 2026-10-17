import type { AstReader, Node } from "@tsonic/tsts";
import { HasSyntacticModifier, ModifierFlagsAsync } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpCaptureStorage } from "../../target-model/records/capture-storage.js";
import type { CsharpExpectedTypeClassifications } from "../../target-model/records/expected-types.js";
import type { CsharpNativeCallableCreation } from "../../target-model/records/native-demand.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";
import type { CsharpStorageClassifications } from "../../target-model/records/storage.js";
import type { CsharpConversionClassifications } from "../../target-model/records/conversions.js";
import { csharpConversionIsApplicable } from "../../target-model/conversions/selection.js";
import { getCsharpLambdaSignature, getCsharpTaskResultTargetType } from "../../target-model/types/carriers/delegates.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { getCsharpMethodValue } from "../../target-model/types/method-values.js";
import type { CsharpCallableContractIndex, CsharpCallableCreationIndex } from "./model.js";
import { csharpCallableValueType } from "./value-type.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";

export interface CsharpCallableCreationInput {
  readonly ast: AstReader;
  readonly nodes: readonly Node[];
  readonly contracts: CsharpCallableContractIndex;
  readonly expectedTypes: Pick<CsharpExpectedTypeClassifications, "callableTarget" | "returnContext">;
  readonly storage: Pick<CsharpStorageClassifications, "lambdaParameterType">;
  readonly evidence: Pick<CsharpSourceEvidenceIndex, "nodeTargetType" | "compileTimeMetadata">;
  readonly conversions: Pick<CsharpConversionClassifications, "conversion">;
}

export interface CsharpCallableCreationPreparation {
  readonly callableTarget: CsharpCallableCreationIndex["callableTarget"];
  readonly seal: (captures: Pick<CsharpCaptureStorage, "captureClosure" | "lambdaCreation" | "namedSelf">) => CsharpCallableCreationIndex;
}

export function prepareCsharpCallableCreations(input: CsharpCallableCreationInput): CsharpCallableCreationPreparation {
  const preparations = new Map<Node, { readonly contextual: CsharpNativeCallableCreation; readonly self: CsharpNativeCallableCreation }>();
  let sealed = false;
  for (const node of input.nodes) {
    if (input.evidence.compileTimeMetadata.get(node) ||
      !input.ast.is.IsArrowFunction(node) && !input.ast.is.IsFunctionExpression(node)) continue;
    const sourceCarrier = input.evidence.nodeTargetType.get(node);
    const contextualCarrier = input.expectedTypes.callableTarget.get(node);
    const contract = input.contracts.get({ kind: "declaration", declaration: node });
    const native = contract === undefined ? undefined : input.contracts.closedInputType(node) ?? csharpCallableValueType(contract);
    const candidates = new WeakMap<TargetTypeRef, CsharpNativeCallableCreation>();
    const self = selection(sourceCarrier);
    const contextual = getCsharpMethodValue(sourceCarrier) !== undefined ? self : selection(contextualCarrier);
    preparations.set(node, Object.freeze({ contextual: contextual.kind === "selected" ? contextual : selection(native), self }));

    function selection(selected: TargetTypeRef | undefined): CsharpNativeCallableCreation {
      if (selected === undefined) return Object.freeze({ kind: "pending" });
      const existing = candidates.get(selected);
      if (existing !== undefined) return existing;
      const result: CsharpNativeCallableCreation = getCsharpMethodValue(sourceCarrier) !== undefined && selected === sourceCarrier || matches(selected)
        ? Object.freeze({ kind: "selected", carrier: selected }) : Object.freeze({ kind: "pending" });
      candidates.set(selected, result);
      return result;
    }

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
      const bodyReturn = input.expectedTypes.returnContext.get(node)?.target;
      const selectedReturn = HasSyntacticModifier(input.ast, node, ModifierFlagsAsync)
        ? getCsharpTaskResultTargetType(signature.returnType) : signature.returnType;
      if (input.ast.typeNode(node) === undefined && bodyReturn !== undefined && selectedReturn !== undefined &&
        targetTypeRefEquals(bodyReturn, selectedReturn)) return true;
      const completion = input.conversions.conversion.get(contract.returnType, signature.returnType, "implicit");
      return completion !== undefined && csharpConversionIsApplicable(completion, "implicit");
    }
  }
  return Object.freeze({
    callableTarget: Object.freeze({ get: (expression: Node) => {
      const creation = preparations.get(expression)?.contextual;
      return creation?.kind === "selected" ? creation.carrier : undefined;
    } }),
    seal(captures: Pick<CsharpCaptureStorage, "captureClosure" | "lambdaCreation" | "namedSelf">) {
      if (sealed) failTargetAnalysisInvariant("tsonic-csharp", "Native callable creation is sealed exactly once.");
      sealed = true;
      const creations = new WeakMap<Node, CsharpNativeCallableCreation>();
      for (const [node, preparation] of preparations) {
        if (captures.lambdaCreation.get(node).kind === "discarded") {
          creations.set(node, Object.freeze({ kind: "discarded" }));
          continue;
        }
        const selected = (captures.namedSelf.get(node)?.values.length ?? 0) > 0 ? preparation.self : preparation.contextual;
        const closure = captures.captureClosure.get(node);
        creations.set(node, closure === undefined || selected.kind === "selected" && targetTypeRefEquals(selected.carrier, closure.method.type)
          ? selected : Object.freeze({ kind: "pending" }));
      }
      return Object.freeze({
        callableCreation: Object.freeze({ get: (expression: Node) => creations.get(expression) }),
        callableTarget: Object.freeze({ get: (expression: Node) => {
          const creation = creations.get(expression);
          return creation?.kind === "selected" ? creation.carrier : undefined;
        } }),
      });
    },
  });
}
