import type {
  CsharpTargetMember,
  TargetTypeRef,
} from "../../../types/index.js";
import {
  csharpDelegateTargetType,
  csharpEnumerableTargetType,
  csharpObjectTargetType,
  csharpNullableTargetType,
  csharpTaskTargetType,
  getCsharpCollectionElementTargetType,
  getCsharpTaskResultTargetType,
  getCsharpDelegateSignature,
  isCsharpVoidTargetType,
  targetTypeRefEquals,
} from "../../../types/index.js";
import type {
  CsharpSourceProfileCallPolicy,
  CsharpSourceProfileCallPolicyContext,
} from "../source-profile-policy.js";
import { resolveCsharpSelectedSourceValue } from "../source-profile-policy.js";
import {
  jsCallPolicy,
  jsMemberIdentity,
  receiverHelperMethod,
  staticMethod,
  targetParameter,
} from "./common.js";
import {
  csharpQualifiedTypeRenderShape,
} from "../../../types/index.js";
import { csharpTargetNamedType } from "../../../types/index.js";

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
    jsCallPolicy(
      jsMemberIdentity("Promise", "then"),
      context => promiseContinuationMember(context, "then"),
      firstParameterReceiver,
      { targetMethodTypeArguments: context => {
        const result = getCsharpTaskResultTargetType(promiseContinuationMember(context, "then")?.returnType);
        return result === undefined ? undefined : isCsharpVoidTargetType(result) ? [] : [result];
      } },
    ),
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
  const output = resolveResultTask(context);
  if (receiver === undefined || input === undefined || output === undefined) return undefined;
  if (name === "catch" && !targetTypeRefEquals(input, output.result)) return undefined;
  const callbackResults = context.source.sourceArguments.map(argument =>
    getCsharpDelegateSignature(resolveCsharpSelectedSourceValue(context, argument))?.returnType);
  const asynchronous = name === "then" && callbackResults[0] !== undefined &&
    getCsharpTaskResultTargetType(callbackResults[0]) !== undefined;
  const selected = context.source.sourceSelectedMethodTypeArguments?.[0];
  const result = name === "catch" ? input : selected?.explicitTypeNode !== undefined
    ? context.host.types.resolveSelectedType(selected.explicitTypeNode, selected.selectedType, context.sourceFile)
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
    name === "then" && !isCsharpVoidTargetType(result)
      ? { typeParameters: [{ name: "TResult" }] } : {},
  );
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
    const types = context.host.semantics(context.sourceFile).types;
    if (explicit === undefined || !targetTypeRefEquals(argument, task.result) &&
      types.relationship(context.source.sourceArguments[0]!.type, explicit.selectedType) !== "identical") return undefined;
  }
  const result = explicit?.explicitTypeNode === undefined
    ? inputResult ?? argument
    : context.host.types.resolveSelectedType(explicit.explicitTypeNode, explicit.selectedType, context.sourceFile);
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
      );
}

function resolveResultTask(
  context: CsharpSourceProfileCallPolicyContext,
): { readonly task: TargetTypeRef; readonly result: TargetTypeRef } | undefined {
  const task = context.host.types.resolveType(
    context.source.sourceResultType,
    context.sourceFile,
  );
  const result = getCsharpTaskResultTargetType(task);
  return task === undefined || result === undefined ? undefined : { task, result };
}

function promiseRuntimeType(result: TargetTypeRef): TargetTypeRef {
  return isCsharpVoidTargetType(result)
    ? csharpTargetNamedType(
        "Tsonic.CSharp.Js.PromiseRuntime",
        undefined,
        csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "PromiseRuntime"),
      )
    : csharpTargetNamedType(
        "Tsonic.CSharp.Js.PromiseRuntime`1",
        [result],
        csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "PromiseRuntime"),
      );
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
