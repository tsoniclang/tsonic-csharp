import type {
  Node,
} from "@tsonic/tsts";
import type {
  CsharpCallArtifactRequirement,
  CsharpObjectShapeProjectionKind,
  CsharpTargetInvocation,
  CsharpTargetMember,
  TargetTypeRef,
} from "../../../types/index.js";
import {
  csharpNullableTargetType,
  csharpObjectTargetType,
  csharpJsArrayTargetType,
  csharpQualifiedTypeRenderShape,
  csharpRuntimeUnionTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpTargetNamedType,
  csharpTaskTargetType,
  csharpVoidTargetType,
  getCsharpTaskResultTargetType,
  isCsharpRecordDictionaryTargetType,
  isCsharpVoidTargetType,
  targetTypeRefEquals,
  targetTypeRefKey,
} from "../../../types/index.js";
import type {
  CsharpSourceProfileCallPolicy,
} from "../source-profile-policy.js";
import {
  resolveCsharpSelectedSourceValue,
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
const objectCollectionRows = [
  { sourceName: "keys", result: "keys" },
  { sourceName: "values", result: "values" },
  { sourceName: "entries", result: "entries" },
] as const;

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
    ...objectCollectionRows.map((row) =>
      jsCallPolicy(
        jsMemberIdentity("ObjectConstructor", row.sourceName),
        (context) => objectCollectionMember(context, row),
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
  row: typeof objectCollectionRows[number],
): CsharpTargetMember | undefined {
  const argumentType = resolveCsharpSelectedSourceValue(
    context,
    context.source.sourceArguments[0],
  );
  const resultType = context.host.types.resolveType(
    context.source.sourceResultType,
    context.sourceFile,
  );
  const refinedResultType = argumentType === undefined || resultType === undefined
    ? undefined
    : objectCollectionResultType(row.result, argumentType, resultType);
  return argumentType === undefined || refinedResultType === undefined
    ? undefined
    : staticMethod(
        `Tsonic.CSharp.Js.Object.${row.sourceName}:${targetTypeIdentity(argumentType)}`,
        row.sourceName,
        row.sourceName,
        objectRuntimeType,
        [targetParameter("value", argumentType)],
        refinedResultType,
        objectShapeProjectionOptions(
          context,
          context.source.sourceArguments[0],
          argumentType,
          row.result,
          0,
        ),
      );
}

function objectCollectionResultType(
  result: typeof objectCollectionRows[number]["result"],
  argumentType: TargetTypeRef,
  sourceResultType: TargetTypeRef,
): TargetTypeRef | undefined {
  if (
    !isCsharpRecordDictionaryTargetType(argumentType) ||
    argumentType.typeArguments?.length !== 2 ||
    !targetTypeRefEquals(argumentType.typeArguments[0]!, stringType)
  ) {
    return sourceResultType;
  }
  const valueType = argumentType.typeArguments[1]!;
  switch (result) {
    case "keys":
      return csharpJsArrayTargetType(stringType);
    case "values":
      return csharpJsArrayTargetType(valueType);
    case "entries":
      return csharpJsArrayTargetType({
        kind: "tuple",
        elements: [stringType, valueType],
      });
    default:
      return undefined;
  }
}

function objectHasOwnMember(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
): CsharpTargetMember | undefined {
  const valueType = resolveCsharpSelectedSourceValue(
    context,
    context.source.sourceArguments[0],
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
        objectShapeProjectionOptions(
          context,
          context.source.sourceArguments[0],
          valueType,
          "has-own",
          0,
        ),
      );
}

function objectAssignMember(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
): CsharpTargetMember | undefined {
  const targetType = resolveCsharpSelectedSourceValue(
    context,
    context.source.sourceArguments[0],
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
  const receiverType = resolveCsharpSelectedSourceValue(
    context,
    context.source.sourceReceiver,
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
        objectShapeProjectionOptions(
          context,
          context.source.sourceReceiver,
          receiverType,
          "has-own",
          0,
          { kind: "receiver" },
        ),
      );
}

function objectToStringMember(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
): CsharpTargetMember | undefined {
  const receiverType = resolveCsharpSelectedSourceValue(
    context,
    context.source.sourceReceiver,
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
  const valueType = resolveCsharpSelectedSourceValue(
    context,
    context.source.sourceArguments[0],
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
          csharpArtifactRequirements: [{
            kind: "object-shape-capability",
            source: { kind: "argument", index: 0 },
            capability: "json-serialization",
            rootKind: "value",
          }],
        },
      );
}

function objectShapeProjectionOptions(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
  sourceValue: { readonly expression: Node } | undefined,
  selectedTargetType: TargetTypeRef,
  projection: CsharpObjectShapeProjectionKind,
  targetParameterIndex: number,
  source: CsharpCallArtifactRequirement["source"] = {
    kind: "argument",
    index: 0,
  },
): {
  readonly csharpArtifactRequirements?: readonly CsharpCallArtifactRequirement[];
  readonly csharpInvocation?: CsharpTargetInvocation;
} {
  if (
    sourceValue === undefined ||
    isCsharpRecordDictionaryTargetType(selectedTargetType)
  ) {
    return {};
  }
  const shape = context.host.objectShapes?.resolveNode(
    sourceValue.expression,
    context.sourceFile,
  ) ?? context.host.objectShapes?.resolveTarget(selectedTargetType);
  return shape === undefined
    ? {}
    : {
        csharpArtifactRequirements: [{
          kind: "object-shape-projection",
          source,
          projection,
          rootKind: "object-shape",
        }],
        csharpInvocation: {
          kind: "object-shape-projection",
          targetParameterIndex,
          projection,
        },
      };
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
  const resolveValueType = voidPromise
    ? undefined
    : csharpRuntimeUnionTargetType([resultType, taskType]);
  if (!voidPromise && resolveValueType === undefined) {
    return undefined;
  }
  const resolveType = voidPromise
    ? promiseDelegate(
        "PromiseResolve",
        [],
        [csharpNullableTargetType(objectType)],
        [0],
      )
    : promiseDelegate(
        "PromiseResolve",
        [resultType],
        [resolveValueType!],
      );
  const rejectType = promiseDelegate(
    "PromiseReject",
    [],
    [csharpNullableTargetType(objectType)],
    [0],
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
  optionalParameterIndexes: readonly number[] = [],
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
        ...(optionalParameterIndexes.length === 0
          ? {}
          : { optionalParameterIndexes }),
      },
    },
  );
}

function targetTypeIdentity(type: TargetTypeRef): string {
  return targetTypeRefKey(type);
}
