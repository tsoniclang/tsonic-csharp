import type {
  CheckedCallMappingRequest,
  ExtensionObservationContext,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpTargetMember,
  CsharpTargetNamedTypeRef,
} from "../../target-types.js";
import {
  csharpNullableReferenceTargetType,
  csharpQualifiedTypeRenderShape,
  csharpTaskTargetType,
  csharpTargetNamedType,
  csharpVoidTargetType,
  getCsharpTaskResultTargetType,
  isCsharpVoidTargetType,
  targetParameter,
} from "../../target-types.js";
import type {
  CsharpJsSurfaceHost,
} from "./source-library.js";

const promiseRuntimeCapabilityId = "surface.js.promise-task-runtime";
const objectTargetType = csharpTargetNamedType("System.Object", undefined, { kind: "predefined", name: "object" });
const nullableObjectTargetType = csharpNullableReferenceTargetType(objectTargetType);

export function promiseConstructorTargetMembers(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): readonly CsharpTargetMember[] {
  const taskType = selectedPromiseResultTargetType(request, context, host);
  const resultType = getCsharpTaskResultTargetType(taskType);
  if (taskType === undefined || resultType === undefined) {
    return [];
  }

  const voidPromise = isCsharpVoidTargetType(resultType);
  const factoryType = promiseRuntimeTargetType(voidPromise ? undefined : resultType);
  const resolveType = voidPromise
    ? promiseResolveTargetType()
    : csharpDelegateTargetType(
        "Tsonic.CSharp.Js.PromiseResolve`1",
        "PromiseResolve",
        [resultType],
        [resultType],
      );
  const rejectType = promiseRejectTargetType();
  const executorType = csharpDelegateTargetType(
    voidPromise ? "Tsonic.CSharp.Js.PromiseExecutor" : "Tsonic.CSharp.Js.PromiseExecutor`1",
    "PromiseExecutor",
    voidPromise ? [] : [resultType],
    [resolveType, rejectType],
  );

  return [{
    id: voidPromise
      ? "Tsonic.CSharp.Js.PromiseRuntime.Create:void"
      : "Tsonic.CSharp.Js.PromiseRuntime.Create:value",
    sourceName: "constructor",
    targetName: "Create",
    kind: "constructor",
    parameters: [targetParameter("executor", executorType, { csharpAcceptsCheckedSourceArgument: true })],
    returnType: taskType,
    declaringType: taskType,
    csharpInvocation: {
      kind: "static-factory-construction",
      factoryType,
    },
  }];
}

export function promiseAllTargetMembers(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): readonly CsharpTargetMember[] {
  const taskType = selectedPromiseResultTargetType(request, context, host);
  const resultType = getCsharpTaskResultTargetType(taskType);
  if (taskType === undefined || resultType?.kind !== "array") {
    return [];
  }

  const elementType = resultType.element;
  const inputType = {
    kind: "array" as const,
    element: csharpTaskTargetType(elementType),
  };
  return [{
    id: "Tsonic.CSharp.Js.PromiseRuntime.All",
    sourceName: "all",
    targetName: "All",
    kind: "method",
    static: true,
    parameters: [targetParameter("values", inputType)],
    returnType: taskType,
    declaringType: promiseRuntimeTargetType(elementType),
  }];
}

function selectedPromiseResultTargetType(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): TargetTypeRef | undefined {
  return host.unwrapNullableTargetType(host.getTargetTypeRefForSubject(request.sourceReturnType, context, {
    allowRuntimeCarrier: true,
    allowSemanticTypeQuery: false,
  }));
}

function promiseRuntimeTargetType(typeArgument: TargetTypeRef | undefined): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType(
    typeArgument === undefined
      ? "Tsonic.CSharp.Js.PromiseRuntime"
      : "Tsonic.CSharp.Js.PromiseRuntime`1",
    typeArgument === undefined ? undefined : [typeArgument],
    csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "PromiseRuntime"),
  );
}

function promiseResolveTargetType(): TargetTypeRef {
  return csharpDelegateTargetType(
    "Tsonic.CSharp.Js.PromiseResolve",
    "PromiseResolve",
    [],
    [nullableObjectTargetType],
  );
}

function promiseRejectTargetType(): TargetTypeRef {
  return csharpDelegateTargetType(
    "Tsonic.CSharp.Js.PromiseReject",
    "PromiseReject",
    [],
    [nullableObjectTargetType],
  );
}

function csharpDelegateTargetType(
  id: string,
  name: string,
  typeArguments: readonly TargetTypeRef[],
  parameters: readonly TargetTypeRef[],
): CsharpTargetNamedTypeRef {
  const target = csharpTargetNamedType(
    id,
    typeArguments.length === 0 ? undefined : typeArguments,
    csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", name),
  );
  return {
    ...target,
    csharpDelegateSignature: {
      parameters,
      returnType: csharpVoidTargetType(),
    },
  };
}

export const promiseRuntimeOperationEvidence = {
  capabilityId: promiseRuntimeCapabilityId,
  requiredFacts: [
    "selected JS Promise declaration/signature identity",
    "closed Promise/Task result carrier",
    "closed executor or homogeneous Task-array argument carrier",
    "Tsonic.CSharp.Js Promise runtime operation metadata",
  ],
} as const;
