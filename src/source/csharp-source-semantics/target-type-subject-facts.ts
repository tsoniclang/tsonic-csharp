import {
  functionPointerFactKey,
  pointerFactKey,
  selectedTargetSignatureFactKey,
  sourcePrimitiveFactKey,
  targetOperationFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  TargetTypeRefResolutionOptions,
} from "./target-member-selection.js";
import {
  csharpSourcePrimitiveTargetType,
} from "./target-types.js";
import {
  resolveRuntimeCarrier,
} from "./target-type-resolution-facts.js";

export type SubjectTargetTypeResolver = (
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
) => TargetTypeRef | undefined;

export function resolveTargetTypeRefFromSubjectFacts(
  subject: ExtensionFactSubject,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  resolveSubject: SubjectTargetTypeResolver,
): TargetTypeRef | undefined {
  if (options.allowRuntimeCarrier !== false) {
    const direct = resolveRuntimeCarrier(subject, context);
    if (direct !== undefined) {
      return direct;
    }
  }
  const pointer = context.factResolver.resolve(subject, pointerFactKey);
  if (pointer !== undefined) {
    const pointee = resolveSubject(pointer.pointee, context, options);
    return pointee === undefined
      ? undefined
      : {
          kind: "pointer",
          pointee,
          mutability: pointer.mutability === "readwrite" ? "mut" : pointer.mutability === "readonly" ? "const" : "target-defined",
        };
  }
  const functionPointer = context.factResolver.resolve(subject, functionPointerFactKey);
  if (functionPointer !== undefined) {
    const args = functionPointer.parameters.map((parameter) => resolveSubject(parameter, context, options));
    const result = resolveSubject(functionPointer.result, context, options);
    return result === undefined || args.some((arg) => arg === undefined)
      ? undefined
      : {
          kind: "function-pointer",
          args: args as readonly TargetTypeRef[],
          result,
          ...(functionPointer.abi.length > 0 ? { abi: functionPointer.abi } : {}),
        };
  }
  const primitive = context.factResolver.resolve(subject, sourcePrimitiveFactKey);
  if (primitive !== undefined) {
    return csharpSourcePrimitiveTargetType(primitive.kind);
  }
  const selectedCallReturn = context.factResolver.resolve(subject, selectedTargetSignatureFactKey)?.member.returnType;
  if (selectedCallReturn !== undefined) {
    return selectedCallReturn;
  }
  const operationResult = context.factResolver.resolve(subject, targetOperationFactKey)?.resultType;
  if (operationResult !== undefined && operationResult !== subject) {
    return resolveSubject(operationResult, context, options);
  }
  return undefined;
}
