import type {
  TargetTypeRef,
} from "./model.js";
import type {
  CsharpDelegateSignatureShape,
  CsharpDelegateTargetTypeRef,
  CsharpTaskTargetTypeRef,
  CsharpTargetNamedTypeRef,
} from "./model.js";
import {
  isCsharpVoidTargetType,
} from "./identity.js";
import { csharpCarrierAdmitsSourceAbsence } from "./runtime-carriers.js";
import { targetTypeRefEquals } from "./equality.js";
import {
  csharpQualifiedTypeRenderShape,
} from "./render-shapes.js";
import {
  csharpVoidTargetType,
  isCsharpNeverTargetType,
} from "./scalar-types.js";
import {
  csharpTargetNamedType,
} from "./factories.js";
import { getCsharpNullableElementTargetType } from "./nullable.js";
import type { CsharpTypeDefinitions } from "./source-union-definitions.js";
import { selectCsharpAwaitCompletion } from "./await-completions.js";

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
      parameterPassingModes: Object.freeze(parameters.map(() => "by-value" as const)),
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
    ? csharpTargetNamedType("System.Threading.Tasks.Task", undefined, csharpQualifiedTypeRenderShape("System.Threading.Tasks", "Task"), { typeofRuntimeKind: "object" })
    : csharpTargetNamedType("System.Threading.Tasks.Task`1", [resultType], csharpQualifiedTypeRenderShape("System.Threading.Tasks", "Task"), { typeofRuntimeKind: "object" });
  return {
    kind: "target-named",
    id: targetType.id,
    ...(targetType.typeArguments !== undefined ? { typeArguments: targetType.typeArguments } : {}),
    ...(targetType.csharpRender !== undefined ? { csharpRender: targetType.csharpRender } : {}),
    csharpTypeofRuntimeKind: targetType.csharpTypeofRuntimeKind,
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

export function getCsharpAwaitResultTargetType(
  type: TargetTypeRef | undefined,
  definitions?: CsharpTypeDefinitions,
): TargetTypeRef | undefined {
  return selectCsharpAwaitCompletion(type, definitions)?.result;
}

export function csharpVoidReturnCompletion(source: TargetTypeRef | undefined, target: TargetTypeRef | undefined): "void" | "absence" | undefined {
  if (!isCsharpVoidTargetType(source)) return undefined;
  if (isCsharpVoidTargetType(target)) return "void";
  return csharpCarrierAdmitsSourceAbsence(target) ? "absence" : undefined;
}

export function csharpArgumentVectorCallbackResultMatches(source: TargetTypeRef, target: TargetTypeRef): boolean {
  return targetTypeRefEquals(source, target) || isCsharpNeverTargetType(source) && isCsharpVoidTargetType(target);
}

export function getCsharpDelegateSignature(type: TargetTypeRef | undefined): CsharpDelegateSignatureShape | undefined {
  return type?.kind === "target-named"
    ? (type as Partial<CsharpDelegateTargetTypeRef>).csharpDelegateSignature
    : undefined;
}

export function getCsharpCallableValueSignature(type: TargetTypeRef | undefined): CsharpDelegateSignatureShape | undefined {
  const contract = type?.kind === "target-named" ? (type as CsharpTargetNamedTypeRef).csharpMethodValue?.contract : undefined;
  return getCsharpDelegateSignature(contract ?? type);
}

export function csharpDelegateSignatureHasSupportedPassingModes(signature: CsharpDelegateSignatureShape): boolean {
  return Array.isArray(signature.parameterPassingModes) &&
    signature.parameterPassingModes.length === signature.parameters.length &&
    (signature.returnPassing === undefined || signature.returnPassing === "byref-readwrite" ||
      signature.returnPassing === "byref-readonly") &&
    signature.parameters.every((_parameter, index) => {
      const mode = signature.parameterPassingModes[index];
      return mode === "by-value" || mode === "byref-readonly" ||
        mode === "byref-readwrite" || mode === "byref-writeonly-must-init";
    });
}

export function csharpDelegateSignaturesMatchNativeBinding(
  source: CsharpDelegateSignatureShape,
  target: CsharpDelegateSignatureShape,
): boolean {
  return csharpDelegateSignatureHasSupportedPassingModes(source) &&
    csharpDelegateSignatureHasSupportedPassingModes(target) &&
    source.parameters.length === target.parameters.length &&
    source.returnPassing === target.returnPassing &&
    source.parameters.every((parameter, index) => targetTypeRefEquals(parameter, target.parameters[index]!) &&
      source.parameterPassingModes[index] === target.parameterPassingModes[index]) &&
    targetTypeRefEquals(source.returnType, target.returnType);
}

export function isCsharpSourceDelegateTargetType(type: TargetTypeRef | undefined): boolean {
  const value = getCsharpNullableElementTargetType(type) ?? type;
  const signature = getCsharpDelegateSignature(value);
  if (value === undefined || signature === undefined || signature.returnPassing !== undefined ||
    !csharpDelegateSignatureHasSupportedPassingModes(signature) ||
    signature.parameterPassingModes.some(mode => mode !== "by-value")) return false;
  return targetTypeRefEquals(value, csharpDelegateTargetType(
    isCsharpVoidTargetType(signature.returnType) ? "System.Action" : "System.Func",
    signature.parameters,
    isCsharpVoidTargetType(signature.returnType) ? undefined : signature.returnType,
    signature,
  ));
}
