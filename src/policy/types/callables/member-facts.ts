import type {
  TargetTypeRef,
} from "../../../target-model/types/model.js";
import type {
  CsharpTargetMember,
  CsharpTargetParameter,
} from "../../../target-model/types/model.js";

export function targetMethod(
  id: string,
  sourceName: string,
  targetName: string,
  parameters: readonly CsharpTargetParameter[],
  returnType: TargetTypeRef,
  options: {
    readonly declaringType?: TargetTypeRef;
    readonly static?: boolean;
    readonly receiverPassing?: CsharpTargetMember["receiverPassing"];
  } = {},
): CsharpTargetMember {
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
): CsharpTargetMember {
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
): CsharpTargetParameter {
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

export function csharpTargetParameterValueType(
  parameter: CsharpTargetParameter,
  sourceForm: "value" | "spread-element" | "spread-sequence",
): TargetTypeRef {
  return sourceForm !== "spread-sequence" &&
      parameter.paramsArray === true &&
      parameter.type.kind === "array"
    ? parameter.type.element
    : parameter.type;
}
