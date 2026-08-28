import type {
  CsharpTargetMember,
  TargetTypeRef,
} from "../../../types/index.js";
import {
  csharpEnumerableTargetType,
  csharpJsWeakMapTargetType,
  csharpJsWeakSetTargetType,
  csharpNullableTargetType,
  isCsharpRuntimeNullTargetType,
  csharpSourcePrimitiveTargetType,
  getCsharpJsWeakMapTargetTypes,
  getCsharpJsWeakSetElementTargetType,
  isCsharpValueTypeTargetType,
} from "../../../types/index.js";
import type {
  CsharpSourceProfileCallPolicy,
  CsharpSourceProfileCallPolicyContext,
} from "../source-profile-policy.js";
import { resolveCsharpSelectedSourceValue } from "../source-profile-policy.js";
import {
  instanceMethod,
  jsCallPolicy,
  jsConstructIdentity,
  jsMemberIdentity,
  jsRuntimeTargetType,
  staticMethod,
  targetParameter,
} from "./common.js";

const boolType = csharpSourcePrimitiveTargetType("bool");
const instanceReceiver = { kind: "instance" } as const;
const noReceiver = { kind: "none" } as const;
const firstParameterReceiver = {
  kind: "target-parameter",
  targetParameterIndex: 0,
} as const;
const weakMapHelperType = jsRuntimeTargetType("WeakMap");

export const csharpJsWeakCollectionCallPolicies:
  readonly CsharpSourceProfileCallPolicy[] = Object.freeze([
    jsCallPolicy(
      jsConstructIdentity("WeakMapConstructor"),
      weakMapConstructor,
      noReceiver,
    ),
    jsCallPolicy(
      jsConstructIdentity("WeakSetConstructor"),
      weakSetConstructor,
      noReceiver,
    ),
    jsCallPolicy(
      jsMemberIdentity("WeakMap", "get"),
      weakMapGet,
      firstParameterReceiver,
      { targetMethodTypeArguments: weakMapTypeArguments },
    ),
    ...(["has", "delete"] as const).map((name) =>
      jsCallPolicy(
        jsMemberIdentity("WeakMap", name),
        (context) => weakMapMethod(context, name),
        instanceReceiver,
      )
    ),
    jsCallPolicy(
      jsMemberIdentity("WeakMap", "set"),
      (context) => weakMapMethod(context, "set"),
      instanceReceiver,
    ),
    ...(["has", "delete", "add"] as const).map((name) =>
      jsCallPolicy(
        jsMemberIdentity("WeakSet", name),
        (context) => weakSetMethod(context, name),
        instanceReceiver,
      )
    ),
  ]);

function weakMapShape(context: CsharpSourceProfileCallPolicyContext): {
  readonly receiver: TargetTypeRef;
  readonly key: TargetTypeRef;
  readonly value: TargetTypeRef;
} | undefined {
  const receiver = resolveCsharpSelectedSourceValue(
    context,
    context.source.sourceReceiver,
  );
  const shape = getCsharpJsWeakMapTargetTypes(receiver);
  return receiver === undefined || shape === undefined ||
      isCsharpValueTypeTargetType(shape.key)
    ? undefined
    : { receiver, ...shape };
}

function weakSetShape(context: CsharpSourceProfileCallPolicyContext): {
  readonly receiver: TargetTypeRef;
  readonly element: TargetTypeRef;
} | undefined {
  const receiver = resolveCsharpSelectedSourceValue(
    context,
    context.source.sourceReceiver,
  );
  const element = getCsharpJsWeakSetElementTargetType(receiver);
  return receiver === undefined || element === undefined ||
      isCsharpValueTypeTargetType(element)
    ? undefined
    : { receiver, element };
}

function weakMapGet(
  context: CsharpSourceProfileCallPolicyContext,
): CsharpTargetMember | undefined {
  const shape = weakMapShape(context);
  if (shape === undefined) return undefined;
  const valueType = isCsharpValueTypeTargetType(shape.value);
  return staticMethod(
    `Tsonic.CSharp.Js.WeakMap.${valueType ? "getValue" : "getReference"}`,
    "get",
    valueType ? "getValue" : "getReference",
    weakMapHelperType,
    [
      targetParameter("map", shape.receiver),
      targetParameter("key", shape.key),
    ],
    csharpNullableTargetType(shape.value),
    {
      typeParameters: [
        { name: "TKey", constraints: [{ kind: "reference-type" }] },
        {
          name: "TValue",
          constraints: [{ kind: valueType ? "value-type" : "reference-type" }],
        },
      ],
    },
  );
}

function weakMapMethod(
  context: CsharpSourceProfileCallPolicyContext,
  name: "has" | "delete" | "set",
): CsharpTargetMember | undefined {
  const shape = weakMapShape(context);
  if (shape === undefined) return undefined;
  return instanceMethod(
    `Tsonic.CSharp.Js.WeakMap.${name}`,
    name,
    name,
    shape.receiver,
    name === "set"
      ? [targetParameter("key", shape.key), targetParameter("value", shape.value)]
      : [targetParameter("key", shape.key)],
    name === "set" ? shape.receiver : boolType,
  );
}

function weakSetMethod(
  context: CsharpSourceProfileCallPolicyContext,
  name: "has" | "delete" | "add",
): CsharpTargetMember | undefined {
  const shape = weakSetShape(context);
  if (shape === undefined) return undefined;
  return instanceMethod(
    `Tsonic.CSharp.Js.WeakSet.${name}`,
    name,
    name,
    shape.receiver,
    [targetParameter("value", shape.element)],
    name === "add" ? shape.receiver : boolType,
  );
}

function weakMapConstructor(
  context: CsharpSourceProfileCallPolicyContext,
): CsharpTargetMember | undefined {
  const arguments_ = context.host.types.resolveSourceCallTypeArguments(
    context.source,
    context.sourceFile,
  );
  if (arguments_?.length !== 2 || isCsharpValueTypeTargetType(arguments_[0]!)) {
    return undefined;
  }
  const target = csharpJsWeakMapTargetType(arguments_[0]!, arguments_[1]!);
  const entry: TargetTypeRef = {
    kind: "tuple",
    elements: [arguments_[0]!, arguments_[1]!],
  };
  return {
    id: context.source.sourceArguments.length === 0
      ? "Tsonic.CSharp.Js.WeakMap..ctor()"
      : "Tsonic.CSharp.Js.WeakMap..ctor(IEnumerable)",
    sourceName: "constructor",
    targetName: "WeakMap",
    kind: "constructor",
    declaringType: target,
    parameters: weakConstructorParameters(
      context,
      "entries",
      csharpEnumerableTargetType(entry),
    ),
    returnType: target,
  };
}

function weakSetConstructor(
  context: CsharpSourceProfileCallPolicyContext,
): CsharpTargetMember | undefined {
  const arguments_ = context.host.types.resolveSourceCallTypeArguments(
    context.source,
    context.sourceFile,
  );
  if (arguments_?.length !== 1 || isCsharpValueTypeTargetType(arguments_[0]!)) {
    return undefined;
  }
  const target = csharpJsWeakSetTargetType(arguments_[0]!);
  return {
    id: context.source.sourceArguments.length === 0
      ? "Tsonic.CSharp.Js.WeakSet..ctor()"
      : "Tsonic.CSharp.Js.WeakSet..ctor(IEnumerable)",
    sourceName: "constructor",
    targetName: "WeakSet",
    kind: "constructor",
    declaringType: target,
    parameters: weakConstructorParameters(
      context,
      "values",
      csharpEnumerableTargetType(arguments_[0]!),
    ),
    returnType: target,
  };
}

function weakConstructorParameters(
  context: CsharpSourceProfileCallPolicyContext,
  name: string,
  collection: TargetTypeRef,
): readonly ReturnType<typeof targetParameter>[] {
  const sourceArgument = context.source.sourceArguments[0];
  if (sourceArgument === undefined) {
    return [];
  }
  const sourceType = resolveCsharpSelectedSourceValue(context, sourceArgument);
  return [targetParameter(
    name,
    isCsharpRuntimeNullTargetType(sourceType)
      ? csharpNullableTargetType(collection)
      : collection,
  )];
}

function weakMapTypeArguments(
  context: CsharpSourceProfileCallPolicyContext,
): readonly TargetTypeRef[] | undefined {
  const shape = weakMapShape(context);
  return shape === undefined ? undefined : [shape.key, shape.value];
}
