import type {
  TargetTypeRef,
} from "./model.js";
import type {
  CsharpDelegateSignatureShape,
  CsharpDelegateTargetTypeRef,
  CsharpTaskTargetTypeRef,
} from "./model.js";
import {
  isCsharpVoidTargetType,
} from "./identity.js";
import { csharpCarrierAdmitsSourceAbsence } from "./runtime-carriers.js";
import {
  csharpQualifiedTypeRenderShape,
} from "./render-shapes.js";
import {
  csharpVoidTargetType,
} from "./scalar-types.js";
import {
  csharpTargetNamedType,
} from "./factories.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "./nullable.js";

export function csharpDelegateTargetType(
  kind: "System.Action" | "System.Func",
  parameters: readonly TargetTypeRef[],
  returnType?: TargetTypeRef,
  options: {
    readonly optionalParameterIndexes?: readonly number[];
    readonly restParameterIndex?: number;
  } = {},
): CsharpDelegateTargetTypeRef {
  const typeArguments = returnType === undefined
    ? parameters
    : [...parameters, returnType];
  const id = kind === "System.Action"
    ? parameters.length === 0 ? "System.Action" : `System.Action\`${parameters.length}`
    : `System.Func\`${parameters.length + 1}`;
  const targetType = csharpTargetNamedType(id, typeArguments, {
    kind: "named",
    name: kind === "System.Action" ? "Action" : "Func",
    usingNamespace: ["System"],
  });
  return {
    kind: "target-named",
    id: targetType.id,
    ...(targetType.typeArguments !== undefined ? { typeArguments: targetType.typeArguments } : {}),
    ...(targetType.csharpRender !== undefined ? { csharpRender: targetType.csharpRender } : {}),
    csharpDelegateSignature: {
      parameters,
      returnType: returnType ?? csharpVoidTargetType(),
      ...(options.optionalParameterIndexes === undefined ||
          options.optionalParameterIndexes.length === 0
        ? {}
        : {
            optionalParameterIndexes: Object.freeze([
              ...options.optionalParameterIndexes,
            ]),
          }),
      ...(options.restParameterIndex === undefined
        ? {}
        : { restParameterIndex: options.restParameterIndex }),
    },
  } satisfies CsharpDelegateTargetTypeRef;
}

export function csharpTaskTargetType(resultType: TargetTypeRef): CsharpTaskTargetTypeRef {
  const targetType = isCsharpVoidTargetType(resultType)
    ? csharpTargetNamedType("System.Threading.Tasks.Task", undefined, csharpQualifiedTypeRenderShape("System.Threading.Tasks", "Task"))
    : csharpTargetNamedType("System.Threading.Tasks.Task`1", [resultType], csharpQualifiedTypeRenderShape("System.Threading.Tasks", "Task"));
  return {
    kind: "target-named",
    id: targetType.id,
    ...(targetType.typeArguments !== undefined ? { typeArguments: targetType.typeArguments } : {}),
    ...(targetType.csharpRender !== undefined ? { csharpRender: targetType.csharpRender } : {}),
    csharpTaskResultType: resultType,
    ...(!isCsharpVoidTargetType(resultType)
      ? { csharpBaseType: csharpTaskTargetType(csharpVoidTargetType()) } : {}),
  } satisfies CsharpTaskTargetTypeRef;
}

export function getCsharpTaskResultTargetType(type: TargetTypeRef | undefined): TargetTypeRef | undefined {
  return type?.kind === "target-named"
    ? (type as Partial<CsharpTaskTargetTypeRef>).csharpTaskResultType
    : undefined;
}

export function getCsharpAwaitResultTargetType(type: TargetTypeRef | undefined): TargetTypeRef | undefined {
  const result = getCsharpTaskResultTargetType(type);
  return result === undefined || isCsharpVoidTargetType(result) || getCsharpNullableElementTargetType(type) === undefined
    ? result : csharpNullableTargetType(result);
}

export function csharpVoidReturnCompletion(source: TargetTypeRef | undefined, target: TargetTypeRef | undefined): "void" | "absence" | undefined {
  if (!isCsharpVoidTargetType(source)) return undefined;
  if (isCsharpVoidTargetType(target)) return "void";
  return csharpCarrierAdmitsSourceAbsence(target) ? "absence" : undefined;
}

export function getCsharpDelegateSignature(type: TargetTypeRef | undefined): CsharpDelegateSignatureShape | undefined {
  return type?.kind === "target-named"
    ? (type as Partial<CsharpDelegateTargetTypeRef>).csharpDelegateSignature
    : undefined;
}
