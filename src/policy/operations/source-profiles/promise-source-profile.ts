import type {
  CsharpTargetMember,
  TargetTypeRef,
} from "../../../target-model/types/index.js";
import {
  csharpNullableTargetType,
  csharpQualifiedTypeRenderShape,
  csharpRuntimeUnionTargetType,
  csharpTargetNamedType,
  csharpTsValueTargetType,
  csharpTaskTargetType,
  csharpVoidTargetType,
  getCsharpTaskResultTargetType,
  isCsharpVoidTargetType,
  targetTypeRefKey,
} from "../../../target-model/types/index.js";
import { csharpTargetId } from "../../../target-model/identities/source.js";
import { snapshotCsharpTargetTypes } from "../../../target-model/types/snapshot.js";
import type {
  CsharpSourceProfileCallPolicy,
  CsharpSourceProfileCallPolicyContext,
  CsharpSourceProfileCallPolicyResult,
} from "./source-profile-policy.js";
import {
  csharpSourceProfileCall,
  csharpSourceProfileDiagnostic,
} from "./source-profile-policy.js";
import type { CsharpSourceProfileOwner } from "./source-profile-identity.js";
import { resolveCsharpSourceProfileGenericResult } from "./source-profile-result.js";

const owners: readonly CsharpSourceProfileOwner[] = Object.freeze([
  csharpTargetId,
  "js",
]);
const voidType = csharpVoidTargetType();
const noReceiver = { kind: "none" } as const;

export const csharpPromiseSourceProfileCallPolicies:
  readonly CsharpSourceProfileCallPolicy[] = Object.freeze(
    owners.map(owner => Object.freeze({
      source: Object.freeze({
        owner,
        kind: "construct" as const,
        declaringName: "PromiseConstructor",
      }),
      select(
        context: CsharpSourceProfileCallPolicyContext,
      ): CsharpSourceProfileCallPolicyResult {
        const member = promiseConstructorMember(context);
        const call = member === undefined
          ? undefined
          : csharpSourceProfileCall(context.source, member, noReceiver);
        return call === undefined
          ? {
              kind: "rejected",
              diagnostic: csharpSourceProfileDiagnostic(
                "CSHARP_PROMISE_CONSTRUCTION_NOT_CLOSED",
                9100971,
                "The selected Promise constructor does not provide one exact native Task result and executor parameter relation.",
                [
                  "Native and JS Promise construction share the core Task completion owner.",
                  "The selected result, executor and source parameter bindings must be closed before C# construction.",
                ],
              ),
            }
          : { kind: "resolved", call };
      },
    })),
  );

function promiseConstructorMember(
  context: CsharpSourceProfileCallPolicyContext,
): CsharpTargetMember | undefined {
  if (context.source.sourceSelectedSignatureKind !== "resolved" ||
      context.source.sourceSelectedSignatureParameters.length !== 1 ||
      context.source.sourceArgumentBindings.length !== 1) return undefined;
  const taskType = resolveCsharpSourceProfileGenericResult(context, 1, arguments_ => csharpTaskTargetType(arguments_[0]!));
  const resultType = getCsharpTaskResultTargetType(taskType);
  if (taskType === undefined || resultType === undefined) return undefined;
  const voidPromise = isCsharpVoidTargetType(resultType);
  const resolveValueType = voidPromise
    ? csharpNullableTargetType(taskType)
    : csharpRuntimeUnionTargetType([resultType, taskType]);
  if (resolveValueType === undefined) return undefined;
  const typeArguments = voidPromise ? [] : [resultType];
  const resolveType = completionDelegate(
    "TaskResolve",
    typeArguments,
    [resolveValueType],
    voidPromise ? [0] : [],
  );
  const rejectType = completionDelegate(
    "TaskReject",
    [],
    [csharpTsValueTargetType()],
    [0],
  );
  const executorType = completionDelegate(
    "TaskExecutor",
    typeArguments,
    [resolveType, rejectType],
  );
  const factoryType = csharpTargetNamedType(
    voidPromise
      ? "Tsonic.CSharp.Runtime.TaskCompletion"
      : "Tsonic.CSharp.Runtime.TaskCompletion`1",
    typeArguments,
    csharpQualifiedTypeRenderShape("Tsonic.CSharp.Runtime", "TaskCompletion"),
  );
  const [closedTask, closedExecutor, closedFactory] = snapshotCsharpTargetTypes([
    taskType,
    executorType,
    factoryType,
  ]);
  return Object.freeze({
    id: `Tsonic.CSharp.Runtime.TaskCompletion.Create:${targetTypeRefKey(resultType)}`,
    sourceName: "constructor",
    targetName: "Create",
    kind: "constructor",
    declaringType: closedTask!,
    parameters: Object.freeze([Object.freeze({
      name: "executor",
      type: closedExecutor!,
      passingMode: "by-value",
      csharpAcceptsCheckedSourceArgument: true,
    })]),
    returnType: closedTask!,
    csharpInvocation: Object.freeze({
      kind: "static-factory-construction",
      factoryType: closedFactory!,
    }),
  } satisfies CsharpTargetMember);
}

function completionDelegate(
  name: string,
  typeArguments: readonly TargetTypeRef[],
  parameters: readonly TargetTypeRef[],
  optionalParameterIndexes: readonly number[] = [],
): TargetTypeRef {
  return csharpTargetNamedType(
    typeArguments.length === 0
      ? `Tsonic.CSharp.Runtime.${name}`
      : `Tsonic.CSharp.Runtime.${name}\`${typeArguments.length}`,
    typeArguments,
    csharpQualifiedTypeRenderShape("Tsonic.CSharp.Runtime", name),
    {
      delegateSignature: {
        parameters,
        parameterPassingModes: Object.freeze(parameters.map(() => "by-value" as const)),
        returnType: voidType,
        ...(optionalParameterIndexes.length === 0
          ? {}
          : { optionalParameterIndexes }),
      },
    },
  );
}
