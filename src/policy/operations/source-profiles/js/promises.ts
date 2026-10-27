import type { CsharpTargetMember, TargetTypeRef } from "../../../types/index.js";
import { csharpDelegateTargetType, csharpEnumerableTargetType, csharpObjectTargetType, csharpNullableTargetType, csharpTaskTargetType, getCsharpCollectionElementTargetType, getCsharpNullableElementTargetType, getCsharpTaskResultTargetType, getCsharpDelegateSignature, isCsharpAbsenceTargetType, isCsharpVoidTargetType, targetTypeRefEquals, targetTypeRefKey } from "../../../../target-model/types/index.js";
import type { CsharpSourceProfileCallPolicy, CsharpSourceProfileCallPolicyContext } from "../../../model/source-profiles.js";
import { resolveCsharpSelectedSourceValue } from "../source-profile-policy.js";
import { jsCallPolicy, jsMemberIdentity, receiverHelperMethod, staticMethod, targetParameter } from "./common.js";
import { csharpQualifiedTypeRenderShape } from "../../../../target-model/types/index.js";
import { csharpTargetNamedType } from "../../../../target-model/types/index.js";
import { csharpJsEventLoopBinaryExecutionDriver } from "../../../../target-model/project/binary-execution-drivers.js";
import { resolveCsharpOptionalStorage } from "../../../types/storage/optional-storage.js";

const objectType = csharpObjectTargetType();
const rejectionType = csharpNullableTargetType(objectType);
const actionType = csharpDelegateTargetType("System.Action", []);
const noReceiver = { kind: "none" } as const;
const firstParameterReceiver = {
  kind: "target-parameter",
  targetParameterIndex: 0,
} as const;

export const csharpJsPromiseCallPolicies:
  readonly CsharpSourceProfileCallPolicy[] = Object.freeze([
    jsCallPolicy(
      jsMemberIdentity("PromiseConstructor", "resolve"),
      promiseResolveMember,
      noReceiver,
    ),
    jsCallPolicy(
      jsMemberIdentity("PromiseConstructor", "reject"),
      promiseRejectMember,
      noReceiver,
    ),
    ...["race", "any", "allSettled"].map((name) =>
      jsCallPolicy(
        jsMemberIdentity("PromiseConstructor", name),
        (context) => promiseCombinatorMember(context, name),
        noReceiver,
      )
    ),
    jsCallPolicy(
      jsMemberIdentity("Promise", "finally"),
      promiseFinallyMember,
      firstParameterReceiver,
    ),
    ...["Promise", "PromiseLike"].map(owner => jsCallPolicy(
      jsMemberIdentity(owner, "then"),
      context => promiseContinuationMember(context, "then"),
      firstParameterReceiver,
      { targetMethodTypeArguments: (_context, member) => promiseContinuationTypeArguments(member) },
    )),
    jsCallPolicy(
      jsMemberIdentity("Promise", "catch"),
      context => promiseContinuationMember(context, "catch"),
      firstParameterReceiver,
    ),
  ]);

function promiseContinuationMember(
  context: CsharpSourceProfileCallPolicyContext,
  name: "then" | "catch",
): CsharpTargetMember | undefined {
  const receiver = resolveCsharpSelectedSourceValue(context, context.source.sourceReceiver);
  const input = getCsharpTaskResultTargetType(receiver);
  if (receiver === undefined || input === undefined) return undefined;
  const callbackResults = context.source.sourceArguments.map(argument =>
    getCsharpDelegateSignature(resolveCsharpSelectedSourceValue(context, argument))?.returnType);
  const fulfilled = context.source.sourceArguments[0];
  const fulfilledType = resolveCsharpSelectedSourceValue(context, fulfilled);
  if (name === "then" && (fulfilled === undefined || isCsharpAbsenceTargetType(fulfilledType) ||
    fulfilledType !== undefined && isCsharpVoidTargetType(fulfilledType))) {
    const rejected = context.source.sourceArguments[1];
    const rejectedType = resolveCsharpSelectedSourceValue(context, rejected);
    const absentRejected = rejected === undefined || isCsharpAbsenceTargetType(rejectedType) ||
      rejectedType !== undefined && isCsharpVoidTargetType(rejectedType);
    return promiseAbsentFulfilledMember(receiver, input, absentRejected ? undefined : callbackResults[1], absentRejected);
  }
  const output = resolveResultTask(context);
  if (output === undefined || name === "catch" && !targetTypeRefEquals(input, output.result)) return undefined;
  const asynchronous = name === "then" && callbackResults[0] !== undefined &&
    getCsharpTaskResultTargetType(callbackResults[0]) !== undefined;
  const selected = context.source.sourceSelectedMethodTypeArguments?.[0];
  const result = name === "catch" ? input : selected?.explicitTypeNode !== undefined
    ? context.inputs.selectedType.get(selected.explicitTypeNode, selected.selectedType)
    : getCsharpTaskResultTargetType(callbackResults[0]) ?? callbackResults[0];
  if (result === undefined) return undefined;
  const callbackResult = asynchronous ? csharpTaskTargetType(result) : result;
  const delegate = (parameters: readonly TargetTypeRef[]) => isCsharpVoidTargetType(callbackResult)
    ? csharpDelegateTargetType("System.Action", parameters)
    : csharpDelegateTargetType("System.Func", parameters, callbackResult);
  return receiverHelperMethod(
    `Tsonic.CSharp.Js.PromiseRuntime.${name}:${targetIdentity(input)}:${targetIdentity(callbackResult)}`,
    name, name === "catch" ? "Catch" : asynchronous ? "ThenAsync" : "Then",
    promiseRuntimeType(input), receiver,
    name === "catch"
      ? [targetParameter("rejected", delegate([rejectionType]))]
      : [targetParameter("fulfilled", delegate(isCsharpVoidTargetType(input) ? [] : [input])),
          targetParameter("rejected", delegate([rejectionType]), { optional: true })],
    csharpTaskTargetType(result),
    {
      csharpBinaryExecutionDriver: csharpJsEventLoopBinaryExecutionDriver,
      ...(name === "then" && !isCsharpVoidTargetType(result)
        ? { typeParameters: [{ name: "TResult", csharpAllowsRefLike: false }] } : {}),
    },
  );
}

function promiseAbsentFulfilledMember(
  receiver: TargetTypeRef,
  input: TargetTypeRef,
  rejectedResult: TargetTypeRef | undefined,
  absentRejected: boolean,
): CsharpTargetMember | undefined {
  if (!absentRejected && rejectedResult === undefined) return undefined;
  const asynchronousResult = getCsharpTaskResultTargetType(rejectedResult);
  const asynchronous = asynchronousResult !== undefined;
  const completed = asynchronousResult ?? rejectedResult ?? input;
  const inputVoid = isCsharpVoidTargetType(input);
  const completedVoid = isCsharpVoidTargetType(completed) || isCsharpAbsenceTargetType(completed);
  let result: TargetTypeRef;
  let targetName: string;
  let typeParameterNames: readonly string[];
  if (absentRejected || targetTypeRefEquals(input, completed) || inputVoid && completedVoid) {
    result = input;
    targetName = inputVoid && !asynchronous ? "Then" : asynchronous ? "ThenIdentityAsync" : "ThenIdentity";
    typeParameterNames = [];
  } else if (inputVoid || completedVoid) {
    const element = inputVoid ? completed : input;
    const storage = resolveCsharpOptionalStorage({ kind: "optional", part: "storage", arguments: [element] }, element);
    if (storage === undefined) return undefined;
    result = storage;
    targetName = asynchronous ? "ThenOptionalAsync" : "ThenOptional";
    typeParameterNames = inputVoid ? ["TResult", "TStorage", "TOperations"] : ["TStorage", "TOperations"];
  } else {
    return undefined;
  }
  const fulfilledResult = inputVoid ? completed : completedVoid ? completed : input;
  const delegate = (parameters: readonly TargetTypeRef[], value: TargetTypeRef): TargetTypeRef => {
    const returnsVoid = isCsharpVoidTargetType(value) || isCsharpAbsenceTargetType(value);
    return returnsVoid && !asynchronous
      ? csharpDelegateTargetType("System.Action", parameters)
      : csharpDelegateTargetType("System.Func", parameters, asynchronous ? csharpTaskTargetType(value) : value);
  };
  return receiverHelperMethod(
    `Tsonic.CSharp.Js.PromiseRuntime.then:absent:${targetTypeRefKey(input)}:${targetTypeRefKey(completed)}`,
    "then", targetName, promiseRuntimeType(input), receiver,
    [targetParameter("fulfilled", csharpNullableTargetType(delegate(inputVoid ? [] : [input], fulfilledResult)),
        { optional: absentRejected || inputVoid && completedVoid }),
      targetParameter("rejected", csharpNullableTargetType(delegate([rejectionType], completed)),
        { optional: absentRejected || inputVoid && completedVoid && !asynchronous })],
    csharpTaskTargetType(result),
    {
      csharpBinaryExecutionDriver: csharpJsEventLoopBinaryExecutionDriver,
      ...(typeParameterNames.length === 0 ? {} : {
        typeParameters: typeParameterNames.map(name => ({ name, csharpAllowsRefLike: false })),
      }),
    },
  );
}

function promiseContinuationTypeArguments(member: CsharpTargetMember | undefined): readonly TargetTypeRef[] | undefined {
  const result = getCsharpTaskResultTargetType(member?.returnType);
  if (member === undefined || result === undefined) return undefined;
  const count = member.typeParameters?.length ?? 0;
  if (count === 0) return [];
  if (count === 1) return [result];
  const owner = member.declaringType;
  const rejected = member.parameters?.[2]?.type;
  const callback = getCsharpDelegateSignature(getCsharpNullableElementTargetType(rejected) ?? rejected)?.returnType;
  const element = count === 2 && owner?.kind === "target-named" ? owner.typeArguments?.[0]
    : getCsharpTaskResultTargetType(callback) ?? callback;
  if (element === undefined) return undefined;
  const operations = resolveCsharpOptionalStorage({ kind: "optional", part: "operations", arguments: [element] }, element);
  return operations === undefined ? undefined : count === 2 ? [result, operations] : [element, result, operations];
}

function promiseResolveMember(
  context: CsharpSourceProfileCallPolicyContext,
): CsharpTargetMember | undefined {
  const task = resolveResultTask(context);
  if (task === undefined) {
    return undefined;
  }
  const runtime = promiseRuntimeType(task.result);
  const argument = resolveCsharpSelectedSourceValue(context, context.source.sourceArguments[0]);
  if (context.source.sourceArguments.length === 0) {
    return isCsharpVoidTargetType(task.result)
      ? staticMethod(
          "Tsonic.CSharp.Js.PromiseRuntime.Resolve:void",
          "resolve",
          "Resolve",
          runtime,
          [],
          task.task,
        )
      : undefined;
  }
  if (argument === undefined) return undefined;
  const explicit = context.source.sourceSelectedMethodTypeArguments?.[0];
  const inputResult = getCsharpTaskResultTargetType(argument);
  if (inputResult === undefined && explicit?.explicitTypeNode === undefined) {
    if (explicit === undefined || !targetTypeRefEquals(argument, task.result) &&
      !context.inputs.identicalTypes.get(context.source.sourceArguments[0]!.type)?.has(explicit.selectedType)) return undefined;
  }
  const result = explicit?.explicitTypeNode === undefined
    ? inputResult ?? argument
    : context.inputs.selectedType.get(explicit.explicitTypeNode, explicit.selectedType);
  if (result === undefined || inputResult !== undefined && !targetTypeRefEquals(inputResult, result)) return undefined;
  const parameter = inputResult === undefined ? result : argument;
  return staticMethod(
        `Tsonic.CSharp.Js.PromiseRuntime.Resolve:${targetIdentity(result)}:${targetIdentity(parameter)}`,
        "resolve",
        inputResult === undefined ? "Resolved" : "Resolve",
        promiseRuntimeType(result),
        [targetParameter("value", parameter)],
        csharpTaskTargetType(result),
      );
}

function promiseRejectMember(
  context: CsharpSourceProfileCallPolicyContext,
): CsharpTargetMember | undefined {
  const task = resolveResultTask(context);
  return task === undefined
    ? undefined
    : staticMethod(
        `Tsonic.CSharp.Js.PromiseRuntime.Reject:${targetIdentity(task.result)}`,
        "reject",
        "Reject",
        promiseRuntimeType(task.result),
        [
          targetParameter("reason", objectType, {
            optional: true,
            csharpAcceptsClosedSourceArgument: true,
          }),
        ],
        task.task,
      );
}

function promiseCombinatorMember(
  context: CsharpSourceProfileCallPolicyContext,
  name: string,
): CsharpTargetMember | undefined {
  const task = resolveResultTask(context);
  const argument = resolveCsharpSelectedSourceValue(context, context.source.sourceArguments[0]);
  const argumentElement = getCsharpCollectionElementTargetType(argument);
  if (task === undefined || argument === undefined || argumentElement === undefined) {
    return undefined;
  }

  const inputResult = getCsharpTaskResultTargetType(argumentElement);
  if (inputResult === undefined) {
    return undefined;
  }
  if (name !== "allSettled" && !targetTypeRefEquals(inputResult, task.result)) {
    return undefined;
  }
  return staticMethod(
    `Tsonic.CSharp.Js.PromiseRuntime.${name}:${targetIdentity(inputResult)}:${targetIdentity(task.result)}`,
    name,
    name === "allSettled" ? "AllSettled" : name === "race" ? "Race" : "Any",
    promiseRuntimeType(inputResult),
    [
      targetParameter(
        "values",
        csharpEnumerableTargetType(csharpTaskTargetType(inputResult)),
      ),
    ],
    task.task,
  );
}

function promiseFinallyMember(
  context: CsharpSourceProfileCallPolicyContext,
): CsharpTargetMember | undefined {
  const receiver = resolveCsharpSelectedSourceValue(
    context,
    context.source.sourceReceiver,
  );
  const result = receiver === undefined
    ? undefined
    : getCsharpTaskResultTargetType(receiver);
  return receiver === undefined || result === undefined
    ? undefined
    : receiverHelperMethod(
        `Tsonic.CSharp.Js.PromiseRuntime.Finally:${targetIdentity(result)}`,
        "finally",
        "Finally",
        promiseRuntimeType(result),
        receiver,
        [targetParameter("onFinally", actionType, { optional: true })],
        receiver,
        { csharpBinaryExecutionDriver: csharpJsEventLoopBinaryExecutionDriver },
      );
}

function resolveResultTask(
  context: CsharpSourceProfileCallPolicyContext,
): { readonly task: TargetTypeRef; readonly result: TargetTypeRef } | undefined {
  const task = context.inputs.types.get(context.source.sourceResultType);
  const result = getCsharpTaskResultTargetType(task);
  return task === undefined || result === undefined ? undefined : { task, result };
}

function promiseRuntimeType(result: TargetTypeRef): TargetTypeRef {
  return isCsharpVoidTargetType(result)
    ? csharpTargetNamedType("Tsonic.CSharp.Js.PromiseRuntime", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "PromiseRuntime"), { allowsRefLikeTypeArguments: [],})
    : csharpTargetNamedType("Tsonic.CSharp.Js.PromiseRuntime`1", [result], csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "PromiseRuntime"), { allowsRefLikeTypeArguments: [false],});
}

function targetIdentity(type: TargetTypeRef): string {
  switch (type.kind) {
    case "target-named":
    case "opaque":
      return type.id;
    case "source-primitive":
      return type.name;
    default:
      return type.kind;
  }
}
