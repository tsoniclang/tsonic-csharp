import type { Node } from "@tsonic/tsts";
import type { CsharpCallArtifactRequirement, CsharpObjectShapeProjectionKind, CsharpTargetInvocation, CsharpTargetMember, TargetTypeRef } from "../../../types/index.js";
import { csharpObjectTargetType, csharpQualifiedTypeRenderShape, csharpSourcePrimitiveTargetType, csharpStringTargetType, csharpTsValueTargetType, csharpTargetNamedType, csharpTaskTargetType, getCsharpTaskResultTargetType, getCsharpDelegateSignature, isCsharpRecordDictionaryTargetType, targetTypeRefEquals, targetTypeRefKey } from "../../../../target-model/types/index.js";
import { csharpJsArrayTargetType } from "../../../../target-model/types/carriers/js.js";
import type { CsharpSourceProfileCallPolicy } from "../../../model/source-profiles.js";
import { csharpSourceProfileDiagnostic, resolveCsharpSelectedSourceValue } from "../source-profile-policy.js";
import { closedObjectParameter, jsCallIdentity, jsCallPolicy, jsConstructIdentity, jsMemberIdentity, jsRuntimeTargetType, jsUnsupportedCallPolicy, receiverHelperMethod, staticMethod, targetParameter } from "./common.js";

const stringType = csharpStringTargetType();
const boolType = csharpSourcePrimitiveTargetType("bool");
const objectType = csharpObjectTargetType();
const objectRuntimeType = jsRuntimeTargetType("Object");
const jsonRuntimeType = jsRuntimeTargetType("JSON");
const jsonValueType = csharpTsValueTargetType();
const jsonReplacerType = csharpTargetNamedType("Tsonic.CSharp.Js.JsonReplacer", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "JsonReplacer"), { allowsRefLikeTypeArguments: [],
    delegateSignature: {
      parameters: [stringType, jsonValueType],
      parameterPassingModes: ["by-value", "by-value"],
      returnType: jsonValueType,
    },
  });
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
  "fromEntries",
  "getOwnPropertyDescriptor",
  "getOwnPropertyDescriptors",
  "getOwnPropertyNames",
  "getOwnPropertySymbols",
  "isExtensible",
  "isSealed",
  "preventExtensions",
  "seal",
] as const;

export const csharpJsObjectCallPolicies:
  readonly CsharpSourceProfileCallPolicy[] = Object.freeze([
    jsCallPolicy(
      jsMemberIdentity("ObjectConstructor", "freeze"),
      context => {
        const argument = resolveCsharpSelectedSourceValue(context, context.source.sourceArguments[0]);
        if (argument === undefined) return undefined;
        return staticMethod("js.ObjectConstructor.freeze", "freeze", "freeze", objectType,
          [targetParameter("value", argument)], argument, { csharpInvocation: { kind: "value-identity" } });
      }, noReceiver),
    jsCallPolicy(jsMemberIdentity("ObjectConstructor", "isFrozen"), () => ({
      kind: "rejected",
      diagnostic: csharpSourceProfileDiagnostic("TSONIC_IS_FROZEN_UNSUPPORTED", 9101002,
        "Object.isFrozen has no native equivalent; immutability is a compile-time property. Use readonly declarations instead."),
    }), noReceiver),
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
      jsMemberIdentity("PromiseConstructor", "all"),
      (context) => promiseAllMember(context),
      noReceiver,
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
  const resultType = context.inputs.types.get(context.source.sourceResultType);
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
  const sourceType = resolveCsharpSelectedSourceValue(
    context,
    context.source.sourceArguments[1],
  );
  if (
    targetType !== undefined &&
    sourceType !== undefined &&
    context.source.sourceArguments.length === 2 &&
    isCsharpRecordDictionaryTargetType(targetType) &&
    targetTypeRefEquals(targetType, sourceType)
  ) {
    return staticMethod(
      `Tsonic.CSharp.Js.Object.assign:${targetTypeIdentity(targetType)}`,
      "assign",
      "assign",
      objectRuntimeType,
      [
        targetParameter("target", targetType),
        targetParameter("source", sourceType),
      ],
      targetType,
    );
  }
  // A fresh object-literal target (`Object.assign({ count }, { label })`) is constructed at the call's merged result
  // shape, so the assignment writes every source property into a declared member of the returned object.
  const targetExpression = context.source.sourceArguments[0]?.expression;
  const merged = targetExpression !== undefined && context.host.ast.is.IsObjectLiteralExpression(targetExpression)
    ? context.inputs.resultType : undefined;
  const assignedType = merged !== undefined && merged.kind === "target-named" && "csharpGeneratedStructuralStorage" in merged &&
    merged.csharpGeneratedStructuralStorage === true ? merged : targetType;
  const targetShape = targetType === undefined
    ? undefined
    : context.inputs.objectShape.get(targetExpression);
  const sourceShape = sourceType === undefined
    ? undefined
    : context.inputs.objectShape.get(context.source.sourceArguments[1]?.expression);
  return targetType === undefined || assignedType === undefined ||
      context.source.sourceArguments.length !== 2 ||
      sourceType === undefined ||
      targetShape === undefined ||
      sourceShape === undefined
    ? undefined
    : staticMethod(
        `Tsonic.CSharp.Js.Object.assign:${targetTypeIdentity(assignedType)}`,
        "assign",
        "assign",
        objectRuntimeType,
        [
          targetParameter("target", assignedType, {
            csharpAcceptsCheckedSourceArgument: true,
          }),
          targetParameter("source", sourceType),
        ],
        assignedType,
        objectShapeProjectionOptions(
          context,
          context.source.sourceArguments[0],
          assignedType,
          "assign",
          0,
          { kind: "argument", index: 0 },
          { kind: "argument", index: 1 },
        ),
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
        receiverPassing: "target-parameter",
      });
}

function jsonStringifyMember(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
): CsharpTargetMember | undefined {
  const valueType = resolveCsharpSelectedSourceValue(
    context,
    context.source.sourceArguments[0],
  );
  const selectedReplacerType = resolveCsharpSelectedSourceValue(
    context,
    context.source.sourceArguments[1],
  );
  const replacerType = selectedReplacerType !== undefined &&
      getCsharpDelegateSignature(selectedReplacerType) !== undefined
    ? jsonReplacerType
    : selectedReplacerType ?? objectType;
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
          targetParameter("replacer", replacerType, {
            optional: true,
            ...(replacerType === jsonReplacerType
              ? { csharpAcceptsCheckedSourceArgument: true as const }
              : {}),
          }),
          targetParameter("space", jsonValueType, {
            optional: true,
            csharpAcceptsCheckedSourceArgument: true,
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
  assignmentSource?: {
    readonly kind: "argument";
    readonly index: number;
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
  const shape = context.inputs.objectShape.get(sourceValue.expression);
  const requirement: CsharpCallArtifactRequirement | undefined = shape === undefined
    ? undefined
    : projection === "assign"
      ? assignmentSource === undefined
        ? undefined
        : {
            kind: "object-shape-projection",
            source,
            projection: "assign",
            assignmentSource,
            rootKind: "object-shape",
          }
      : {
          kind: "object-shape-projection",
          source,
          projection,
          rootKind: "object-shape",
        };
  return requirement === undefined
    ? {}
    : {
        csharpArtifactRequirements: [requirement],
        csharpInvocation: {
          kind: "object-shape-projection",
          targetParameterIndex,
          projection,
        },
      };
}

function promiseAllMember(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
): CsharpTargetMember | undefined {
  const taskType = context.inputs.types.get(context.source.sourceResultType);
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
  const factoryType = csharpTargetNamedType("Tsonic.CSharp.Js.PromiseRuntime`1", [elementType], csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "PromiseRuntime"), { allowsRefLikeTypeArguments: [false],});
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

function targetTypeIdentity(type: TargetTypeRef): string {
  return targetTypeRefKey(type);
}
