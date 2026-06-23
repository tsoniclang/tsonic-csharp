import type {
  ExtensionFactSubject,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  TargetCompileInput,
} from "@tsonic/target-api";
import {
  asTargetTypeRef,
} from "../../source/fact-subjects.js";
import {
  csharpTargetTypeFromBinding,
} from "../../source/csharp-source-semantics/target-types.js";

export function getTargetTypeRefFromDirectFacts(
  input: TargetCompileInput,
  subject: ExtensionFactSubject | undefined,
): TargetTypeRef | undefined {
  if (subject === undefined) {
    return undefined;
  }
  const targetTypeRef = asTargetTypeRef(subject);
  if (targetTypeRef !== undefined) {
    return targetTypeRef;
  }
  const runtimeCarrier = input.facts.getRuntimeCarrierFact(subject)?.carrier;
  if (runtimeCarrier !== undefined) {
    return runtimeCarrier;
  }
  const pointer = input.facts.getPointerFact(subject);
  if (pointer !== undefined) {
    const pointee = getTargetTypeRefFromDirectFacts(input, pointer.pointee);
    if (pointee !== undefined) {
      return {
        kind: "pointer",
        pointee,
        mutability: pointer.mutability === "readwrite" ? "mut" : pointer.mutability === "readonly" ? "const" : "target-defined",
      };
    }
  }
  const functionPointer = input.facts.getFunctionPointerFact(subject);
  if (functionPointer !== undefined) {
    const args = functionPointer.parameters.map((parameter) => getTargetTypeRefFromDirectFacts(input, parameter));
    const result = getTargetTypeRefFromDirectFacts(input, functionPointer.result);
    if (result !== undefined && args.every((argument) => argument !== undefined)) {
      return {
        kind: "function-pointer",
        args: args as readonly TargetTypeRef[],
        result,
        ...(functionPointer.abi.length > 0 ? { abi: functionPointer.abi } : {}),
      };
    }
  }
  const primitive = input.facts.getSourcePrimitiveFact(subject);
  if (primitive !== undefined) {
    return { kind: "source-primitive", name: primitive.kind };
  }
  const binding = input.facts.getTargetBindingFact(subject);
  if (binding !== undefined) {
    return csharpTargetTypeFromBinding(binding);
  }
  return undefined;
}
