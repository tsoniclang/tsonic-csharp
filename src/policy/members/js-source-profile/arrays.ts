import type {
  CsharpTargetMember,
  CsharpTargetParameter,
  TargetTypeRef,
} from "../../types/index.js";
import {
  csharpDelegateTargetType,
  csharpEnumerableTargetType,
  csharpJsArrayTargetType,
  csharpNullableTargetType,
  csharpNullableValueTargetType,
  csharpObjectTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpVoidTargetType,
  getCsharpCollectionElementTargetType,
  getCsharpDelegateSignature,
  getCsharpJsArrayElementTargetType,
  isCsharpValueTypeTargetType,
  targetTypeRefEquals,
} from "../../types/index.js";
import type {
  CsharpSourceProfileCallPolicy,
  CsharpSourceProfileElementPolicy,
  CsharpSourceProfilePropertyPolicy,
} from "../source-profile-policy.js";
import {
  resolveCsharpSelectedSourceValue,
} from "../source-profile-policy.js";
import {
  instanceMethod,
  jsCallIdentity,
  jsCallPolicy,
  jsConstructIdentity,
  jsElementPolicy,
  jsIndexerIdentity,
  jsMemberIdentity,
  jsPropertyPolicy,
  jsRuntimeTargetType,
  staticMethod,
  targetIndexer,
  targetParameter,
  targetProperty,
} from "./common.js";

const intType = csharpSourcePrimitiveTargetType("int32");
const doubleType = csharpSourcePrimitiveTargetType("float64");
const boolType = csharpSourcePrimitiveTargetType("bool");
const stringType = csharpStringTargetType();
const voidType = csharpVoidTargetType();
const arrayHelperType = jsRuntimeTargetType("Array");
const arrayStaticsType = jsRuntimeTargetType("JSArrayStatics");
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
      targetParameter("items", element, { paramsArray: true }),
    ],
    result: () => intType,
  },
  {
    sourceName: "unshift",
    parameters: (element: TargetTypeRef) => [
      targetParameter("items", element, { paramsArray: true }),
    ],
    result: () => intType,
  },
  {
    sourceName: "slice",
    parameters: () => [
      targetParameter("start", intType, { optional: true }),
      targetParameter("end", intType, { optional: true }),
    ],
    result: (_element: TargetTypeRef, receiver: TargetTypeRef) => receiver,
  },
  {
    sourceName: "splice",
    parameters: (element: TargetTypeRef) => [
      targetParameter("start", intType),
      targetParameter("deleteCount", intType, { optional: true }),
      targetParameter("items", element, { paramsArray: true }),
    ],
    result: (_element: TargetTypeRef, receiver: TargetTypeRef) => receiver,
  },
  {
    sourceName: "concat",
    parameters: () => [
      targetParameter("items", csharpObjectTargetType(), {
        paramsArray: true,
        csharpAcceptsClosedSourceArgument: true,
      }),
    ],
    result: (_element: TargetTypeRef, receiver: TargetTypeRef) => receiver,
  },
  {
    sourceName: "join",
    parameters: () => [
      targetParameter("separator", stringType, { optional: true }),
    ],
    result: () => stringType,
  },
  {
    sourceName: "indexOf",
    parameters: (element: TargetTypeRef) => [
      targetParameter("searchElement", element),
      targetParameter("fromIndex", intType, { optional: true }),
    ],
    result: () => intType,
  },
  {
    sourceName: "lastIndexOf",
    parameters: (element: TargetTypeRef) => [
      targetParameter("searchElement", element),
      targetParameter("fromIndex", intType, { optional: true }),
    ],
    result: () => intType,
  },
  {
    sourceName: "includes",
    parameters: (element: TargetTypeRef) => [
      targetParameter("searchElement", element),
      targetParameter("fromIndex", intType, { optional: true }),
    ],
    result: () => boolType,
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
      ...directArrayRows.map((row) =>
        jsCallPolicy(
          jsMemberIdentity(declaringName, row.sourceName),
          (context) => directArrayMember(context, row),
          instanceReceiver,
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
        )
      ),
    ]),
    jsCallPolicy(
      jsMemberIdentity("ArrayConstructor", "isArray"),
      () =>
        staticMethod(
          "Tsonic.CSharp.Js.JSArrayStatics.isArray",
          "isArray",
          "isArray",
          arrayStaticsType,
          [
            targetParameter("value", csharpObjectTargetType(), {
              csharpAcceptsClosedSourceArgument: true,
            }),
          ],
          boolType,
        ),
      noReceiver,
    ),
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
      { targetMethodTypeArguments: arrayResultElementTypeArguments },
    ),
  ]);

export const csharpJsArrayPropertyPolicies:
  readonly CsharpSourceProfilePropertyPolicy[] = Object.freeze(
    ["Array", "ReadonlyArray"].map((declaringName) =>
      jsPropertyPolicy(
        jsMemberIdentity(declaringName, "length"),
        (context) => {
          const receiverType = resolveCsharpSelectedSourceValue(
            context,
            context.source.receiver,
          );
          return receiverType === undefined
            ? undefined
            : targetProperty(
                `Tsonic.CSharp.Js.JSArray.length:${declaringName}`,
                "length",
                "length",
                receiverType,
                intType,
                { readonly: declaringName === "ReadonlyArray" },
              );
        },
        instanceReceiver,
      )
    ),
  );

export const csharpJsArrayElementPolicies:
  readonly CsharpSourceProfileElementPolicy[] = Object.freeze(
    ["Array", "ReadonlyArray"].map((declaringName) =>
      jsElementPolicy(
        jsIndexerIdentity(declaringName),
        (context) => {
          const receiverType = resolveCsharpSelectedSourceValue(
            context,
            context.source.receiver,
          );
          const resultType = getCsharpJsArrayElementTargetType(receiverType);
          return receiverType === undefined || resultType === undefined
            ? undefined
            : targetIndexer(
                `Tsonic.CSharp.Js.JSArray.indexer:${declaringName}`,
                receiverType,
                intType,
                resultType,
                declaringName === "ReadonlyArray",
              );
        },
      )
    ),
  );

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
  const resultType = context.host.types.resolveType(
    context.source.sourceResultType,
    context.sourceFile,
  );
  const resultElement = getCsharpJsArrayElementTargetType(resultType);
  if (shape === undefined || resultType === undefined || resultElement === undefined) {
    return undefined;
  }
  const callback = csharpDelegateTargetType(
    "System.Func",
    [shape.element, intType, shape.receiver],
    resultElement,
  );
  return instanceMethod(
    "Tsonic.CSharp.Js.JSArray.map",
    "map",
    "map",
    shape.receiver,
    [targetParameter("callbackfn", callback)],
    resultType,
  );
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
  const resultType = context.host.types.resolveType(
    context.source.sourceResultType,
    context.sourceFile,
  );
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
  if (shape === undefined || shape.element.kind === "type-parameter") {
    return undefined;
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
    receiverPassing: "first-argument",
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

function arrayOfMember(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
): CsharpTargetMember | undefined {
  const element = arrayOfElementType(context);
  return element === undefined
    ? undefined
    : staticMethod(
        "Tsonic.CSharp.Js.JSArrayStatics.of",
        "of",
        "of",
        arrayStaticsType,
        [targetParameter("items", element, { paramsArray: true })],
        csharpJsArrayTargetType(element),
        { typeParameters: [{ name: "T" }] },
      );
}

function arrayFromMember(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
): CsharpTargetMember | undefined {
  const shape = arrayFromShape(context);
  if (shape === undefined) {
    return undefined;
  }
  const parameters: CsharpTargetParameter[] = [
    targetParameter(
      "arrayLike",
      sourceIsString(context)
        ? stringType
        : csharpEnumerableTargetType(shape.sourceElement),
    ),
  ];
  if (context.source.sourceSelectedSignatureParameters.length === 2) {
    parameters.push(targetParameter(
      "mapfn",
      csharpDelegateTargetType(
        "System.Func",
        [shape.sourceElement, intType],
        shape.resultElement,
      ),
    ));
  }
  return staticMethod(
    "Tsonic.CSharp.Js.JSArrayStatics.from",
    "from",
    "from",
    arrayStaticsType,
    parameters,
    shape.resultType,
    {
      typeParameters: arrayFromTypeParameterNames(context)
        .map((name) => ({ name })),
    },
  );
}

function arrayConstructionMember(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
): CsharpTargetMember | undefined {
  const resultType = context.host.types.resolveType(
    context.source.sourceResultType,
    context.sourceFile,
  );
  const element = getCsharpJsArrayElementTargetType(resultType);
  if (resultType === undefined || element === undefined) {
    return undefined;
  }
  const numericLength = context.source.sourceArguments.length === 1 &&
    context.host.semantics(context.sourceFile).isNumberLike(
      context.source.sourceArguments[0]?.type,
    );
  if (numericLength) {
    return Object.freeze({
      id: "Tsonic.CSharp.Js.JSArray..ctor(length)",
      sourceName: "constructor",
      targetName: "JSArray",
      kind: "constructor",
      declaringType: resultType,
      parameters: [targetParameter("length", intType)],
      returnType: resultType,
    });
  }
  return Object.freeze({
    id: "Tsonic.CSharp.Js.JSArrayStatics.of:construction",
    sourceName: "constructor",
    targetName: "of",
    kind: "constructor",
    declaringType: resultType,
    parameters: [targetParameter("items", element, { paramsArray: true })],
    returnType: resultType,
    csharpInvocation: {
      kind: "static-factory-construction",
      factoryType: arrayStaticsType,
    },
    typeParameters: [{ name: "T" }],
  } satisfies CsharpTargetMember);
}

function arrayCallMember(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
): CsharpTargetMember | undefined {
  const resultType = context.host.types.resolveType(
    context.source.sourceResultType,
    context.sourceFile,
  );
  const element = getCsharpJsArrayElementTargetType(resultType);
  if (resultType === undefined || element === undefined) {
    return undefined;
  }
  const numericLength = context.source.sourceArguments.length === 1 &&
    context.host.semantics(context.sourceFile).isNumberLike(
      context.source.sourceArguments[0]?.type,
    );
  return staticMethod(
    numericLength
      ? "Tsonic.CSharp.Js.JSArrayStatics.withLength"
      : "Tsonic.CSharp.Js.JSArrayStatics.of:call",
    "constructor",
    numericLength ? "withLength" : "of",
    arrayStaticsType,
    numericLength
      ? [targetParameter("length", intType)]
      : [targetParameter("items", element, { paramsArray: true })],
    resultType,
    { typeParameters: [{ name: "T" }] },
  );
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

function arrayResultElementTypeArguments(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
): readonly TargetTypeRef[] | undefined {
  const result = context.host.types.resolveType(
    context.source.sourceResultType,
    context.sourceFile,
  );
  const element = getCsharpJsArrayElementTargetType(result);
  return element === undefined ? undefined : [element];
}

function arrayOfTypeArguments(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
): readonly TargetTypeRef[] | undefined {
  const element = arrayOfElementType(context);
  return element === undefined ? undefined : [element];
}

function arrayOfElementType(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
): TargetTypeRef | undefined {
  const selected = context.source.sourceSelectedMethodTypeArguments ?? [];
  const explicit = selected.length === 1 &&
      selected[0]?.explicitTypeNode !== undefined
    ? context.host.types.resolveSelectedType(
        selected[0].explicitTypeNode,
        selected[0].selectedType,
        context.sourceFile,
      )
    : undefined;
  if (explicit !== undefined) {
    return explicit;
  }
  const argumentTypes = context.source.sourceArguments.map((argument) =>
    resolveCsharpSelectedSourceValue(context, argument)
  );
  if (
    argumentTypes.length > 0 &&
    argumentTypes[0] !== undefined &&
    argumentTypes.every((argument) =>
      argument !== undefined && targetTypeRefEquals(argument, argumentTypes[0]!)
    )
  ) {
    return argumentTypes[0];
  }
  return resolvedMethodTypeArguments(context)[0];
}

function arrayFromShape(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
): {
  readonly sourceElement: TargetTypeRef;
  readonly resultElement: TargetTypeRef;
  readonly resultType: TargetTypeRef;
} | undefined {
  const sourceArgument = resolveCsharpSelectedSourceValue(
    context,
    context.source.sourceArguments[0],
  );
  const sourceElement = sourceIsString(context)
    ? stringType
    : getCsharpCollectionElementTargetType(sourceArgument);
  if (sourceElement === undefined) {
    return undefined;
  }
  const mapper = resolveCsharpSelectedSourceValue(
    context,
    context.source.sourceArguments[1],
  );
  const mappedResult = getCsharpDelegateSignature(mapper)?.returnType;
  const selectedArguments = resolvedMethodTypeArguments(context);
  const resultElement = context.source.sourceArguments.length === 1
    ? sourceElement
    : mappedResult ?? selectedArguments[selectedArguments.length - 1];
  return resultElement === undefined
    ? undefined
    : {
        sourceElement,
        resultElement,
        resultType: csharpJsArrayTargetType(resultElement),
      };
}

function arrayFromTypeArguments(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
): readonly TargetTypeRef[] | undefined {
  const shape = arrayFromShape(context);
  return shape === undefined
    ? undefined
    : sourceIsString(context)
      ? context.source.sourceSelectedSignatureParameters.length === 1
        ? []
        : [shape.resultElement]
      : context.source.sourceSelectedSignatureParameters.length === 1
        ? [shape.sourceElement]
        : [shape.sourceElement, shape.resultElement];
}

function arrayFromTypeParameterNames(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
): readonly string[] {
  return sourceIsString(context)
    ? context.source.sourceSelectedSignatureParameters.length === 1
      ? []
      : ["TResult"]
    : context.source.sourceSelectedSignatureParameters.length === 1
      ? ["TSource"]
      : ["TSource", "TResult"];
}

function arrayConstructionTypeArguments(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
): readonly TargetTypeRef[] | undefined {
  const numericLength = context.source.sourceArguments.length === 1 &&
    context.host.semantics(context.sourceFile).isNumberLike(
      context.source.sourceArguments[0]?.type,
    );
  return numericLength ? [] : arrayResultElementTypeArguments(context);
}

function sourceIsString(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
): boolean {
  const source = resolveCsharpSelectedSourceValue(
    context,
    context.source.sourceArguments[0],
  );
  return source?.kind === "target-named" && source.id === "System.String";
}

function resolvedMethodTypeArguments(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
): readonly TargetTypeRef[] {
  return (context.source.sourceSelectedMethodTypeArguments ?? []).flatMap(
    (argument) => {
      const resolved = context.host.types.resolveSelectedType(
        argument.explicitTypeNode,
        argument.selectedType,
        context.sourceFile,
      );
      return resolved === undefined ? [] : [resolved];
    },
  );
}
