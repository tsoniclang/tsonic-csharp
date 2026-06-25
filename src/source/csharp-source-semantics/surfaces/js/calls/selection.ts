import {
  selectedTargetSignatureFactKey,
} from "@tsonic/tsts";
import type {
  CheckedCallMappingRequest,
  ExtensionFactSubject,
  ExtensionObservationContext,
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  getCsharpArrayLikeElementType,
} from "../arrays.js";
import type {
  CsharpJsSurfaceHost,
  SourceLibraryMember,
} from "../source-library.js";
import {
  asNodeSubject,
} from "../../../ast-utils.js";
import {
  getNonSemanticTargetType,
  getSourceLibraryCallReceiverTargetTypes,
  isNewExpression,
  isNumericSourcePrimitive,
} from "./helpers.js";

export function getPrevalidatedSourceLibraryCallMember(
  sourceMember: SourceLibraryMember,
  candidates: readonly TargetMember[],
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): TargetMember | undefined {
  const dateMember = getPrevalidatedDateCallMember(sourceMember, candidates, request, context, host);
  if (dateMember !== undefined) {
    return dateMember;
  }
  const jsonMember = getPrevalidatedJsonCallMember(sourceMember, candidates, request, context, host);
  if (jsonMember !== undefined) {
    return jsonMember;
  }
  return sourceMember.declaringName === "Object" &&
    sourceMember.memberName === "assign" &&
    candidates.length === 1
    ? candidates[0]
    : candidates.length === 1
      ? candidates[0]
      : undefined;
}

export function sourceLibraryCallSelectionOptions(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
): Parameters<CsharpJsSurfaceHost["selectTargetMember"]>[3] {
  if (sourceMember.declaringName !== "Array" && sourceMember.declaringName !== "ReadonlyArray") {
    return {};
  }
  const receiverType = getSourceLibraryCallReceiverTargetTypes(request, context, host)
    .find((candidate) => getCsharpArrayLikeElementType(candidate) !== undefined);
  return receiverType === undefined
    ? {}
    : {
        declaringTargetType: receiverType,
        declaringTypeParameters: [{ name: "T" }],
      };
}

function getPrevalidatedJsonCallMember(
  sourceMember: SourceLibraryMember,
  candidates: readonly TargetMember[],
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): TargetMember | undefined {
  if (sourceMember.declaringName !== "JSON") {
    return undefined;
  }
  return host.selectTargetMember(candidates, {
    arguments: request.arguments,
    receiver: request.calleeReceiver,
  }, context);
}

function getPrevalidatedDateCallMember(
  sourceMember: SourceLibraryMember,
  candidates: readonly TargetMember[],
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): TargetMember | undefined {
  if (sourceMember.declaringName !== "Date") {
    return undefined;
  }
  if (sourceMember.memberName !== "constructor") {
    return candidates.length === 1 ? candidates[0] : undefined;
  }
  if (!isNewExpression(request.call, context)) {
    return candidates.find((candidate) => candidate.id === "Tsonic.CSharp.Js.Date.call");
  }
  const argumentCount = request.arguments.length;
  if (argumentCount === 0) {
    return candidates.find((candidate) => candidate.id === "Tsonic.CSharp.Js.Date..ctor()");
  }
  if (argumentCount === 1) {
    const argument = request.arguments[0];
    if (dateSingleArgumentIsString(argument, context, host)) {
      return candidates.find((candidate) => candidate.id === "Tsonic.CSharp.Js.Date..ctor(System.String)");
    }
    if (dateSingleArgumentIsNumber(argument, context, host)) {
      return candidates.find((candidate) => candidate.id === "Tsonic.CSharp.Js.Date..ctor(System.Double)");
    }
    return candidates.find((candidate) => candidate.id === "Tsonic.CSharp.Js.Date..ctor(System.Object)");
  }
  return argumentCount <= 7
    ? candidates.find((candidate) => candidate.id === "Tsonic.CSharp.Js.Date..ctor(System.Int32,System.Int32,System.Int32,System.Int32,System.Int32,System.Int32,System.Int32)")
    : undefined;
}

function dateSingleArgumentIsString(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): boolean {
  if (subject === undefined) {
    return false;
  }
  const node = asNodeSubject(subject);
  const ast = context.compiler?.ast;
  if (node !== undefined && ast !== undefined && (ast.kindName(node) === "KindStringLiteral" || ast.kindName(node) === "KindNoSubstitutionTemplateLiteral")) {
    return true;
  }
  return targetTypeIsString(context.factResolver.resolve(subject, selectedTargetSignatureFactKey)?.member.returnType) ||
    targetTypeIsString(getNonSemanticTargetType(subject, context, host));
}

function dateSingleArgumentIsNumber(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): boolean {
  if (subject === undefined) {
    return false;
  }
  const node = asNodeSubject(subject);
  const ast = context.compiler?.ast;
  if (node !== undefined && ast !== undefined && ast.kindName(node) === "KindNumericLiteral") {
    return true;
  }
  const returnType = context.factResolver.resolve(subject, selectedTargetSignatureFactKey)?.member.returnType ??
    getNonSemanticTargetType(subject, context, host);
  return isNumericSourcePrimitive(returnType);
}

function targetTypeIsString(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "target-named" &&
    (type as { readonly csharpSpecialType?: unknown }).csharpSpecialType === "string";
}
