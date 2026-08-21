import type {
  TargetTypeRef,
} from "../../../target-model/types/model.js";
import type {
  CsharpDelegateSignatureShape,
  CsharpDelegateTargetTypeRef,
  CsharpTaskTargetTypeRef,
} from "../../../target-model/types/model.js";
import {
  isCsharpVoidTargetType,
} from "../model/identity.js";
import {
  csharpQualifiedTypeRenderShape,
} from "../render-shapes.js";
import {
  csharpVoidTargetType,
} from "../model/scalar-types.js";
import {
  csharpTargetNamedType,
} from "../../../target-model/types/factories.js";

export function csharpDelegateTargetType(
  kind: "System.Action" | "System.Func",
  parameters: readonly TargetTypeRef[],
  returnType?: TargetTypeRef,
): CsharpDelegateTargetTypeRef {
  const typeArguments = returnType === undefined
    ? parameters
    : [...parameters, returnType];
  const id = kind === "System.Action"
    ? parameters.length === 0 ? "System.Action" : `System.Action\`${parameters.length}`
    : `System.Func\`${parameters.length + 1}`;
  const targetType = csharpTargetNamedType(id, typeArguments, { kind: "named", name: kind === "System.Action" ? "Action" : "Func" });
  return {
    kind: "target-named",
    id: targetType.id,
    ...(targetType.typeArguments !== undefined ? { typeArguments: targetType.typeArguments } : {}),
    ...(targetType.csharpRender !== undefined ? { csharpRender: targetType.csharpRender } : {}),
    csharpDelegateSignature: {
      parameters,
      returnType: returnType ?? csharpVoidTargetType(),
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
  } satisfies CsharpTaskTargetTypeRef;
}

export function getCsharpTaskResultTargetType(type: TargetTypeRef | undefined): TargetTypeRef | undefined {
  return type?.kind === "target-named"
    ? (type as Partial<CsharpTaskTargetTypeRef>).csharpTaskResultType
    : undefined;
}

export function getCsharpDelegateSignature(type: TargetTypeRef | undefined): CsharpDelegateSignatureShape | undefined {
  return type?.kind === "target-named"
    ? (type as Partial<CsharpDelegateTargetTypeRef>).csharpDelegateSignature
    : undefined;
}
