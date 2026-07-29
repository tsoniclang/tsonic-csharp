import type {
  CsharpTargetMember,
  TargetTypeRef,
} from "../../types/index.js";
import {
  csharpDelegateTargetType,
  csharpEnumerableTargetType,
  csharpNullableTargetType,
  csharpSourcePrimitiveTargetType,
  getCsharpJsMapTargetTypes,
  getCsharpJsSetElementTargetType,
  isCsharpValueTypeTargetType,
  targetTypeRefEquals,
  targetTypeRefKey,
} from "../../types/index.js";
import type {
  CsharpSourceProfileCallPolicy,
  CsharpSourceProfileCallPolicyContext,
  CsharpSourceProfileCallPolicyResult,
  CsharpSourceProfilePropertyPolicy,
} from "../source-profile-policy.js";
import {
  csharpSourceProfileCall,
  csharpSourceProfileDiagnostic,
} from "../source-profile-policy.js";
import {
  instanceMethod,
  jsCallPolicy,
  jsConstructIdentity,
  jsMemberIdentity,
  jsPropertyPolicy,
  jsRuntimeTargetType,
  staticMethod,
  targetParameter,
  targetProperty,
} from "./common.js";

const intType = csharpSourcePrimitiveTargetType("int32");
const mapHelperType = jsRuntimeTargetType("Map");
const instanceReceiver = { kind: "instance" } as const;
const firstParameterReceiver = {
  kind: "target-parameter",
  targetParameterIndex: 0,
} as const;

const mapSharedMethods = [
  "has",
  "keys",
  "values",
  "entries",
] as const;
const mapMutableMethods = ["set", "delete", "clear", "forEach"] as const;
const setSharedMethods = ["has", "keys", "values", "entries"] as const;
const setMutableMethods = ["add", "delete", "clear", "forEach"] as const;

export const csharpJsCollectionCallPolicies:
  readonly CsharpSourceProfileCallPolicy[] = Object.freeze([
    ...["Map", "ReadonlyMap"].flatMap((declaringName) => [
      jsCallPolicy(
        jsMemberIdentity(declaringName, "get"),
        mapGetMember,
        firstParameterReceiver,
        { targetMethodTypeArguments: mapTypeArguments },
      ),
      ...mapSharedMethods.map((sourceName) =>
        jsCallPolicy(
          jsMemberIdentity(declaringName, sourceName),
          (context) => mapDirectMember(context, sourceName),
          instanceReceiver,
        )
      ),
    ]),
    ...mapMutableMethods.map((sourceName) =>
      jsCallPolicy(
        jsMemberIdentity("Map", sourceName),
        (context) => mapDirectMember(context, sourceName),
        instanceReceiver,
      )
    ),
    mapConstructorPolicy(),
    ...["Set", "ReadonlySet"].flatMap((declaringName) =>
      setSharedMethods.map((sourceName) =>
        jsCallPolicy(
          jsMemberIdentity(declaringName, sourceName),
          (context) => setDirectMember(context, sourceName),
          instanceReceiver,
        )
      )
    ),
    ...setMutableMethods.map((sourceName) =>
      jsCallPolicy(
        jsMemberIdentity("Set", sourceName),
        (context) => setDirectMember(context, sourceName),
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
          const receiver = context.host.types.resolveType(
            context.source.receiver.type,
            context.sourceFile,
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
          const receiver = context.host.types.resolveType(
            context.source.receiver.type,
            context.sourceFile,
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

function mapDirectMember(
  context: CsharpSourceProfileCallPolicyContext,
  sourceName: typeof mapSharedMethods[number] | typeof mapMutableMethods[number],
): CsharpTargetMember | undefined {
  const shape = mapCallShape(context);
  const result = resolveCallResult(context);
  if (shape === undefined || result === undefined) {
    return undefined;
  }
  const parameters = sourceName === "set"
    ? [
        targetParameter("key", shape.key),
        targetParameter("value", shape.value),
      ]
    : sourceName === "has" || sourceName === "delete"
      ? [targetParameter("key", shape.key)]
      : sourceName === "forEach"
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
    `Tsonic.CSharp.Js.Map.${sourceName}`,
    sourceName,
    sourceName,
    shape.receiver,
    parameters,
    result,
  );
}

function mapGetMember(
  context: CsharpSourceProfileCallPolicyContext,
): CsharpTargetMember | undefined {
  const shape = mapCallShape(context);
  const result = resolveCallResult(context);
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
  sourceName: typeof setSharedMethods[number] | typeof setMutableMethods[number],
): CsharpTargetMember | undefined {
  const shape = setCallShape(context);
  const result = resolveCallResult(context);
  if (shape === undefined || result === undefined) {
    return undefined;
  }
  const parameters = sourceName === "add" ||
      sourceName === "has" ||
      sourceName === "delete"
    ? [targetParameter("value", shape.element)]
    : sourceName === "forEach"
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
    `Tsonic.CSharp.Js.Set.${sourceName}`,
    sourceName,
    sourceName,
    shape.receiver,
    parameters,
    result,
  );
}

function mapConstructorPolicy(): CsharpSourceProfileCallPolicy {
  return {
    source: jsConstructIdentity("MapConstructor"),
    select(context): CsharpSourceProfileCallPolicyResult {
      const result = context.host.types.resolveType(
        context.source.sourceResultType,
        context.sourceFile,
      );
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
      const result = context.host.types.resolveType(
        context.source.sourceResultType,
        context.sourceFile,
      );
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
  const receiver = context.host.types.resolveType(
    context.source.sourceReceiver?.type,
    context.sourceFile,
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
  const receiver = context.host.types.resolveType(
    context.source.sourceReceiver?.type,
    context.sourceFile,
  );
  const element = getCsharpJsSetElementTargetType(receiver);
  return receiver === undefined || element === undefined
    ? undefined
    : { receiver, element };
}

function resolveCallResult(
  context: CsharpSourceProfileCallPolicyContext,
): TargetTypeRef | undefined {
  return context.host.types.resolveType(
    context.source.sourceResultType,
    context.sourceFile,
  );
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
