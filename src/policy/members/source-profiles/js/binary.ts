import type {
  CsharpTargetMember,
  CsharpTargetNamedTypeRef,
  TargetTypeRef,
} from "../../../types/index.js";
import {
  csharpDelegateTargetType,
  csharpEnumerableTargetType,
  csharpJsArrayBufferTargetType,
  csharpJsDataViewTargetType,
  csharpJsTypedArrayElementTargetType,
  csharpJsTypedArrayTargetType,
  csharpNullableValueTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpVoidTargetType,
  type CsharpJsTypedArrayName,
} from "../../../types/index.js";
import type {
  CsharpSourceProfileCallPolicy,
  CsharpSourceProfileCallPolicyContext,
  CsharpSourceProfileElementPolicy,
  CsharpSourceProfileElementPolicyContext,
  CsharpSourceProfilePropertyPolicy,
  CsharpSourceProfilePropertyPolicyContext,
} from "../source-profile-policy.js";
import { resolveCsharpSelectedSourceValue } from "../source-profile-policy.js";
import {
  instanceMethod,
  jsCallPolicy,
  jsConstructIdentity,
  jsElementPolicy,
  jsIndexerIdentity,
  jsMemberIdentity,
  jsPropertyPolicy,
  jsRuntimeTargetType,
  targetIndexer,
  targetParameter,
  targetProperty,
} from "./common.js";

const doubleType = csharpSourcePrimitiveTargetType("float64");
const boolType = csharpSourcePrimitiveTargetType("bool");
const stringType = csharpStringTargetType();
const voidType = csharpVoidTargetType();
const arrayBufferType = csharpJsArrayBufferTargetType();
const dataViewType = csharpJsDataViewTargetType();
const instanceReceiver = { kind: "instance" } as const;
const noReceiver = { kind: "none" } as const;
const typedArrayRuntimeType = jsRuntimeTargetType("TypedArrayRuntime");

const typedArrayNames = [
  "Int8Array",
  "Uint8Array",
  "Uint8ClampedArray",
  "Int16Array",
  "Uint16Array",
  "Int32Array",
  "Uint32Array",
  "Float32Array",
  "Float64Array",
] as const satisfies readonly CsharpJsTypedArrayName[];

const dataViewReadMethods = [
  "getInt8",
  "getUint8",
  "getInt16",
  "getUint16",
  "getInt32",
  "getUint32",
  "getFloat32",
  "getFloat64",
] as const;

const dataViewWriteMethods = [
  "setInt8",
  "setUint8",
  "setInt16",
  "setUint16",
  "setInt32",
  "setUint32",
  "setFloat32",
  "setFloat64",
] as const;

export const csharpJsBinaryCallPolicies:
  readonly CsharpSourceProfileCallPolicy[] = Object.freeze([
    jsCallPolicy(
      jsConstructIdentity("ArrayBufferConstructor"),
      () => constructorMember(
        "Tsonic.CSharp.Js.ArrayBuffer..ctor",
        arrayBufferType,
        [targetParameter("byteLength", doubleType)],
      ),
      noReceiver,
    ),
    jsCallPolicy(
      jsMemberIdentity("ArrayBuffer", "slice"),
      () => instanceMethod(
        "Tsonic.CSharp.Js.ArrayBuffer.slice",
        "slice",
        "slice",
        arrayBufferType,
        [
          targetParameter("begin", doubleType, { optional: true }),
          targetParameter("end", csharpNullableValueTargetType(doubleType), { optional: true }),
        ],
        arrayBufferType,
      ),
      instanceReceiver,
    ),
    jsCallPolicy(
      jsConstructIdentity("DataViewConstructor"),
      () => constructorMember(
        "Tsonic.CSharp.Js.DataView..ctor",
        dataViewType,
        [
          targetParameter("buffer", arrayBufferType),
          targetParameter("byteOffset", doubleType, { optional: true }),
          targetParameter("byteLength", csharpNullableValueTargetType(doubleType), { optional: true }),
        ],
      ),
      noReceiver,
    ),
    ...dataViewReadMethods.map((name) =>
      jsCallPolicy(
        jsMemberIdentity("DataView", name),
        (context) => dataViewMember(context, name, false),
        instanceReceiver,
      )
    ),
    ...dataViewWriteMethods.map((name) =>
      jsCallPolicy(
        jsMemberIdentity("DataView", name),
        (context) => dataViewMember(context, name, true),
        instanceReceiver,
      )
    ),
    ...typedArrayNames.map((name) =>
      jsCallPolicy(
        jsConstructIdentity(`${name}Constructor`),
        (context) => typedArrayConstructor(context, name),
        noReceiver,
      )
    ),
    ...["fill", "includes", "indexOf", "join", "reverse", "set", "slice", "sort", "subarray"].map((name) =>
      jsCallPolicy(
        jsMemberIdentity("TypedArray", name),
        (context) => typedArrayMethod(context, name),
        instanceReceiver,
      )
    ),
  ]);

export const csharpJsBinaryPropertyPolicies:
  readonly CsharpSourceProfilePropertyPolicy[] = Object.freeze([
    jsPropertyPolicy(
      jsMemberIdentity("ArrayBuffer", "byteLength"),
      () => targetProperty(
        "Tsonic.CSharp.Js.ArrayBuffer.byteLength",
        "byteLength",
        "byteLength",
        arrayBufferType,
        doubleType,
        { readonly: true },
      ),
      instanceReceiver,
    ),
    ...["buffer", "byteLength", "byteOffset"].map((name) =>
      jsPropertyPolicy(
        jsMemberIdentity("ArrayBufferView", name),
        (context) => arrayBufferViewProperty(context, name),
        instanceReceiver,
      )
    ),
    ...["length", "BYTES_PER_ELEMENT"].map((name) =>
      jsPropertyPolicy(
        jsMemberIdentity("TypedArray", name),
        (context) => typedArrayProperty(context, name),
        instanceReceiver,
      )
    ),
    ...typedArrayNames.map((name) =>
      jsPropertyPolicy(
        jsMemberIdentity(`${name}Constructor`, "BYTES_PER_ELEMENT"),
        () => targetProperty(
          `Tsonic.CSharp.Js.TypedArrayRuntime.${name}.BYTES_PER_ELEMENT`,
          "BYTES_PER_ELEMENT",
          `${name.replace("Array", "")}BytesPerElement`,
          typedArrayRuntimeType,
          doubleType,
          { static: true, readonly: true },
        ),
        noReceiver,
      )
    ),
  ]);

export const csharpJsBinaryElementPolicies:
  readonly CsharpSourceProfileElementPolicy[] = Object.freeze([
    jsElementPolicy(
      jsIndexerIdentity("TypedArray"),
      (context) => {
        const receiver = typedArrayAccessReceiver(context);
        const element = csharpJsTypedArrayElementTargetType(receiver);
        return receiver === undefined || element === undefined
          ? undefined
          : targetIndexer(
              `Tsonic.CSharp.Js.TypedArray.indexer:${receiver.id}`,
              receiver,
              doubleType,
              element,
              false,
            );
      },
    ),
  ]);

function constructorMember(
  id: string,
  target: TargetTypeRef,
  parameters: readonly ReturnType<typeof targetParameter>[],
): CsharpTargetMember {
  return Object.freeze({
    id,
    sourceName: "constructor",
    targetName: target.kind === "target-named"
      ? target.id.slice(target.id.lastIndexOf(".") + 1)
      : "constructor",
    kind: "constructor",
    declaringType: target,
    parameters: Object.freeze(parameters),
    returnType: target,
  });
}

function dataViewMember(
  context: CsharpSourceProfileCallPolicyContext,
  name: typeof dataViewReadMethods[number] | typeof dataViewWriteMethods[number],
  write: boolean,
): CsharpTargetMember | undefined {
  const receiver = resolveCsharpSelectedSourceValue(
    context,
    context.source.sourceReceiver,
  );
  if (
    receiver?.kind !== "target-named" ||
    (receiver as CsharpTargetNamedTypeRef).csharpJsSurfaceKind !== "data-view"
  ) {
    return undefined;
  }
  const endian = name.endsWith("16") || name.endsWith("32") || name.endsWith("64");
  return instanceMethod(
    `Tsonic.CSharp.Js.DataView.${name}`,
    name,
    name,
    receiver,
    [
      targetParameter("byteOffset", doubleType),
      ...(write ? [targetParameter("value", doubleType)] : []),
      ...(endian ? [targetParameter("littleEndian", boolType, { optional: true })] : []),
    ],
    write ? voidType : doubleType,
  );
}

function typedArrayConstructor(
  context: CsharpSourceProfileCallPolicyContext,
  name: CsharpJsTypedArrayName,
): CsharpTargetMember | undefined {
  const target = csharpJsTypedArrayTargetType(name);
  const parameters = context.source.sourceSelectedSignatureParameters.length === 3
    ? [
        targetParameter("buffer", arrayBufferType),
        targetParameter("byteOffset", doubleType, { optional: true }),
        targetParameter("length", csharpNullableValueTargetType(doubleType), { optional: true }),
      ]
    : (() => {
        const argument = resolveCsharpSelectedSourceValue(context, context.source.sourceArguments[0]);
        return argument?.kind === "source-primitive" && argument.name === "float64"
          ? [targetParameter("length", doubleType)]
          : [targetParameter("values", csharpEnumerableTargetType(doubleType))];
      })();
  return constructorMember(
    `Tsonic.CSharp.Js.${name}..ctor:${parameters.length}:${parameters[0]?.name ?? "none"}`,
    target,
    parameters,
  );
}

function typedArrayMethod(
  context: CsharpSourceProfileCallPolicyContext,
  name: string,
): CsharpTargetMember | undefined {
  const receiver = typedArrayCallReceiver(context);
  if (receiver === undefined) {
    return undefined;
  }
  const parameters = typedArrayMethodParameters(name);
  const result = name === "includes"
    ? boolType
    : name === "indexOf"
      ? doubleType
      : name === "join"
        ? stringType
        : name === "set"
          ? voidType
          : receiver;
  return parameters === undefined
    ? undefined
    : instanceMethod(
        `Tsonic.CSharp.Js.TypedArray.${name}:${receiver.id}`,
        name,
        name,
        receiver,
        parameters,
        result,
      );
}

function typedArrayMethodParameters(
  name: string,
): readonly ReturnType<typeof targetParameter>[] | undefined {
  switch (name) {
    case "fill":
      return [
        targetParameter("value", doubleType),
        targetParameter("start", doubleType, { optional: true }),
        targetParameter("end", csharpNullableValueTargetType(doubleType), { optional: true }),
      ];
    case "includes":
    case "indexOf":
      return [
        targetParameter("searchElement", doubleType),
        targetParameter("fromIndex", doubleType, { optional: true }),
      ];
    case "join":
      return [targetParameter("separator", stringType, { optional: true })];
    case "reverse":
      return [];
    case "set":
      return [
        targetParameter("source", csharpEnumerableTargetType(doubleType)),
        targetParameter("offset", doubleType, { optional: true }),
      ];
    case "slice":
    case "subarray":
      return [
        targetParameter("begin", doubleType, { optional: true }),
        targetParameter("end", csharpNullableValueTargetType(doubleType), { optional: true }),
      ];
    case "sort":
      return [
        targetParameter(
          "compareFn",
          csharpDelegateTargetType("System.Func", [doubleType, doubleType], doubleType),
          { optional: true },
        ),
      ];
    default:
      return undefined;
  }
}

function arrayBufferViewProperty(
  context: Parameters<CsharpSourceProfilePropertyPolicy["select"]>[0],
  name: string,
): CsharpTargetMember | undefined {
  const receiver = resolveCsharpSelectedSourceValue(context, context.source.receiver);
  if (
    receiver?.kind !== "target-named" ||
    (receiver as CsharpTargetNamedTypeRef).csharpJsSurfaceKind !== "data-view" &&
      (receiver as CsharpTargetNamedTypeRef).csharpJsSurfaceKind !== "typed-array"
  ) {
    return undefined;
  }
  return targetProperty(
    `Tsonic.CSharp.Js.ArrayBufferView.${name}:${receiver.id}`,
    name,
    name,
    receiver,
    name === "buffer" ? arrayBufferType : doubleType,
    { readonly: true },
  );
}

function typedArrayProperty(
  context: Parameters<CsharpSourceProfilePropertyPolicy["select"]>[0],
  name: string,
): CsharpTargetMember | undefined {
  const receiver = typedArrayAccessReceiver(context);
  return receiver === undefined
    ? undefined
    : targetProperty(
        `Tsonic.CSharp.Js.TypedArray.${name}:${receiver.id}`,
        name,
        name,
        receiver,
        doubleType,
        { readonly: true },
      );
}

function typedArrayCallReceiver(
  context: CsharpSourceProfileCallPolicyContext,
): CsharpTargetNamedTypeRef | undefined {
  const receiver = resolveCsharpSelectedSourceValue(
    context,
    context.source.sourceReceiver,
  );
  return receiver?.kind === "target-named" &&
      (receiver as CsharpTargetNamedTypeRef).csharpJsSurfaceKind === "typed-array"
    ? receiver as CsharpTargetNamedTypeRef
    : undefined;
}

function typedArrayAccessReceiver(
  context:
    | CsharpSourceProfilePropertyPolicyContext
    | CsharpSourceProfileElementPolicyContext,
): CsharpTargetNamedTypeRef | undefined {
  const receiver = resolveCsharpSelectedSourceValue(
    context,
    context.source.receiver,
  );
  return receiver?.kind === "target-named" &&
      (receiver as CsharpTargetNamedTypeRef).csharpJsSurfaceKind === "typed-array"
    ? receiver as CsharpTargetNamedTypeRef
    : undefined;
}
