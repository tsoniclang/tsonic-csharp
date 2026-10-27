import type { TargetTypeRef } from "../../../../policy/types/index.js";

import { csharpWellKnownSymbolSourceMemberKey, getCsharpDelegateSignature } from "../../../../target-model/types/index.js";
import { substituteTargetTypeParameters } from "../../../../policy/types/resolution/substitution.js";
import type { CsharpSourceProfileCallPolicy } from "../../../../policy/model/source-profiles.js";

import type { CsharpProviderCallSelectionHost } from "../../../../policy/model/provider-calls.js";
import type { CustomRegExpProtocolKind } from "../../../../target-model/records/program/source-profile-inputs.js";
import { selectCsharpCustomRegExpProtocol } from "../../../../policy/operations/source-profiles/js/regexp-protocol.js";
export function analyzeCsharpCustomRegExpProtocol(
  context: Pick<Parameters<CsharpSourceProfileCallPolicy["select"]>[0], "source" | "sourceFile" | "inputs"> & { readonly host: CsharpProviderCallSelectionHost },
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
  const receiverType = context.inputs.values.get(argument.expression)?.get(argument.type);
  const actualMember = context.host.objectShapes?.resolveTypeMember(
    argument.type,
    context.sourceFile,
    sourceKey,
  );
  const selectedTypeArguments = context.source.sourceSelectedMethodTypeArguments ?? [];
  const targetTypeArguments = context.inputs.callTypeArguments;
  if (targetTypeArguments === undefined || targetTypeArguments.length !== selectedTypeArguments.length) {
    return undefined;
  }
  const substitutions = new Map<string, TargetTypeRef>();
  for (const [index, argument] of selectedTypeArguments.entries()) {
    const parameter = context.inputs.types.get(argument.typeParameter);
    if (parameter?.kind !== "type-parameter") return undefined;
    substitutions.set(parameter.identity, targetTypeArguments[index]!);
  }
  const selectedSignature = getCsharpDelegateSignature(selectedMember === undefined
    ? undefined
    : substituteTargetTypeParameters(selectedMember.type, substitutions));
  const actualSignature = getCsharpDelegateSignature(actualMember?.type);
  return selectCsharpCustomRegExpProtocol(kind, receiverType, selectedMember, actualMember, authoredMembers[0]!, selectedSignature, actualSignature);
}
