import type {
  TargetMember,
  TargetParameter,
  TargetTypeRef,
} from "@tsonic/tsts";

export function targetMethod(
  id: string,
  sourceName: string,
  targetName: string,
  parameters: readonly TargetParameter[],
  returnType: TargetTypeRef,
  options: {
    readonly declaringType?: TargetTypeRef;
    readonly static?: boolean;
    readonly receiverPassing?: TargetMember["receiverPassing"];
  } = {},
): TargetMember {
  return {
    id,
    sourceName,
    targetName,
    kind: "method",
    parameters,
    returnType,
    ...(options.declaringType !== undefined ? { declaringType: options.declaringType } : {}),
    ...(options.static !== undefined ? { static: options.static } : {}),
    ...(options.receiverPassing !== undefined ? { receiverPassing: options.receiverPassing } : {}),
  };
}

export function targetProperty(
  id: string,
  sourceName: string,
  targetName: string,
  returnType: TargetTypeRef,
  options: {
    readonly declaringType?: TargetTypeRef;
    readonly static?: boolean;
  } = {},
): TargetMember {
  return {
    id,
    sourceName,
    targetName,
    kind: "property",
    parameters: [],
    returnType,
    ...(options.declaringType !== undefined ? { declaringType: options.declaringType } : {}),
    ...(options.static !== undefined ? { static: options.static } : {}),
  };
}

export function targetParameter(
  name: string,
  type: TargetTypeRef,
  options: {
    readonly optional?: boolean;
    readonly paramsArray?: boolean;
    readonly csharpAcceptsCheckedSourceArgument?: boolean;
    readonly csharpAcceptsClosedSourceArgument?: boolean;
    readonly csharpOmittableOptionalArgument?: boolean;
  } = {},
): TargetParameter {
  const parameterType = options.paramsArray === true && type.kind !== "array"
    ? { kind: "array" as const, element: type }
    : type;
  return {
    name,
    type: parameterType,
    passingMode: "by-value",
    ...(options.optional === true ? { optional: true } : {}),
    ...(options.paramsArray === true ? { paramsArray: true } : {}),
    ...(options.csharpAcceptsCheckedSourceArgument === true ? { csharpAcceptsCheckedSourceArgument: true } : {}),
    ...(options.csharpAcceptsClosedSourceArgument === true ? { csharpAcceptsClosedSourceArgument: true } : {}),
    ...(options.optional === true && options.csharpOmittableOptionalArgument !== false ? { csharpOmittableOptionalArgument: true } : {}),
  };
}
