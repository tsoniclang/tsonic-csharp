import type {
  CsharpTargetMember,
  TargetTypeRef,
} from "../../../types/index.js";
import {
  csharpDelegateTargetType,
  csharpEnumerableTargetType,
  csharpJsMapTargetType,
  csharpJsSetTargetType,
  csharpNullableTargetType,
  csharpSourcePrimitiveTargetType,
  csharpVoidTargetType,
  getCsharpJsMapTargetTypes,
  getCsharpJsSetElementTargetType,
  isCsharpRecordDictionaryTargetType,
  isCsharpValueTypeTargetType,
  targetTypeRefEquals,
  targetTypeRefKey,
} from "../../../types/index.js";
import type {
  CsharpSourceProfileCallPolicy,
  CsharpSourceProfileCallPolicyContext,
  CsharpSourceProfileCallPolicyResult,
  CsharpSourceProfileElementPolicy,
  CsharpSourceProfilePropertyPolicy,
} from "../source-profile-policy.js";
import {
  csharpSourceProfileCall,
  csharpSourceProfileDiagnostic,
  resolveCsharpSelectedSourceValue,
} from "../source-profile-policy.js";
import {
  instanceMethod,
  jsCallPolicy,
  jsConstructIdentity,
  jsElementPolicy,
  jsIndexerIdentity,
  jsMemberIdentity,
  jsPropertyPolicy,
  jsRuntimeTargetType,
  staticMethod,
  targetParameter,
  targetProperty,
  targetIndexer,
} from "./common.js";

const intType = csharpSourcePrimitiveTargetType("int32");
const mapHelperType = jsRuntimeTargetType("Map");
const instanceReceiver = { kind: "instance" } as const;
const firstParameterReceiver = {
  kind: "target-parameter",
  targetParameterIndex: 0,
} as const;

const mapSharedMethodRows = [
  { sourceName: "has", targetName: "has", parameterKind: "key", resultKind: "bool" },
  { sourceName: "keys", targetName: "keys", parameterKind: "none", resultKind: "keys" },
  { sourceName: "values", targetName: "values", parameterKind: "none", resultKind: "values" },
  { sourceName: "entries", targetName: "entries", parameterKind: "none", resultKind: "entries" },
] as const;
const mapMutableMethodRows = [
  { sourceName: "set", targetName: "set", parameterKind: "key-value", resultKind: "receiver" },
  { sourceName: "delete", targetName: "delete", parameterKind: "key", resultKind: "bool" },
  { sourceName: "clear", targetName: "clear", parameterKind: "none", resultKind: "void" },
  { sourceName: "forEach", targetName: "forEach", parameterKind: "callback", resultKind: "void" },
] as const;
const setSharedMethodRows = [
  { sourceName: "has", targetName: "has", parameterKind: "value", resultKind: "bool" },
  { sourceName: "keys", targetName: "keys", parameterKind: "none", resultKind: "values" },
  { sourceName: "values", targetName: "values", parameterKind: "none", resultKind: "values" },
  { sourceName: "entries", targetName: "entries", parameterKind: "none", resultKind: "entries" },
] as const;
const setMutableMethodRows = [
  { sourceName: "add", targetName: "add", parameterKind: "value", resultKind: "receiver" },
  { sourceName: "delete", targetName: "delete", parameterKind: "value", resultKind: "bool" },
  { sourceName: "clear", targetName: "clear", parameterKind: "none", resultKind: "void" },
  { sourceName: "forEach", targetName: "forEach", parameterKind: "callback", resultKind: "void" },
] as const;

export const csharpJsCollectionCallPolicies:
  readonly CsharpSourceProfileCallPolicy[] = Object.freeze([
    ...["Map", "ReadonlyMap"].flatMap((declaringName) => [
      jsCallPolicy(
        jsMemberIdentity(declaringName, "get"),
        mapGetMember,
        firstParameterReceiver,
        { targetMethodTypeArguments: mapTypeArguments },
      ),
      ...mapSharedMethodRows.map((row) =>
        jsCallPolicy(
          jsMemberIdentity(declaringName, row.sourceName),
          (context) => mapDirectMember(context, row),
          instanceReceiver,
        )
      ),
    ]),
    ...mapMutableMethodRows.map((row) =>
      jsCallPolicy(
        jsMemberIdentity("Map", row.sourceName),
        (context) => mapDirectMember(context, row),
        instanceReceiver,
      )
    ),
    mapConstructorPolicy(),
    ...["Set", "ReadonlySet"].flatMap((declaringName) =>
      setSharedMethodRows.map((row) =>
        jsCallPolicy(
          jsMemberIdentity(declaringName, row.sourceName),
          (context) => setDirectMember(context, row),
          instanceReceiver,
        )
      )
    ),
    ...setMutableMethodRows.map((row) =>
      jsCallPolicy(
        jsMemberIdentity("Set", row.sourceName),
        (context) => setDirectMember(context, row),
        instanceReceiver,
      )
    ),
    setConstructorPolicy(),
  ]);

export const csharpJsCollectionPropertyPolicies:
  readonly CsharpSourceProfilePropertyPolicy[] = Object.freeze([
    ...["Map", "ReadonlyMap"].map((declaringName) =>
      jsPropertyPolicy(
        jsMemberIdentity(declaringName, "size"),
        (context) => {
          const receiver = resolveCsharpSelectedSourceValue(
            context,
            context.source.receiver,
          );
          return getCsharpJsMapTargetTypes(receiver) === undefined
            ? undefined
            : targetProperty(
                `Tsonic.CSharp.Js.Map.size:${declaringName}`,
                "size",
                "size",
                receiver!,
                intType,
                { readonly: true },
              );
        },
        instanceReceiver,
      )
    ),
    ...["Set", "ReadonlySet"].map((declaringName) =>
      jsPropertyPolicy(
        jsMemberIdentity(declaringName, "size"),
        (context) => {
          const receiver = resolveCsharpSelectedSourceValue(
            context,
            context.source.receiver,
          );
          return getCsharpJsSetElementTargetType(receiver) === undefined
            ? undefined
            : targetProperty(
                `Tsonic.CSharp.Js.Set.size:${declaringName}`,
                "size",
                "size",
                receiver!,
                intType,
                { readonly: true },
              );
        },
        instanceReceiver,
      )
    ),
  ]);

export const csharpJsCollectionElementPolicies:
  readonly CsharpSourceProfileElementPolicy[] = Object.freeze([
    jsElementPolicy(
      jsIndexerIdentity("Record"),
      (context) => {
        const receiver = resolveCsharpSelectedSourceValue(
          context,
          context.source.receiver,
        );
        const index = resolveCsharpSelectedSourceValue(
          context,
          context.source.argument,
        );
        const keyType = receiver?.kind === "target-named"
          ? receiver.typeArguments?.[0]
          : undefined;
        const valueType = receiver?.kind === "target-named"
          ? receiver.typeArguments?.[1]
          : undefined;
        if (
          !isCsharpRecordDictionaryTargetType(receiver) ||
          keyType === undefined ||
          valueType === undefined ||
          index === undefined ||
          !targetTypeRefEquals(index, keyType)
        ) {
          return undefined;
        }
        return targetIndexer(
          `Tsonic.CSharp.Js.Record.indexer:${targetTypeRefKey(receiver)}`,
          receiver,
          keyType,
          valueType,
          false,
        );
      },
    ),
  ]);

function mapDirectMember(
  context: CsharpSourceProfileCallPolicyContext,
  row: typeof mapSharedMethodRows[number] | typeof mapMutableMethodRows[number],
): CsharpTargetMember | undefined {
  const shape = mapCallShape(context);
  const result = shape === undefined
    ? undefined
    : mapMethodResult(shape, row.resultKind);
  if (shape === undefined || result === undefined) {
    return undefined;
  }
  const parameters = row.parameterKind === "key-value"
    ? [
        targetParameter("key", shape.key),
        targetParameter("value", shape.value),
      ]
    : row.parameterKind === "key"
      ? [targetParameter("key", shape.key)]
      : row.parameterKind === "callback"
        ? [
            targetParameter(
              "callbackfn",
              csharpDelegateTargetType(
                "System.Action",
                [shape.value, shape.key, shape.receiver],
              ),
            ),
          ]
        : [];
  return instanceMethod(
    `Tsonic.CSharp.Js.Map.${row.targetName}`,
    row.sourceName,
    row.targetName,
    shape.receiver,
    parameters,
    result,
  );
}

function mapGetMember(
  context: CsharpSourceProfileCallPolicyContext,
): CsharpTargetMember | undefined {
  const shape = mapCallShape(context);
  const result = shape === undefined
    ? undefined
    : csharpNullableTargetType(shape.value);
  if (
    shape === undefined ||
    result === undefined ||
    shape.value.kind === "type-parameter" ||
    !targetTypeRefEquals(result, csharpNullableTargetType(shape.value))
  ) {
    return undefined;
  }
  const valueType = isCsharpValueTypeTargetType(shape.value);
  return staticMethod(
    valueType
      ? "Tsonic.CSharp.Js.Map.getValue"
      : "Tsonic.CSharp.Js.Map.getReference",
    "get",
    valueType ? "getValue" : "getReference",
    mapHelperType,
    [
      targetParameter("map", shape.receiver),
      targetParameter("key", shape.key),
    ],
    result,
    {
      typeParameters: [
        { name: "TKey" },
        {
          name: "TValue",
          constraints: [{ kind: valueType ? "value-type" : "reference-type" }],
        },
      ],
    },
  );
}

function setDirectMember(
  context: CsharpSourceProfileCallPolicyContext,
  row: typeof setSharedMethodRows[number] | typeof setMutableMethodRows[number],
): CsharpTargetMember | undefined {
  const shape = setCallShape(context);
  const result = shape === undefined
    ? undefined
    : setMethodResult(shape, row.resultKind);
  if (shape === undefined || result === undefined) {
    return undefined;
  }
  const parameters = row.parameterKind === "value"
    ? [targetParameter("value", shape.element)]
    : row.parameterKind === "callback"
      ? [
          targetParameter(
            "callbackfn",
            csharpDelegateTargetType(
              "System.Action",
              [shape.element, shape.element, shape.receiver],
            ),
          ),
        ]
      : [];
  return instanceMethod(
    `Tsonic.CSharp.Js.Set.${row.targetName}`,
    row.sourceName,
    row.targetName,
    shape.receiver,
    parameters,
    result,
  );
}

function mapConstructorPolicy(): CsharpSourceProfileCallPolicy {
  return {
    source: jsConstructIdentity("MapConstructor"),
    select(context): CsharpSourceProfileCallPolicyResult {
      const typeArguments = context.host.types.resolveSourceCallTypeArguments(
        context.source,
        context.sourceFile,
      );
      const result = typeArguments?.length === 2
        ? csharpJsMapTargetType(typeArguments[0]!, typeArguments[1]!)
        : undefined;
      const shape = getCsharpJsMapTargetTypes(result);
      if (result === undefined || shape === undefined) {
        return rejectedCollectionConstruction(
          "The selected Map constructor result has no exact closed C# Map carrier.",
        );
      }
      const entryType: TargetTypeRef = {
        kind: "tuple",
        elements: [shape.key, shape.value],
      };
      return selectedCollectionConstruction(
        context,
        Object.freeze({
          id: context.source.sourceArguments.length === 0
            ? "Tsonic.CSharp.Js.Map..ctor()"
            : "Tsonic.CSharp.Js.Map..ctor(IEnumerable)",
          sourceName: "constructor",
          targetName: "Map",
          kind: "constructor",
          declaringType: result,
          parameters: context.source.sourceArguments.length === 0
            ? []
            : [
                targetParameter(
                  "entries",
                  csharpEnumerableTargetType(entryType),
                ),
              ],
          returnType: result,
        }),
        context.source.sourceArguments.length === 0 ? [undefined] : [0],
      );
    },
  };
}

function setConstructorPolicy(): CsharpSourceProfileCallPolicy {
  return {
    source: jsConstructIdentity("SetConstructor"),
    select(context): CsharpSourceProfileCallPolicyResult {
      const typeArguments = context.host.types.resolveSourceCallTypeArguments(
        context.source,
        context.sourceFile,
      );
      const result = typeArguments?.length === 1
        ? csharpJsSetTargetType(typeArguments[0]!)
        : undefined;
      const element = getCsharpJsSetElementTargetType(result);
      if (result === undefined || element === undefined) {
        return rejectedCollectionConstruction(
          "The selected Set constructor result has no exact closed C# Set carrier.",
        );
      }
      return selectedCollectionConstruction(
        context,
        Object.freeze({
          id: context.source.sourceArguments.length === 0
            ? "Tsonic.CSharp.Js.Set..ctor()"
            : "Tsonic.CSharp.Js.Set..ctor(IEnumerable)",
          sourceName: "constructor",
          targetName: "Set",
          kind: "constructor",
          declaringType: result,
          parameters: context.source.sourceArguments.length === 0
            ? []
            : [
                targetParameter(
                  "values",
                  csharpEnumerableTargetType(element),
                ),
              ],
          returnType: result,
        }),
        context.source.sourceArguments.length === 0 ? [undefined] : [0],
      );
    },
  };
}

function selectedCollectionConstruction(
  context: CsharpSourceProfileCallPolicyContext,
  targetMember: CsharpTargetMember,
  sourceParameterMapping: readonly (number | undefined)[],
): CsharpSourceProfileCallPolicyResult {
  if (context.source.sourceArguments.length > 1) {
    return rejectedCollectionConstruction(
      "The selected JS collection constructor has more than one effective argument.",
    );
  }
  const call = csharpSourceProfileCall(
    context.source,
    targetMember,
    { kind: "none" },
    [],
    { targetParameterBySourceParameter: sourceParameterMapping },
  );
  return call === undefined
    ? rejectedCollectionConstruction(
        "The selected JS collection constructor arguments do not form an exact C# constructor relation.",
      )
    : { kind: "resolved", call };
}

function mapCallShape(
  context: CsharpSourceProfileCallPolicyContext,
): {
  readonly receiver: TargetTypeRef;
  readonly key: TargetTypeRef;
  readonly value: TargetTypeRef;
} | undefined {
  const receiver = resolveCsharpSelectedSourceValue(
    context,
    context.source.sourceReceiver,
  );
  const typeArguments = getCsharpJsMapTargetTypes(receiver);
  return receiver === undefined || typeArguments === undefined
    ? undefined
    : { receiver, ...typeArguments };
}

function setCallShape(
  context: CsharpSourceProfileCallPolicyContext,
): {
  readonly receiver: TargetTypeRef;
  readonly element: TargetTypeRef;
} | undefined {
  const receiver = resolveCsharpSelectedSourceValue(
    context,
    context.source.sourceReceiver,
  );
  const element = getCsharpJsSetElementTargetType(receiver);
  return receiver === undefined || element === undefined
    ? undefined
    : { receiver, element };
}

function mapMethodResult(
  shape: {
    readonly receiver: TargetTypeRef;
    readonly key: TargetTypeRef;
    readonly value: TargetTypeRef;
  },
  kind: typeof mapSharedMethodRows[number]["resultKind"] |
    typeof mapMutableMethodRows[number]["resultKind"],
): TargetTypeRef {
  switch (kind) {
    case "bool":
      return csharpSourcePrimitiveTargetType("bool");
    case "keys":
      return csharpEnumerableTargetType(shape.key);
    case "values":
      return csharpEnumerableTargetType(shape.value);
    case "entries":
      return csharpEnumerableTargetType({
        kind: "tuple",
        elements: [shape.key, shape.value],
      });
    case "receiver":
      return shape.receiver;
    case "void":
      return csharpVoidTargetType();
  }
}

function setMethodResult(
  shape: {
    readonly receiver: TargetTypeRef;
    readonly element: TargetTypeRef;
  },
  kind: typeof setSharedMethodRows[number]["resultKind"] |
    typeof setMutableMethodRows[number]["resultKind"],
): TargetTypeRef {
  switch (kind) {
    case "bool":
      return csharpSourcePrimitiveTargetType("bool");
    case "values":
      return csharpEnumerableTargetType(shape.element);
    case "entries":
      return csharpEnumerableTargetType({
        kind: "tuple",
        elements: [shape.element, shape.element],
      });
    case "receiver":
      return shape.receiver;
    case "void":
      return csharpVoidTargetType();
  }
}

function mapTypeArguments(
  context: CsharpSourceProfileCallPolicyContext,
): readonly TargetTypeRef[] | undefined {
  const shape = mapCallShape(context);
  return shape === undefined ? undefined : [shape.key, shape.value];
}

function rejectedCollectionConstruction(
  message: string,
): CsharpSourceProfileCallPolicyResult {
  return {
    kind: "rejected",
    diagnostic: csharpSourceProfileDiagnostic(
      "CSHARP_JS_COLLECTION_CONSTRUCTION_NOT_CLOSED",
      9101101,
      message,
      [
        "The selected declaration belongs to the explicit JS source profile.",
        "Collection construction requires one exact source-to-target carrier relation.",
      ],
    ),
  };
}

export function csharpJsCollectionPolicyKey(
  type: TargetTypeRef,
): string {
  return targetTypeRefKey(type);
}
