import type {
  CsharpTargetMember,
  TargetTypeRef,
} from "../../types/index.js";
import {
  csharpNullableTargetType,
  csharpObjectTargetType,
  csharpJsArrayTargetType,
  csharpQualifiedTypeRenderShape,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpTargetNamedType,
  csharpTaskTargetType,
  csharpVoidTargetType,
  getCsharpTaskResultTargetType,
  isCsharpVoidTargetType,
  targetTypeRefKey,
} from "../../types/index.js";
import type {
  CsharpSourceProfileCallPolicy,
} from "../source-profile-policy.js";
import {
  closedObjectParameter,
  jsCallIdentity,
  jsCallPolicy,
  jsConstructIdentity,
  jsMemberIdentity,
  jsRuntimeTargetType,
  jsUnsupportedCallPolicy,
  receiverHelperMethod,
  staticMethod,
  targetParameter,
} from "./common.js";

const stringType = csharpStringTargetType();
const boolType = csharpSourcePrimitiveTargetType("bool");
const voidType = csharpVoidTargetType();
const objectType = csharpObjectTargetType();
const objectRuntimeType = jsRuntimeTargetType("Object");
const jsonRuntimeType = jsRuntimeTargetType("JSON");
const jsonValueType = jsRuntimeTargetType("TsValue");
const promiseRuntimeType = jsRuntimeTargetType("PromiseRuntime");
const noReceiver = { kind: "none" } as const;
const firstParameterReceiver = {
  kind: "target-parameter",
  targetParameterIndex: 0,
} as const;

const unsupportedObjectMethods = [
  "getPrototypeOf",
  "setPrototypeOf",
  "create",
  "defineProperty",
  "defineProperties",
  "freeze",
  "fromEntries",
  "getOwnPropertyDescriptor",
  "getOwnPropertyDescriptors",
  "getOwnPropertyNames",
  "getOwnPropertySymbols",
  "isExtensible",
  "isFrozen",
  "isSealed",
  "preventExtensions",
  "seal",
] as const;

export const csharpJsObjectCallPolicies:
  readonly CsharpSourceProfileCallPolicy[] = Object.freeze([
    jsCallPolicy(
      jsMemberIdentity("ObjectConstructor", "is"),
      () =>
        staticMethod(
          "Tsonic.CSharp.Js.Object.is",
          "is",
          "@is",
          objectRuntimeType,
          [
            closedObjectParameter("value"),
            closedObjectParameter("other"),
          ],
          boolType,
        ),
      noReceiver,
    ),
    ...["keys", "values", "entries"].map((name) =>
      jsCallPolicy(
        jsMemberIdentity("ObjectConstructor", name),
        (context) => objectCollectionMember(context, name),
        noReceiver,
      )
    ),
    jsCallPolicy(
      jsMemberIdentity("ObjectConstructor", "hasOwn"),
      (context) => objectHasOwnMember(context),
      noReceiver,
    ),
    jsCallPolicy(
      jsMemberIdentity("ObjectConstructor", "assign"),
      (context) => objectAssignMember(context),
      noReceiver,
    ),
    jsCallPolicy(
      jsMemberIdentity("Object", "hasOwnProperty"),
      (context) => objectPrototypeHasOwnMember(context),
      firstParameterReceiver,
    ),
    jsCallPolicy(
      jsMemberIdentity("Object", "toString"),
      (context) => objectToStringMember(context),
      firstParameterReceiver,
    ),
    ...unsupportedObjectMethods.map((name) =>
      jsUnsupportedCallPolicy(
        jsMemberIdentity("ObjectConstructor", name),
        `Object.${name} requires closed descriptor/prototype/extensibility semantics that are not represented by the selected C# runtime policy.`,
      )
    ),
    jsCallPolicy(
      jsMemberIdentity("JSON", "parse"),
      () =>
        staticMethod(
          "Tsonic.CSharp.Js.JSON.parse",
          "parse",
          "parse",
          jsonRuntimeType,
          [targetParameter("text", stringType)],
          jsonValueType,
        ),
      noReceiver,
    ),
    jsCallPolicy(
      jsMemberIdentity("JSON", "stringify"),
      (context) => jsonStringifyMember(context),
      noReceiver,
    ),
    jsCallPolicy(
      jsConstructIdentity("PromiseConstructor"),
      (context) => promiseConstructorMember(context),
      noReceiver,
    ),
    jsCallPolicy(
      jsMemberIdentity("PromiseConstructor", "all"),
      (context) => promiseAllMember(context),
      noReceiver,
    ),
    ...["resolve", "reject"].map((name) =>
      jsUnsupportedCallPolicy(
        jsMemberIdentity("PromiseConstructor", name),
        `Promise.${name} requires a closed Promise/Task carrier relation that has not yet been declared by the JS source profile.`,
      )
    ),
    ...["then", "catch"].map((name) =>
      jsUnsupportedCallPolicy(
        jsMemberIdentity("Promise", name),
        `Promise.${name} requires a closed continuation and scheduler policy; no target-side inference or callback reconstruction is permitted.`,
      )
    ),
    jsUnsupportedCallPolicy(
      jsConstructIdentity("FunctionConstructor"),
      "Function construction compiles source text at runtime and has no closed C# source-to-source representation.",
    ),
    jsUnsupportedCallPolicy(
      jsCallIdentity("FunctionConstructor"),
      "Function construction compiles source text at runtime and has no closed C# source-to-source representation.",
    ),
    jsUnsupportedCallPolicy(
      jsConstructIdentity("ProxyConstructor"),
      "Proxy traps redefine object operations dynamically and have no closed C# source-to-source representation.",
    ),
    jsUnsupportedCallPolicy(
      jsMemberIdentity("ProxyConstructor", "revocable"),
      "Proxy traps redefine object operations dynamically and have no closed C# source-to-source representation.",
    ),
  ]);

function objectCollectionMember(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
  name: string,
): CsharpTargetMember | undefined {
  const argumentType = context.host.types.resolveType(
    context.source.sourceArguments[0]?.type,
    context.sourceFile,
  );
  const resultType = context.host.types.resolveType(
    context.source.sourceResultType,
    context.sourceFile,
  );
  return argumentType === undefined || resultType === undefined
    ? undefined
    : staticMethod(
        `Tsonic.CSharp.Js.Object.${name}:${targetTypeIdentity(argumentType)}`,
        name,
        name,
        objectRuntimeType,
        [targetParameter("value", argumentType)],
        resultType,
      );
}

function objectHasOwnMember(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
): CsharpTargetMember | undefined {
  const valueType = context.host.types.resolveType(
    context.source.sourceArguments[0]?.type,
    context.sourceFile,
  );
  return valueType === undefined
    ? undefined
    : staticMethod(
        `Tsonic.CSharp.Js.Object.hasOwn:${targetTypeIdentity(valueType)}`,
        "hasOwn",
        "hasOwn",
        objectRuntimeType,
        [
          targetParameter("value", valueType),
          targetParameter("key", stringType),
        ],
        boolType,
      );
}

function objectAssignMember(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
): CsharpTargetMember | undefined {
  const targetType = context.host.types.resolveType(
    context.source.sourceArguments[0]?.type,
    context.sourceFile,
  );
  return targetType === undefined
    ? undefined
    : staticMethod(
        `Tsonic.CSharp.Js.Object.assign:${targetTypeIdentity(targetType)}`,
        "assign",
        "assign",
        objectRuntimeType,
        [
          targetParameter("target", targetType),
          closedObjectParameter("source"),
        ],
        targetType,
      );
}

function objectPrototypeHasOwnMember(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
): CsharpTargetMember | undefined {
  const receiverType = context.host.types.resolveType(
    context.source.sourceReceiver?.type,
    context.sourceFile,
  );
  return receiverType === undefined
    ? undefined
    : receiverHelperMethod(
        `Tsonic.CSharp.Js.Object.hasOwn:${targetTypeIdentity(receiverType)}`,
        "hasOwnProperty",
        "hasOwn",
        objectRuntimeType,
        receiverType,
        [targetParameter("key", stringType)],
        boolType,
      );
}

function objectToStringMember(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
): CsharpTargetMember | undefined {
  const receiverType = context.host.types.resolveType(
    context.source.sourceReceiver?.type,
    context.sourceFile,
  );
  return receiverType === undefined
    ? undefined
    : Object.freeze({
        ...staticMethod(
          `Tsonic.CSharp.Js.Object.toString:${targetTypeIdentity(receiverType)}`,
          "toString",
          "toString",
          jsRuntimeTargetType("Object"),
          [closedObjectParameter("receiver")],
          stringType,
        ),
        receiverPassing: "first-argument",
      });
}

function jsonStringifyMember(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
): CsharpTargetMember | undefined {
  const valueType = context.host.types.resolveType(
    context.source.sourceArguments[0]?.type,
    context.sourceFile,
  );
  return valueType === undefined
    ? undefined
    : staticMethod(
        `Tsonic.CSharp.Js.JSON.stringify:${targetTypeIdentity(valueType)}`,
        "stringify",
        "stringify",
        jsonRuntimeType,
        [
          targetParameter("value", valueType, {
            csharpAcceptsClosedSourceArgument: true,
          }),
        ],
        stringType,
        {
          csharpCallFinalization: {
            kind: "closed-json-value",
            argumentIndex: 0,
          },
        },
      );
}

function promiseConstructorMember(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
): CsharpTargetMember | undefined {
  const taskType = context.host.types.resolveType(
    context.source.sourceResultType,
    context.sourceFile,
  );
  const resultType = getCsharpTaskResultTargetType(taskType);
  if (taskType === undefined || resultType === undefined) {
    return undefined;
  }
  const voidPromise = isCsharpVoidTargetType(resultType);
  const resolveType = voidPromise
    ? promiseDelegate(
        "PromiseResolve",
        [],
        [csharpNullableTargetType(objectType)],
      )
    : promiseDelegate("PromiseResolve", [resultType], [resultType]);
  const rejectType = promiseDelegate(
    "PromiseReject",
    [],
    [csharpNullableTargetType(objectType)],
  );
  const executorType = promiseDelegate(
    "PromiseExecutor",
    voidPromise ? [] : [resultType],
    [resolveType, rejectType],
  );
  const factoryType = voidPromise
    ? promiseRuntimeType
    : csharpTargetNamedType(
        "Tsonic.CSharp.Js.PromiseRuntime`1",
        [resultType],
        csharpQualifiedTypeRenderShape(
          "Tsonic.CSharp.Js",
          "PromiseRuntime",
        ),
      );
  return Object.freeze({
    id: voidPromise
      ? "Tsonic.CSharp.Js.PromiseRuntime.Create:void"
      : `Tsonic.CSharp.Js.PromiseRuntime.Create:${targetTypeIdentity(resultType)}`,
    sourceName: "constructor",
    targetName: "Create",
    kind: "constructor",
    declaringType: taskType,
    parameters: [
      targetParameter("executor", executorType, {
        csharpAcceptsCheckedSourceArgument: true,
      }),
    ],
    returnType: taskType,
    csharpInvocation: {
      kind: "static-factory-construction",
      factoryType,
    },
  } satisfies CsharpTargetMember);
}

function promiseAllMember(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
): CsharpTargetMember | undefined {
  const taskType = context.host.types.resolveType(
    context.source.sourceResultType,
    context.sourceFile,
  );
  const resultType = getCsharpTaskResultTargetType(taskType);
  const elementType = resultType?.kind === "target-named" &&
      resultType.id === "Tsonic.CSharp.Js.JSArray`1"
    ? resultType.typeArguments?.[0]
    : resultType?.kind === "array"
      ? resultType.element
      : undefined;
  if (taskType === undefined || elementType === undefined) {
    return undefined;
  }
  const factoryType = csharpTargetNamedType(
    "Tsonic.CSharp.Js.PromiseRuntime`1",
    [elementType],
    csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "PromiseRuntime"),
  );
  const taskElementType = csharpTaskTargetType(elementType);
  return staticMethod(
    `Tsonic.CSharp.Js.PromiseRuntime.All:${targetTypeIdentity(elementType)}`,
    "all",
    "All",
    factoryType,
    [
      targetParameter(
        "values",
        csharpJsArrayTargetType(taskElementType),
      ),
    ],
    taskType,
  );
}

function promiseDelegate(
  name: string,
  typeArguments: readonly TargetTypeRef[],
  parameters: readonly TargetTypeRef[],
): TargetTypeRef {
  return csharpTargetNamedType(
    typeArguments.length === 0
      ? `Tsonic.CSharp.Js.${name}`
      : `Tsonic.CSharp.Js.${name}\`${typeArguments.length}`,
    typeArguments.length === 0 ? undefined : typeArguments,
    csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", name),
    {
      delegateSignature: {
      parameters,
      returnType: voidType,
      },
    },
  );
}

function targetTypeIdentity(type: TargetTypeRef): string {
  return targetTypeRefKey(type);
}
