import type {
  CsharpTargetMember,
  CsharpTargetParameter,
  TargetTypeRef,
} from "../../../types/index.js";
import {
  csharpJsArrayTargetType,
  csharpJsRegExpMatchArrayTargetType,
  csharpJsRegExpStringIteratorTargetType,
  csharpNullableTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpWellKnownSymbolSourceMemberKey,
  getCsharpDelegateSignature,
  targetTypeRefEquals,
} from "../../../types/index.js";
import type {
  CsharpSourceProfileCallPolicy,
} from "../source-profile-policy.js";
import {
  jsRuntimeTargetType,
  receiverHelperMethod,
  targetParameter,
} from "./common.js";

type CustomRegExpProtocolKind =
  | "match"
  | "match-all"
  | "replace"
  | "search"
  | "split";

const stringType = csharpStringTargetType();
const doubleType = csharpSourcePrimitiveTargetType("float64");
const regexpProtocolDispatchType = jsRuntimeTargetType("RegExpProtocolDispatch");

export function resolveCustomRegExpProtocol(
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

export function customProtocolTargetMember(
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

export function resolveStringOperationArgument(
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

export function targetTypeKey(type: TargetTypeRef): string {
  return type.kind === "target-named" ? type.id : type.kind;
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
