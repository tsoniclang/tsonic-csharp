import { csharpDelegateTargetType, isCsharpVoidTargetType, type TargetTypeRef, getCsharpDelegateSignature, isCsharpSourceDelegateTargetType, targetTypeRefEquals } from "../index.js";
import { type SourceCallableContract } from "../../../target-model/records/callables/source-callable-contract.js";

export function csharpCallableValueType(
  callable: SourceCallableContract,
): TargetTypeRef | undefined {
  if (callable.nativeSignature.methodTypeParameterIdentities.length !== 0) return undefined;
  const parameters = callable.nativeParameters.map(parameter => parameter.targetParameter.type);
  const optionalParameterIndexes = callable.nativeParameters.flatMap((parameter, index) =>
    parameter.targetParameter.optional === true ? [index] : []);
  const rest = callable.nativeParameters.flatMap((parameter, index) =>
    parameter.targetParameter.paramsArray === true ? [index] : []);
  if (rest.length > 1) return undefined;
  const returnsVoid = isCsharpVoidTargetType(callable.returnType);
  return csharpDelegateTargetType(returnsVoid ? "System.Action" : "System.Func",
    parameters, returnsVoid ? undefined : callable.returnType, {
      optionalParameterIndexes,
      ...(rest[0] === undefined ? {} : { restParameterIndex: rest[0] }),
    });
}

export function csharpClosedInvocationMatches(source: TargetTypeRef, destination: TargetTypeRef): boolean {
  const sourceSignature = getCsharpDelegateSignature(source);
  const destinationSignature = getCsharpDelegateSignature(destination);
  if (sourceSignature === undefined || destinationSignature === undefined ||
    !isCsharpSourceDelegateTargetType(source) || !isCsharpSourceDelegateTargetType(destination)) return false;
  return sourceSignature.restParameterIndex === undefined && destinationSignature.restParameterIndex === undefined &&
    (sourceSignature.optionalParameterIndexes?.length ?? 0) === 0 &&
    (destinationSignature.optionalParameterIndexes?.length ?? 0) === 0 &&
    sourceSignature.parameters.length <= destinationSignature.parameters.length &&
    sourceSignature.parameters.every((type, index) => targetTypeRefEquals(type, destinationSignature.parameters[index]!)) &&
    targetTypeRefEquals(sourceSignature.returnType, destinationSignature.returnType);
}
