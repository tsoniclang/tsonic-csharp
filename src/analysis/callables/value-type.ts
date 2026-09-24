import { csharpDelegateTargetType, isCsharpVoidTargetType } from "../../policy/types/index.js";
import type { CsharpSourceCallableContract, TargetTypeRef } from "../../policy/types/index.js";

export function csharpCallableValueType(
  callable: CsharpSourceCallableContract,
): TargetTypeRef | undefined {
  if (callable.methodTypeParameterNames.length !== 0) return undefined;
  const parameters = callable.parameters.map(parameter => parameter.targetParameter.type);
  const optionalParameterIndexes = callable.parameters.flatMap((parameter, index) =>
    parameter.targetParameter.optional === true ? [index] : []);
  const rest = callable.parameters.flatMap((parameter, index) =>
    parameter.targetParameter.paramsArray === true ? [index] : []);
  if (rest.length > 1) return undefined;
  const returnsVoid = isCsharpVoidTargetType(callable.returnType);
  return csharpDelegateTargetType(returnsVoid ? "System.Action" : "System.Func",
    parameters, returnsVoid ? undefined : callable.returnType, {
      optionalParameterIndexes,
      ...(rest[0] === undefined ? {} : { restParameterIndex: rest[0] }),
    });
}
