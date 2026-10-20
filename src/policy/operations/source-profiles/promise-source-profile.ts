import { type CsharpTargetMember, type TargetTypeRef, csharpNullableTargetType, csharpQualifiedTypeRenderShape, csharpRuntimeUnionTargetType, csharpTargetNamedType, csharpTsValueTargetType, csharpVoidTargetType, getCsharpTaskResultTargetType, isCsharpVoidTargetType, targetTypeRefKey, csharpTaskTargetType } from "../../../target-model/types/index.js";
import { csharpTargetId } from "../../../target-model/identities/source.js";
import { snapshotCsharpTargetTypes } from "../../../target-model/types/snapshot.js";
import { type CsharpSourceProfileOwner } from "../../identities/selected-source.js";
import { type CsharpSourceProfileCallPolicy, type CsharpSourceProfileCallPolicyContext, type CsharpSourceProfileCallPolicyResult } from "../../model/source-profiles.js";
import { csharpSourceProfileCall, csharpSourceProfileDiagnostic } from "./source-profile-policy.js";
import { resolveCsharpSourceProfileGenericResult } from "./source-profile-result.js";

const owners: readonly CsharpSourceProfileOwner[] = Object.freeze([
  csharpTargetId,
  "js",
]);
const voidType = csharpVoidTargetType();
const noReceiver = { kind: "none" } as const;

export function promiseConstructorMember(
  taskType: TargetTypeRef | undefined,
): CsharpTargetMember | undefined {
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
  const factoryType = csharpTargetNamedType(voidPromise
      ? "Tsonic.CSharp.Runtime.TaskCompletion"
      : "Tsonic.CSharp.Runtime.TaskCompletion`1", typeArguments, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Runtime", "TaskCompletion"), { allowsRefLikeTypeArguments: (typeArguments ?? []).map(() => false),});
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
  return csharpTargetNamedType(typeArguments.length === 0
      ? `Tsonic.CSharp.Runtime.${name}`
      : `Tsonic.CSharp.Runtime.${name}\`${typeArguments.length}`, typeArguments, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Runtime", name), { allowsRefLikeTypeArguments: (typeArguments ?? []).map(() => false),
      delegateSignature: {
        parameters,
        parameterPassingModes: Object.freeze(parameters.map(() => "by-value" as const)),
        returnType: voidType,
        ...(optionalParameterIndexes.length === 0
          ? {}
          : { optionalParameterIndexes }),
      },
    });
}

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
        const taskType = context.source.sourceSelectedSignatureKind !== "resolved" ||
          context.source.sourceSelectedSignatureParameters.length !== 1 ||
          context.source.sourceArgumentBindings.length !== 1 ? undefined :
          resolveCsharpSourceProfileGenericResult(context, 1, arguments_ => csharpTaskTargetType(arguments_[0]!));
        const member = promiseConstructorMember(taskType);
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
