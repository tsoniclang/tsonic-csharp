import type {
  CsharpTargetMember,
  CsharpTargetParameter,
  TargetTypeRef,
} from "../../../types/index.js";
import {
  csharpJsArrayTargetType,
  csharpJsRegExpMatchArrayTargetType,
  csharpJsRegExpStringIteratorTargetType,
  csharpJsRegExpTargetType,
  csharpNullableTargetType,
  csharpNullableValueTargetType,
  csharpObjectTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpWellKnownSymbolSourceMemberKey,
  getCsharpDelegateSignature,
  targetTypeRefEquals,
} from "../../../types/index.js";
import type {
  CsharpSourceProfileCallPolicy,
  CsharpSourceProfileElementPolicy,
  CsharpSourceProfilePropertyPolicy,
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
  jsUnsupportedCallPolicy,
  receiverHelperMethod,
  staticMethod,
  targetIndexer,
  targetParameter,
  targetProperty,
} from "./common.js";
import { jsRegExpSourceProfileIdentity } from "@tsonic/js-source-profile";
import {
  csharpJsReplacementCallbackParameter,
} from "./replacement-callback.js";

const stringType = csharpStringTargetType();
const intType = csharpSourcePrimitiveTargetType("int32");
const doubleType = csharpSourcePrimitiveTargetType("float64");
const boolType = csharpSourcePrimitiveTargetType("bool");
const stringHelperType = jsRuntimeTargetType("String");
const regexpProtocolDispatchType = jsRuntimeTargetType("RegExpProtocolDispatch");
const globalsType = jsRuntimeTargetType("Globals");

const stringReceiver = { kind: "target-parameter", targetParameterIndex: 0 } as const;
const noReceiver = { kind: "none" } as const;
const regexpStringMembers = jsRegExpSourceProfileIdentity.stringMembers;
const stringOwner = jsRegExpSourceProfileIdentity.owners.string;

const stringHelperRows = [
  {
    sourceName: "includes",
    targetName: "includes",
    parameters: [
      targetParameter("search", stringType),
      targetParameter("position", intType, { optional: true }),
    ],
    returnType: boolType,
  },
  {
    sourceName: "startsWith",
    targetName: "startsWith",
    parameters: [
      targetParameter("search", stringType),
      targetParameter("position", intType, { optional: true }),
    ],
    returnType: boolType,
  },
  {
    sourceName: "endsWith",
    targetName: "endsWith",
    parameters: [
      targetParameter("search", stringType),
      targetParameter("endPosition", intType, { optional: true }),
    ],
    returnType: boolType,
  },
  {
    sourceName: "indexOf",
    targetName: "indexOf",
    parameters: [
      targetParameter("search", stringType),
      targetParameter("position", intType, { optional: true }),
    ],
    returnType: intType,
  },
  {
    sourceName: "lastIndexOf",
    targetName: "lastIndexOf",
    parameters: [
      targetParameter("search", stringType),
      targetParameter("position", intType, { optional: true }),
    ],
    returnType: intType,
  },
  {
    sourceName: "charAt",
    targetName: "charAt",
    parameters: [targetParameter("index", intType)],
    returnType: stringType,
  },
  {
    sourceName: "charCodeAt",
    targetName: "charCodeAt",
    parameters: [targetParameter("index", intType)],
    returnType: doubleType,
  },
  {
    sourceName: "codePointAt",
    targetName: "codePointAt",
    parameters: [targetParameter("index", intType)],
    returnType: csharpNullableValueTargetType(intType),
  },
  {
    sourceName: "at",
    targetName: "at",
    parameters: [targetParameter("index", intType)],
    returnType: csharpNullableTargetType(stringType),
  },
  {
    sourceName: "slice",
    targetName: "slice",
    parameters: [
      targetParameter("start", intType, { optional: true }),
      targetParameter("end", intType, { optional: true }),
    ],
    returnType: stringType,
  },
  {
    sourceName: "substring",
    targetName: "substring",
    parameters: [
      targetParameter("start", intType),
      targetParameter("end", intType, { optional: true }),
    ],
    returnType: stringType,
  },
  {
    sourceName: "substr",
    targetName: "substr",
    parameters: [
      targetParameter("start", intType),
      targetParameter("length", intType, { optional: true }),
    ],
    returnType: stringType,
  },
  {
    sourceName: "concat",
    targetName: "concat",
    parameters: [
      targetParameter("strings", stringType, { paramsArray: true }),
    ],
    returnType: stringType,
  },
  {
    sourceName: "repeat",
    targetName: "repeat",
    parameters: [targetParameter("count", intType)],
    returnType: stringType,
  },
  {
    sourceName: "padStart",
    targetName: "padStart",
    parameters: [
      targetParameter("maxLength", intType),
      targetParameter("fillString", stringType, { optional: true }),
    ],
    returnType: stringType,
  },
  {
    sourceName: "padEnd",
    targetName: "padEnd",
    parameters: [
      targetParameter("maxLength", intType),
      targetParameter("fillString", stringType, { optional: true }),
    ],
    returnType: stringType,
  },
  {
    sourceName: "normalize",
    targetName: "normalize",
    parameters: [targetParameter("form", stringType, { optional: true })],
    returnType: stringType,
  },
] as const;

const parameterlessStringHelperRows = [
  { sourceName: "trim", targetName: "trim" },
  { sourceName: "trimStart", targetName: "trimStart" },
  { sourceName: "trimEnd", targetName: "trimEnd" },
  { sourceName: "trimLeft", targetName: "trimLeft" },
  { sourceName: "trimRight", targetName: "trimRight" },
  { sourceName: "toLowerCase", targetName: "toLowerCase" },
  { sourceName: "toUpperCase", targetName: "toUpperCase" },
  {
    sourceName: "toLocaleLowerCase",
    targetName: "toLocaleLowerCase",
    targetParameterBySourceParameter: [undefined],
  },
  {
    sourceName: "toLocaleUpperCase",
    targetName: "toLocaleUpperCase",
    targetParameterBySourceParameter: [undefined],
  },
  { sourceName: "toWellFormed", targetName: "toWellFormed" },
  { sourceName: "valueOf", targetName: "valueOf" },
] as const;

export const csharpJsStringCallPolicies: readonly CsharpSourceProfileCallPolicy[] =
  Object.freeze([
    jsCallPolicy(
      jsMemberIdentity("String", "toString"),
      () =>
        instanceMethod(
          "System.String.ToString",
          "toString",
          "ToString",
          stringType,
          [],
          stringType,
        ),
      { kind: "instance" },
    ),
    ...stringHelperRows.map((row) =>
      jsCallPolicy(
        jsMemberIdentity("String", row.sourceName),
        () => receiverStringHelper(row),
        stringReceiver,
      )
    ),
    ...parameterlessStringHelperRows.map((row) =>
      jsCallPolicy(
        jsMemberIdentity("String", row.sourceName),
        () =>
          receiverHelperMethod(
            `Tsonic.CSharp.Js.String.${row.targetName}`,
            row.sourceName,
            row.targetName,
            stringHelperType,
            stringType,
            [],
            stringType,
          ),
        stringReceiver,
        "targetParameterBySourceParameter" in row
          ? {
              targetParameterBySourceParameter:
                row.targetParameterBySourceParameter,
            }
          : {},
      )
    ),
    jsCallPolicy(
      jsMemberIdentity("String", "isWellFormed"),
      () =>
        receiverHelperMethod(
          "Tsonic.CSharp.Js.String.isWellFormed",
          "isWellFormed",
          "isWellFormed",
          stringHelperType,
          stringType,
          [],
          boolType,
        ),
      stringReceiver,
    ),
    jsCallPolicy(
      jsMemberIdentity("String", "localeCompare"),
      () =>
        receiverHelperMethod(
          "Tsonic.CSharp.Js.String.localeCompare",
          "localeCompare",
          "localeCompare",
          stringHelperType,
          stringType,
          [targetParameter("that", stringType)],
          intType,
        ),
      stringReceiver,
      { targetParameterBySourceParameter: [1, undefined, undefined] },
    ),
    ...["fromCharCode", "fromCodePoint"].map((sourceName) =>
      jsCallPolicy(
        jsMemberIdentity("StringConstructor", sourceName),
        () =>
          staticMethod(
            `Tsonic.CSharp.Js.String.${sourceName}`,
            sourceName,
            sourceName,
            stringHelperType,
            [targetParameter("codes", intType, { paramsArray: true })],
            stringType,
          ),
        noReceiver,
      )
    ),
    jsCallPolicy(
      jsCallIdentity("StringConstructor"),
      () =>
        staticMethod(
          "Tsonic.CSharp.Js.Globals.String",
          "constructor",
          "String",
          globalsType,
          [
            targetParameter("value", csharpObjectTargetType(), {
              optional: true,
              csharpAcceptsClosedSourceArgument: true,
            }),
          ],
          stringType,
        ),
      noReceiver,
    ),
    jsUnsupportedCallPolicy(
      jsConstructIdentity("StringConstructor"),
      "new String(...) requires an explicit wrapper-object carrier; the JS source profile only supports primitive String(...) conversion.",
    ),
    jsUnsupportedCallPolicy(
      jsMemberIdentity("StringConstructor", "raw"),
      "String.raw requires a closed template-raw carrier and is not represented by the current JS source-profile runtime.",
    ),
    jsCallPolicy(
      jsMemberIdentity(stringOwner, regexpStringMembers.match),
      (context) => stringRegExpPatternMember(context, "match"),
      stringReceiver,
    ),
    jsCallPolicy(
      jsMemberIdentity(stringOwner, regexpStringMembers.matchAll),
      (context) => stringRegExpPatternMember(context, "matchAll"),
      stringReceiver,
    ),
    jsCallPolicy(
      jsMemberIdentity(stringOwner, regexpStringMembers.replace),
      (context) => stringReplacementMember(context, "replace"),
      stringReceiver,
    ),
    jsCallPolicy(
      jsMemberIdentity(stringOwner, regexpStringMembers.replaceAll),
      (context) => stringReplacementMember(context, "replaceAll"),
      stringReceiver,
    ),
    jsCallPolicy(
      jsMemberIdentity(stringOwner, regexpStringMembers.search),
      (context) => stringRegExpPatternMember(context, "search"),
      stringReceiver,
    ),
    jsCallPolicy(
      jsMemberIdentity(stringOwner, regexpStringMembers.split),
      (context) => stringRegExpPatternMember(context, "split"),
      stringReceiver,
    ),
  ]);

export const csharpJsStringPropertyPolicies:
  readonly CsharpSourceProfilePropertyPolicy[] = Object.freeze([
    jsPropertyPolicy(
      jsMemberIdentity("String", "length"),
      () =>
        targetProperty(
          "System.String.Length",
          "length",
          "Length",
          stringType,
          intType,
          { readonly: true },
        ),
      { kind: "instance" },
    ),
  ]);

export const csharpJsStringElementPolicies:
  readonly CsharpSourceProfileElementPolicy[] = Object.freeze([
    jsElementPolicy(
      jsIndexerIdentity("String"),
      () =>
        targetIndexer(
          "tsonic.csharp.js.String.codeUnit",
          stringType,
          intType,
          stringType,
          true,
        ),
      {
        kind: "method",
        targetName: "Substring",
        appendInt32Literal: 1,
      },
    ),
  ]);

function receiverStringHelper(
  row: {
    readonly sourceName: string;
    readonly targetName: string;
    readonly parameters: readonly CsharpTargetParameter[];
    readonly returnType: CsharpTargetMember["returnType"];
  },
): CsharpTargetMember {
  return receiverHelperMethod(
    `Tsonic.CSharp.Js.String.${row.sourceName}`,
    row.sourceName,
    row.targetName,
    stringHelperType,
    stringType,
    row.parameters,
    row.returnType!,
  );
}

function stringRegExpPatternMember(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
  operation: "match" | "matchAll" | "search" | "split",
): CsharpTargetMember | undefined {
  const pattern = resolveStringOperationArgument(context, 0);
  const custom = resolveCustomRegExpProtocol(
    context,
    0,
    operation === "matchAll" ? "match-all" : operation,
  );
  if (
    pattern === undefined ||
    !targetTypeRefEquals(pattern, stringType) &&
      !targetTypeRefEquals(pattern, csharpJsRegExpTargetType()) &&
      custom === undefined
  ) {
    return undefined;
  }
  if (
    operation === "matchAll" &&
    !targetTypeRefEquals(pattern, csharpJsRegExpTargetType()) &&
    custom === undefined
  ) {
    return undefined;
  }
  const resultType = operation === "match"
    ? csharpNullableTargetType(csharpJsRegExpMatchArrayTargetType())
    : operation === "matchAll"
      ? csharpJsRegExpStringIteratorTargetType()
      : operation === "search"
        ? doubleType
        : csharpJsArrayTargetType(stringType);
  if (custom !== undefined) {
    return customProtocolTargetMember(
      operation,
      custom,
      resultType,
      operation === "split"
        ? custom.signature.parameters.slice(1).map((type, index) =>
            targetParameter(`argument${index}`, type, {
              ...(custom.signature.optionalParameterIndexes?.includes(index + 1) === true
                ? { optional: true }
                : {}),
            })
          )
        : [],
    );
  }
  const parameters = [targetParameter("pattern", pattern)];
  if (operation === "split") {
    parameters.push(targetParameter("limit", doubleType, { optional: true }));
  }
  return receiverHelperMethod(
    `Tsonic.CSharp.Js.String.${operation}:${targetTypeKey(pattern)}`,
    operation,
    operation,
    stringHelperType,
    stringType,
    parameters,
    resultType,
  );
}

function stringReplacementMember(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
  operation: "replace" | "replaceAll",
): CsharpTargetMember | undefined {
  const search = resolveStringOperationArgument(context, 0);
  const replacement = resolveStringOperationArgument(context, 1);
  const custom = resolveCustomRegExpProtocol(context, 0, "replace");
  if (
    search === undefined ||
    replacement === undefined ||
    !targetTypeRefEquals(search, stringType) &&
      !targetTypeRefEquals(search, csharpJsRegExpTargetType()) &&
      custom === undefined
  ) {
    return undefined;
  }
  if (custom !== undefined) {
    const selectedReplacement = custom.signature.parameters[1];
    if (
      custom.signature.parameters.length !== 2 ||
      selectedReplacement === undefined ||
      !targetTypeRefEquals(selectedReplacement, replacement)
    ) {
      return undefined;
    }
    return customProtocolTargetMember(
      operation,
      custom,
      stringType,
      [targetParameter("replacement", replacement)],
    );
  }
  const replacementParameter = targetTypeRefEquals(replacement, stringType)
    ? targetParameter("replacement", stringType)
    : csharpJsReplacementCallbackParameter(
        "replacement",
        replacement,
        stringType,
      );
  if (replacementParameter === undefined) {
    return undefined;
  }
  return receiverHelperMethod(
    `Tsonic.CSharp.Js.String.${operation}:${targetTypeKey(search)}:${
      targetTypeRefEquals(replacement, stringType) ? "string" : "callback"
    }`,
    operation,
    operation,
    stringHelperType,
    stringType,
    [
      targetParameter("search", search),
      replacementParameter,
    ],
    stringType,
  );
}

type CustomRegExpProtocolKind =
  | "match"
  | "match-all"
  | "replace"
  | "search"
  | "split";

function resolveCustomRegExpProtocol(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
  argumentIndex: number,
  kind: CustomRegExpProtocolKind,
): {
  readonly receiverType: TargetTypeRef;
  readonly memberTargetName: string;
  readonly signature: NonNullable<ReturnType<typeof getCsharpDelegateSignature>>;
} | undefined {
  const argument = context.source.sourceArguments[argumentIndex];
  const argumentBindings = context.source.sourceArgumentBindings.filter(
    (binding) => binding.sourceArgumentIndex === argumentIndex,
  );
  const argumentBinding = argumentBindings.length === 1
    ? argumentBindings[0]
    : undefined;
  const selectedParameter = argumentBinding === undefined
    ? undefined
    : context.source.sourceSelectedSignatureParameters.find((parameter) =>
        parameter.parameterIndex === argumentBinding.sourceParameterIndex
      );
  const authoredTypeNode = selectedParameter?.authoredTypeNode;
  const authoredMembers = authoredTypeNode === undefined ||
      !context.host.ast.is.IsTypeLiteralNode(authoredTypeNode)
    ? []
    : context.host.ast.members(authoredTypeNode).filter(
        (member): member is NonNullable<typeof member> => member !== undefined,
      );
  if (
    argument === undefined ||
    argumentBinding?.sourceForm !== "value" ||
    selectedParameter === undefined ||
    authoredMembers.length !== 1
  ) {
    return undefined;
  }
  const sourceKey = csharpWellKnownSymbolSourceMemberKey(kind);
  const selectedMember = context.host.objectShapes?.resolveTypeMember(
    selectedParameter.selectedType,
    context.sourceFile,
    sourceKey,
  );
  const receiverType = context.host.types.resolveSelectedValue(
    argument.expression,
    argument.type,
    context.sourceFile,
  );
  const actualMember = context.host.objectShapes?.resolveTypeMember(
    argument.type,
    context.sourceFile,
    sourceKey,
  );
  const selectedSignature = getCsharpDelegateSignature(selectedMember?.type);
  const actualSignature = getCsharpDelegateSignature(actualMember?.type);
  const expectedReturn = kind === "match"
    ? csharpNullableTargetType(csharpJsRegExpMatchArrayTargetType())
    : kind === "match-all"
      ? csharpJsRegExpStringIteratorTargetType()
      : kind === "search"
        ? doubleType
        : kind === "split"
          ? csharpJsArrayTargetType(stringType)
          : stringType;
  if (
    receiverType === undefined ||
    selectedMember?.memberKind !== "method" ||
    selectedMember.optional === true ||
    selectedMember.sourceDeclarations?.includes(authoredMembers[0]!) !== true ||
    actualMember?.memberKind !== "method" ||
    actualMember.optional === true ||
    selectedSignature === undefined ||
    actualSignature === undefined ||
    !csharpDelegateSignaturesEqual(selectedSignature, actualSignature) ||
    selectedSignature.parameters[0] === undefined ||
    !targetTypeRefEquals(selectedSignature.parameters[0], stringType) ||
    !targetTypeRefEquals(selectedSignature.returnType, expectedReturn) ||
    (kind === "replace" && selectedSignature.parameters.length !== 2) ||
    (kind === "split" && selectedSignature.parameters.length !== 2) ||
    (kind !== "replace" && kind !== "split" && selectedSignature.parameters.length !== 1)
  ) {
    return undefined;
  }
  return {
    receiverType,
    memberTargetName: actualMember.targetName,
    signature: actualSignature,
  };
}

function csharpDelegateSignaturesEqual(
  left: NonNullable<ReturnType<typeof getCsharpDelegateSignature>>,
  right: NonNullable<ReturnType<typeof getCsharpDelegateSignature>>,
): boolean {
  const leftOptional = left.optionalParameterIndexes ?? [];
  const rightOptional = right.optionalParameterIndexes ?? [];
  return left.parameters.length === right.parameters.length &&
    left.parameters.every((parameter, index) =>
      targetTypeRefEquals(parameter, right.parameters[index]!)
    ) &&
    targetTypeRefEquals(left.returnType, right.returnType) &&
    left.restParameterIndex === right.restParameterIndex &&
    leftOptional.length === rightOptional.length &&
    leftOptional.every((index, position) => index === rightOptional[position]);
}

function customProtocolTargetMember(
  operation: "match" | "matchAll" | "replace" | "replaceAll" | "search" | "split",
  protocol: NonNullable<ReturnType<typeof resolveCustomRegExpProtocol>>,
  resultType: TargetTypeRef,
  forwardedParameters: readonly CsharpTargetParameter[],
): CsharpTargetMember {
  return receiverHelperMethod(
    `Tsonic.CSharp.Js.RegExpProtocolDispatch.${operation}:${targetTypeKey(protocol.receiverType)}`,
    operation,
    "Invoke",
    regexpProtocolDispatchType,
    stringType,
    [
      targetParameter("protocol", protocol.receiverType),
      ...forwardedParameters,
    ],
    resultType,
    {
      csharpInvocation: {
        kind: "ecmascript-protocol-dispatch",
        protocolTargetParameterIndex: 1,
        protocolMemberName: protocol.memberTargetName,
      },
    },
  );
}

function resolveStringOperationArgument(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
  index: number,
): TargetTypeRef | undefined {
  const argument = context.source.sourceArguments[index];
  return argument === undefined
    ? undefined
    : context.host.types.resolveSelectedValue(
        argument.expression,
        argument.type,
        context.sourceFile,
      );
}

function targetTypeKey(type: TargetTypeRef): string {
  return type.kind === "target-named" ? type.id : type.kind;
}
