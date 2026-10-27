import { arrayOfMember, arrayFromMember, arrayOfTypeArguments, arrayFromTypeArguments, resolvedMethodTypeArguments } from "./array-statics.js";
import { arrayConstructionMember, arrayCallMember, arrayConstructorElementTypeArguments, arrayConstructionTypeArguments } from "./array-construction.js";
import type { CsharpTargetMember, CsharpTargetParameter, TargetTypeRef } from "../../../types/index.js";
import { csharpDelegateTargetType, csharpEnumerableTargetType, csharpNullableTargetType, csharpNullableValueTargetType, csharpObjectTargetType, csharpSourcePrimitiveTargetType, csharpStringTargetType, csharpVoidTargetType, getCsharpDelegateSignature, getCsharpIndexableLengthMemberName, getCsharpJsArrayElementTargetType, getCsharpNullableElementTargetType, getCsharpReadOnlyIndexableCollectionElementTargetType, isCsharpDenseMutableCollectionTargetType, isCsharpValueTypeTargetType, isCsharpJsValueTargetType } from "../../../../target-model/types/index.js";
import { csharpJsArrayTargetType, getCsharpJsArrayMutationPolicy } from "../../../../target-model/types/carriers/js.js";
import type { CsharpSourceProfileCallPolicy, CsharpSourceProfileElementPolicy, CsharpSourceProfilePropertyPolicy } from "../../../model/source-profiles.js";
import { csharpSourceProfileDiagnostic, resolveCsharpSelectedSourceValue } from "../source-profile-policy.js";

import { getCsharpRuntimeUnionArms } from "../../../../target-model/types/carriers/runtime-carriers.js";
import { csharpOptionalStorageProjection, getCsharpGenericOptionalParts } from "../../../../target-model/types/projections.js";
import { type JsSourceProfileTargetMemberFactory, instanceMethod, jsCallIdentity, jsCallPolicy, jsConstructIdentity, jsElementPolicy, jsMemberIdentity, jsPropertyPolicy, jsRuntimeTargetType, receiverHelperMethod, staticMethod, targetIndexer, targetParameter, targetProperty } from "./common.js";

const intType = csharpSourcePrimitiveTargetType("int32");
const doubleType = csharpSourcePrimitiveTargetType("float64");
const boolType = csharpSourcePrimitiveTargetType("bool");
const stringType = csharpStringTargetType();
const voidType = csharpVoidTargetType();
const arrayHelperType = jsRuntimeTargetType("Array");
const instanceReceiver = { kind: "instance" } as const;
const noReceiver = { kind: "none" } as const;
const firstParameterReceiver = {
  kind: "target-parameter",
  targetParameterIndex: 0,
} as const;

const directArrayRows = [
  {
    sourceName: "push",
    parameters: (element: TargetTypeRef) => [
      targetParameter("items", { kind: "array", element }, { paramsArray: true }),
    ],
    result: () => intType,
  },
  {
    sourceName: "unshift",
    parameters: (element: TargetTypeRef) => [
      targetParameter("items", { kind: "array", element }, { paramsArray: true }),
    ],
    result: () => intType,
  },
  {
    sourceName: "splice",
    parameters: (element: TargetTypeRef) => [
      targetParameter("start", intType),
      targetParameter("deleteCount", intType, { optional: true }),
      targetParameter("items", { kind: "array", element }, { paramsArray: true }),
    ],
    result: (_element: TargetTypeRef, receiver: TargetTypeRef) => receiver,
  },
  {
    sourceName: "concat",
    parameters: () => [
      targetParameter("items", { kind: "array", element: csharpObjectTargetType() }, {
        paramsArray: true,
        csharpAcceptsClosedSourceArgument: true,
      }),
    ],
    result: (_element: TargetTypeRef, receiver: TargetTypeRef) => receiver,
  },
  {
    sourceName: "reverse",
    parameters: () => [],
    result: (_element: TargetTypeRef, receiver: TargetTypeRef) => receiver,
  },
  {
    sourceName: "fill",
    parameters: (element: TargetTypeRef) => [
      targetParameter("value", element),
      targetParameter("start", intType, { optional: true }),
      targetParameter("end", intType, { optional: true }),
    ],
    result: (_element: TargetTypeRef, receiver: TargetTypeRef) => receiver,
  },
  {
    sourceName: "copyWithin",
    parameters: () => [
      targetParameter("target", intType),
      targetParameter("start", intType),
      targetParameter("end", intType, { optional: true }),
    ],
    result: (_element: TargetTypeRef, receiver: TargetTypeRef) => receiver,
  },
] as const;

const readOnlyArrayQueryRows = [
  {
    sourceName: "join",
    requiresNumericUnionEquality: false,
    parameters: () => [
      targetParameter("separator", stringType, { optional: true }),
    ],
    result: stringType,
  },
  {
    sourceName: "indexOf",
    requiresNumericUnionEquality: true,
    parameters: (element: TargetTypeRef) => [
      targetParameter("searchElement", element),
      targetParameter("fromIndex", intType, { optional: true }),
    ],
    result: intType,
  },
  {
    sourceName: "lastIndexOf",
    requiresNumericUnionEquality: true,
    parameters: (element: TargetTypeRef) => [
      targetParameter("searchElement", element),
      targetParameter("fromIndex", intType, { optional: true }),
    ],
    result: intType,
  },
  {
    sourceName: "includes",
    requiresNumericUnionEquality: true,
    parameters: (element: TargetTypeRef) => [
      targetParameter("searchElement", element),
      targetParameter("fromIndex", intType, { optional: true }),
    ],
    result: boolType,
  },
] as const;

const predicateArrayRows = [
  { sourceName: "some", returnKind: "bool" },
  { sourceName: "every", returnKind: "bool" },
  { sourceName: "filter", returnKind: "receiver" },
  { sourceName: "findIndex", returnKind: "int" },
  { sourceName: "findLastIndex", returnKind: "int" },
] as const;

const nullableArrayRows = [
  { sourceName: "pop", targetName: "pop", parameterKind: "none" },
  { sourceName: "shift", targetName: "shift", parameterKind: "none" },
  { sourceName: "at", targetName: "at", parameterKind: "index" },
  { sourceName: "find", targetName: "find", parameterKind: "predicate" },
  { sourceName: "findLast", targetName: "findLast", parameterKind: "predicate" },
] as const;

export const csharpJsArrayCallPolicies:
  readonly CsharpSourceProfileCallPolicy[] = Object.freeze([
    ...["Array", "ReadonlyArray"].flatMap((declaringName) => [
      jsCallPolicy(
        jsMemberIdentity(declaringName, "entries"),
        (context) => {
          const shape = readOnlyArrayCallShape(context);
          return shape === undefined ? undefined : receiverHelperMethod(
            "Tsonic.CSharp.Js.Array.entries",
            "entries",
            "entries",
            arrayHelperType,
            shape.receiver,
            [],
            csharpEnumerableTargetType({ kind: "tuple", elements: [intType, shape.element] }),
          );
        },
        firstParameterReceiver,
      ),
      jsCallPolicy(
        jsMemberIdentity(declaringName, "slice"),
        (context) => readOnlyArraySliceMember(context),
        firstParameterReceiver,
      ),
      ...directArrayRows.map((row) =>
        jsCallPolicy(
          jsMemberIdentity(declaringName, row.sourceName),
          (context) => directArrayMember(context, row),
          instanceReceiver,
        )
      ),
      ...readOnlyArrayQueryRows.map((row) =>
        jsCallPolicy(
          jsMemberIdentity(declaringName, row.sourceName),
          (context) => readOnlyArrayQueryMember(context, row),
          firstParameterReceiver,
        )
      ),
      ...predicateArrayRows.map((row) =>
        jsCallPolicy(
          jsMemberIdentity(declaringName, row.sourceName),
          (context) => predicateArrayMember(context, row),
          instanceReceiver,
        )
      ),
      jsCallPolicy(
        jsMemberIdentity(declaringName, "map"),
        (context) => mapArrayMember(context),
        instanceReceiver,
        { targetMethodTypeArguments: context => {
          const element = getCsharpJsArrayElementTargetType(mapArrayMember(context)?.returnType);
          return element === undefined ? undefined : [element];
        } },
      ),
      jsCallPolicy(
        jsMemberIdentity(declaringName, "forEach"),
        (context) => forEachArrayMember(context),
        instanceReceiver,
      ),
      jsCallPolicy(
        jsMemberIdentity(declaringName, "reduce"),
        (context) => reduceArrayMember(context),
        instanceReceiver,
      ),
      jsCallPolicy(
        jsMemberIdentity(declaringName, "sort"),
        (context) => sortArrayMember(context),
        instanceReceiver,
      ),
      ...nullableArrayRows.map((row) =>
        jsCallPolicy(
          jsMemberIdentity(declaringName, row.sourceName),
          (context) => nullableArrayMember(context, row),
          firstParameterReceiver,
          { targetMethodTypeArguments: (_context, member) => {
            const result = member?.returnType;
            const parts = getCsharpGenericOptionalParts(result);
            return parts === undefined || result === undefined ? [] : [parts.element, result, parts.operations];
          } },
        )
      ),
    ]),
    jsCallPolicy(
      jsMemberIdentity("ArrayConstructor", "of"),
      (context) => arrayOfMember(context),
      noReceiver,
      { targetMethodTypeArguments: arrayOfTypeArguments },
    ),
    jsCallPolicy(
      jsMemberIdentity("ArrayConstructor", "from"),
      (context) => arrayFromMember(context),
      noReceiver,
      { targetMethodTypeArguments: arrayFromTypeArguments },
    ),
    jsCallPolicy(
      jsConstructIdentity("ArrayConstructor"),
      (context) => arrayConstructionMember(context),
      noReceiver,
      { targetMethodTypeArguments: arrayConstructionTypeArguments },
    ),
    jsCallPolicy(
      jsCallIdentity("ArrayConstructor"),
      (context) => arrayCallMember(context),
      noReceiver,
      { targetMethodTypeArguments: arrayConstructorElementTypeArguments },
    ),
  ]);

export const csharpJsArrayPropertyPolicies:
  readonly CsharpSourceProfilePropertyPolicy[] = Object.freeze([
    jsPropertyPolicy(
      { owner: "js", kind: "member", declaringNames: ["Array", "ReadonlyArray"], name: "length" },
      (context) => {
        const receiverType = context.receiverType;
        if (receiverType !== undefined && isCsharpJsValueTargetType(receiverType)) return targetProperty(
          "Tsonic.CSharp.Runtime.TsValue.ArrayLength", "length", "ArrayLength", receiverType, intType,
          { readonly: true },
        );
        const targetName = getCsharpIndexableLengthMemberName(receiverType);
        return receiverType === undefined || targetName === undefined
          ? undefined
          : targetProperty(
              "Tsonic.CSharp.Js.JSArray.length",
              "length",
              targetName,
              receiverType,
              intType,
              {
                readonly: context.readonly ||
                  getCsharpJsArrayMutationPolicy(receiverType) === undefined,
              },
            );
      },
      instanceReceiver,
    ),
  ]);

export const csharpJsArrayElementPolicies:
  readonly CsharpSourceProfileElementPolicy[] = Object.freeze([
    jsElementPolicy(
      { owner: "js", kind: "indexer", declaringNames: ["Array", "ReadonlyArray"] },
      (context) => {
        const receiverType = resolveCsharpSelectedSourceValue(
          context,
          context.source.receiver,
        );
        const resultType =
          getCsharpReadOnlyIndexableCollectionElementTargetType(receiverType);
        const readonly = context.readonly ||
          !(
            receiverType?.kind === "array" ||
            isCsharpDenseMutableCollectionTargetType(receiverType)
          );
        return receiverType === undefined || resultType === undefined
          ? undefined
          : targetIndexer(
              "Tsonic.CSharp.Js.JSArray.indexer",
              receiverType,
              getCsharpJsArrayElementTargetType(receiverType) === undefined ? intType : doubleType,
              resultType,
              readonly,
            );
      },
      (context) => ({
        kind: "indexer",
        ...(!context.readonly && getCsharpJsArrayElementTargetType(
          resolveCsharpSelectedSourceValue(context, context.source.receiver),
        ) !== undefined ? { indexedLocationMethod: "elementLocation" } : {}),
      }),
    ),
  ]);

function directArrayMember(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
  row: typeof directArrayRows[number],
): CsharpTargetMember | undefined {
  const shape = arrayCallShape(context);
  return shape === undefined
    ? undefined
    : instanceMethod(
        `Tsonic.CSharp.Js.JSArray.${row.sourceName}`,
        row.sourceName,
        row.sourceName,
        shape.receiver,
        row.parameters(shape.element),
        row.result(shape.element, shape.receiver),
      );
}

function readOnlyArrayQueryMember(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
  row: typeof readOnlyArrayQueryRows[number],
): ReturnType<JsSourceProfileTargetMemberFactory> {
  const shape = readOnlyArrayCallShape(context);
  const arms = shape === undefined ? undefined : getCsharpRuntimeUnionArms(
    getCsharpNullableElementTargetType(shape.element) ?? shape.element, context.host.typeDefinitions);
  if (row.requiresNumericUnionEquality &&
    arms !== undefined && arms.every(arm => arm.kind === "source-primitive" && arm.name !== "bool")) {
    return { kind: "rejected", diagnostic: csharpSourceProfileDiagnostic("CSHARP_JS_SOURCE_PROFILE_CALL_NOT_CLOSED", 9101001,
      `Array.${row.sourceName} over a numeric union requires an exact native cross-arm key equality relation.`) };
  }
  return shape === undefined
    ? undefined
    : receiverHelperMethod(
        `Tsonic.CSharp.Js.Array.${row.sourceName}`,
        row.sourceName,
        row.sourceName,
        arrayHelperType,
        shape.receiver,
        row.parameters(shape.element),
        row.result,
      );
}

function readOnlyArraySliceMember(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
): CsharpTargetMember | undefined {
  const shape = readOnlyArrayCallShape(context);
  return shape === undefined
    ? undefined
    : receiverHelperMethod(
        "Tsonic.CSharp.Js.Array.slice",
        "slice",
        "slice",
        arrayHelperType,
        shape.receiver,
        [
          targetParameter("start", intType, { optional: true }),
          targetParameter("end", intType, { optional: true }),
        ],
        csharpJsArrayTargetType(shape.element),
      );
}

function predicateArrayMember(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
  row: typeof predicateArrayRows[number],
): CsharpTargetMember | undefined {
  const shape = arrayCallShape(context);
  if (shape === undefined) {
    return undefined;
  }
  const callback = csharpDelegateTargetType(
    "System.Func",
    [shape.element, intType, shape.receiver],
    boolType,
  );
  const returnType = row.returnKind === "bool"
    ? boolType
    : row.returnKind === "int"
      ? intType
      : shape.receiver;
  return instanceMethod(
    `Tsonic.CSharp.Js.JSArray.${row.sourceName}`,
    row.sourceName,
    row.sourceName,
    shape.receiver,
    [targetParameter("callbackfn", callback)],
    returnType,
  );
}

function mapArrayMember(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
): CsharpTargetMember | undefined {
  const shape = arrayCallShape(context);
  const mapper = resolveCsharpSelectedSourceValue(context, context.source.sourceArguments[0]);
  const selected = context.source.sourceSelectedMethodTypeArguments?.[0];
  const resultElement = selected?.explicitTypeNode === undefined
    ? getCsharpDelegateSignature(mapper)?.returnType ?? resolvedMethodTypeArguments(context)[0]
    : context.inputs.selectedType.get(selected.explicitTypeNode, selected.selectedType);
  const resultType = resultElement === undefined ? undefined : csharpJsArrayTargetType(resultElement);
  if (shape === undefined || resultType === undefined || resultElement === undefined) {
    return undefined;
  }
  const callback = csharpDelegateTargetType(
    "System.Func",
    [shape.element, intType, shape.receiver],
    resultElement,
  );
  return { ...instanceMethod(
    "Tsonic.CSharp.Js.JSArray.map",
    "map",
    "map",
    shape.receiver,
    [targetParameter("callbackfn", callback)],
    resultType,
  ), typeParameters: [{ identity: "Tsonic.CSharp.Js.JSArray.map::0", name: "U", csharpAllowsRefLike: false }] };
}

function forEachArrayMember(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
): CsharpTargetMember | undefined {
  const shape = arrayCallShape(context);
  return shape === undefined
    ? undefined
    : instanceMethod(
        "Tsonic.CSharp.Js.JSArray.forEach",
        "forEach",
        "forEach",
        shape.receiver,
        [
          targetParameter(
            "callbackfn",
            csharpDelegateTargetType(
              "System.Action",
              [shape.element, intType, shape.receiver],
            ),
          ),
        ],
        voidType,
      );
}

function reduceArrayMember(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
): CsharpTargetMember | undefined {
  const shape = arrayCallShape(context);
  const resultType = context.inputs.types.get(context.source.sourceResultType);
  if (shape === undefined || resultType === undefined) {
    return undefined;
  }
  const callback = csharpDelegateTargetType(
    "System.Func",
    [resultType, shape.element, intType, shape.receiver],
    resultType,
  );
  const parameters: CsharpTargetParameter[] = [
    targetParameter("callbackfn", callback),
  ];
  if (context.source.sourceSelectedSignatureParameters.length === 2) {
    parameters.push(targetParameter("initialValue", resultType));
  }
  return instanceMethod(
    "Tsonic.CSharp.Js.JSArray.reduce",
    "reduce",
    "reduce",
    shape.receiver,
    parameters,
    resultType,
  );
}

function sortArrayMember(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
): CsharpTargetMember | undefined {
  const shape = arrayCallShape(context);
  return shape === undefined
    ? undefined
    : instanceMethod(
        "Tsonic.CSharp.Js.JSArray.sort",
        "sort",
        "sort",
        shape.receiver,
        [
          targetParameter(
            "compareFn",
            csharpDelegateTargetType(
              "System.Func",
              [shape.element, shape.element],
              doubleType,
            ),
            { optional: true },
          ),
        ],
        shape.receiver,
      );
}

function nullableArrayMember(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
  row: typeof nullableArrayRows[number],
): CsharpTargetMember | undefined {
  const shape = arrayCallShape(context);
  if (shape === undefined || shape.element.kind === "type-parameter" && row.parameterKind !== "predicate") {
    return undefined;
  }
  if (shape.element.kind === "type-parameter") {
    const storage = csharpOptionalStorageProjection(shape.element);
    return Object.freeze({
      ...staticMethod(`Tsonic.CSharp.Js.Array.${row.targetName}:native-optional-storage`,
        row.sourceName, row.targetName, arrayHelperType,
        [targetParameter("array", shape.receiver), ...nullableArrayParameters(row.parameterKind, shape)], storage,
        { typeParameters: [{ name: "T", csharpAllowsRefLike: false },
          { name: "TStorage", csharpAllowsRefLike: false }, { name: "TOperations", csharpAllowsRefLike: false }] }),
      receiverPassing: "target-parameter",
    });
  }
  const targetName = isCsharpValueTypeTargetType(shape.element)
    ? `${row.targetName}Value`
    : `${row.targetName}Reference`;
  const parameters = nullableArrayParameters(row.parameterKind, shape);
  const returnType = isCsharpValueTypeTargetType(shape.element)
    ? csharpNullableValueTargetType(shape.element)
    : csharpNullableTargetType(shape.element);
  return Object.freeze({
    ...staticMethod(
      `Tsonic.CSharp.Js.Array.${targetName}`,
      row.sourceName,
      targetName,
      arrayHelperType,
      [targetParameter("array", shape.receiver), ...parameters],
      returnType,
    ),
    receiverPassing: "target-parameter",
  });
}

function nullableArrayParameters(
  parameterKind: typeof nullableArrayRows[number]["parameterKind"],
  shape: NonNullable<ReturnType<typeof arrayCallShape>>,
): readonly CsharpTargetParameter[] {
  if (parameterKind === "index") {
    return [targetParameter("index", intType)];
  }
  if (parameterKind === "predicate") {
    return [
      targetParameter(
        "callbackfn",
        csharpDelegateTargetType(
          "System.Func",
          [shape.element, intType, shape.receiver],
          boolType,
        ),
      ),
    ];
  }
  return [];
}

function arrayCallShape(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
): {
  readonly receiver: TargetTypeRef;
  readonly element: TargetTypeRef;
} | undefined {
  const receiver = resolveCsharpSelectedSourceValue(
    context,
    context.source.sourceReceiver,
  );
  const element = getCsharpJsArrayElementTargetType(receiver);
  return receiver === undefined || element === undefined
    ? undefined
    : { receiver, element };
}

function readOnlyArrayCallShape(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
): {
  readonly receiver: TargetTypeRef;
  readonly element: TargetTypeRef;
} | undefined {
  const receiver = resolveCsharpSelectedSourceValue(
    context,
    context.source.sourceReceiver,
  );
  const element = getCsharpReadOnlyIndexableCollectionElementTargetType(
    receiver,
  );
  return receiver === undefined || element === undefined
    ? undefined
    : { receiver, element };
}
