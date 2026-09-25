import type {
  CsharpTargetMember,
  CsharpTargetNamedTypeRef,
  TargetTypeRef,
} from "../../../types/index.js";
import {
  csharpDelegateTargetType,
  csharpEnumerableTargetType,
  csharpReadOnlyListTargetType,
  getCsharpJsArrayElementTargetType,
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
import { csharpJsNumericArgument } from "./numeric-argument.js";
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
const intType = csharpSourcePrimitiveTargetType("int32");
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

const dataViewReadTypes: ReadonlyMap<string, TargetTypeRef> = new Map([
  ["getInt8", csharpSourcePrimitiveTargetType("int8")],
  ["getUint8", csharpSourcePrimitiveTargetType("uint8")],
  ["getInt16", csharpSourcePrimitiveTargetType("int16")],
  ["getUint16", csharpSourcePrimitiveTargetType("uint16")],
  ["getInt32", csharpSourcePrimitiveTargetType("int32")],
  ["getUint32", csharpSourcePrimitiveTargetType("uint32")],
  ["getFloat32", csharpSourcePrimitiveTargetType("float32")],
  ["getFloat64", csharpSourcePrimitiveTargetType("float64")],
]);

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
    ...[...dataViewReadTypes.keys()].map((name) =>
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
    ...["at", "fill", "includes", "indexOf", "join", "reverse", "set", "slice", "sort", "subarray"].map((name) =>
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
        intType,
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
          intType,
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
        const index = resolveCsharpSelectedSourceValue(context, context.source.argument);
        return receiver === undefined || element === undefined || index === undefined
          ? undefined
          : targetIndexer(
              `Tsonic.CSharp.Js.TypedArray.indexer:${receiver.id}`,
              receiver,
              index,
              element,
              false,
            );
      },
      (context) => context.source.accessMode === "read"
        ? { kind: "method", targetName: "Get" }
        : { kind: "indexer" },
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
      ? target.id.slice(target.id.lastIndexOf("../../../members/source-profiles/js") + 1)
      : "constructor",
    kind: "constructor",
    declaringType: target,
    parameters: Object.freeze(parameters),
    returnType: target,
  });
}

function dataViewMember(
  context: CsharpSourceProfileCallPolicyContext,
  name: string,
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
  const valueParameter = write && !name.startsWith("setFloat")
    ? csharpJsNumericArgument(context, 1)
    : targetParameter("value", doubleType);
  if (write && valueParameter === undefined) return undefined;
  const offsetParameter = csharpJsNumericArgument(context);
  if (offsetParameter === undefined) return undefined;
  return instanceMethod(
    `Tsonic.CSharp.Js.DataView.${name}`,
    name,
    name,
    receiver,
    [
      { ...offsetParameter, name: "byteOffset" },
      ...(write && valueParameter !== undefined ? [valueParameter] : []),
      ...(endian ? [targetParameter("littleEndian", boolType, { optional: true })] : []),
    ],
    write ? voidType : dataViewReadTypes.get(name)!,
  );
}

function typedArrayConstructor(
  context: CsharpSourceProfileCallPolicyContext,
  name: CsharpJsTypedArrayName,
): CsharpTargetMember | undefined {
  const target = csharpJsTypedArrayTargetType(name);
  const argument = resolveCsharpSelectedSourceValue(context, context.source.sourceArguments[0]);
  const element = numericArrayElement(argument);
  if (element !== undefined) {
    return Object.freeze({
      id: `Tsonic.CSharp.Js.${name}.From:array`,
      sourceName: "constructor",
      targetName: "From",
      kind: "constructor",
      declaringType: target,
      parameters: [targetParameter("source", csharpReadOnlyListTargetType(element))],
      returnType: target,
      csharpInvocation: { kind: "static-factory-construction", factoryType: target },
    } satisfies CsharpTargetMember);
  }
  if (argument?.kind === "target-named" && csharpJsTypedArrayElementTargetType(argument) !== undefined) {
    return Object.freeze({
      id: `Tsonic.CSharp.Js.${name}.From:${argument.id}`,
      sourceName: "constructor",
      targetName: "From",
      kind: "constructor",
      declaringType: target,
      parameters: [targetParameter("source", argument)],
      returnType: target,
      csharpInvocation: { kind: "static-factory-construction", factoryType: target },
    } satisfies CsharpTargetMember);
  }
  const parameters = context.source.sourceSelectedSignatureParameters.length === 3
    ? [
        targetParameter("buffer", arrayBufferType),
        targetParameter("byteOffset", doubleType, { optional: true }),
        targetParameter("length", csharpNullableValueTargetType(doubleType), { optional: true }),
      ]
    : (() => {
        return argument?.kind === "source-primitive" && argument.name !== "bool" && argument.name !== "char"
          ? [targetParameter("length", argument.name === "int32" ? intType : doubleType)]
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
  const source = name === "set"
    ? resolveCsharpSelectedSourceValue(context, context.source.sourceArguments[0])
    : undefined;
  const parameters = source?.kind === "target-named" && csharpJsTypedArrayElementTargetType(source) !== undefined
    ? [targetParameter("source", source), targetParameter("offset", doubleType, { optional: true })]
    : name === "set" && numericArrayElement(source) !== undefined
      ? [targetParameter("source", csharpReadOnlyListTargetType(numericArrayElement(source)!)),
        targetParameter("offset", doubleType, { optional: true })]
    : name === "fill"
      ? (() => {
        const value = csharpJsNumericArgument(context);
        return value === undefined ? undefined : [value, targetParameter("start", doubleType, { optional: true }),
          targetParameter("end", csharpNullableValueTargetType(doubleType), { optional: true })];
      })()
      : name === "includes" || name === "indexOf"
        ? (() => {
          const value = csharpJsNumericArgument(context);
          const from = context.source.sourceArguments.length > 1 ? csharpJsNumericArgument(context, 1) : undefined;
          return value === undefined || context.source.sourceArguments.length > 1 && from === undefined
            ? undefined : [value, from ?? targetParameter("fromIndex", intType, { optional: true })];
        })()
        : typedArrayMethodParameters(name, csharpJsTypedArrayElementTargetType(receiver)!);
  const result = name === "at"
    ? csharpNullableValueTargetType(csharpJsTypedArrayElementTargetType(receiver)!)
    : name === "includes"
    ? boolType
    : name === "indexOf"
      ? intType
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
  elementType: TargetTypeRef,
): readonly ReturnType<typeof targetParameter>[] | undefined {
  switch (name) {
    case "at":
      return [targetParameter("index", doubleType)];
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
          csharpDelegateTargetType("System.Func", [elementType, elementType], doubleType),
          { optional: true },
        ),
      ];
    default:
      return undefined;
  }
}

function numericArrayElement(type: TargetTypeRef | undefined): TargetTypeRef | undefined {
  const element = type?.kind === "array" ? type.element : getCsharpJsArrayElementTargetType(type);
  return element?.kind === "source-primitive" && element.name !== "bool" && element.name !== "char"
    ? element : undefined;
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
    name === "buffer" ? arrayBufferType : intType,
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
        intType,
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
