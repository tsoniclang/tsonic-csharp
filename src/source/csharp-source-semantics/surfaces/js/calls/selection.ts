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
  getNodeField,
  getNodeList,
} from "../../../ast-utils.js";
import {
  getNonSemanticTargetType,
  getSourceLibraryCallArgumentTargetTypes,
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
  const arrayConstructorMember = getPrevalidatedArrayConstructorCallMember(sourceMember, candidates, request, context, host);
  if (arrayConstructorMember !== undefined) {
    return arrayConstructorMember;
  }
  const arrayFromMember = getPrevalidatedArrayFromCallMember(sourceMember, candidates, request, context, host);
  if (arrayFromMember !== undefined) {
    return arrayFromMember;
  }
  const arrayCallbackMember = getPrevalidatedArrayCallbackCallMember(sourceMember, candidates, request, context);
  if (arrayCallbackMember !== undefined) {
    return arrayCallbackMember;
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

function getPrevalidatedArrayConstructorCallMember(
  sourceMember: SourceLibraryMember,
  candidates: readonly TargetMember[],
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): TargetMember | undefined {
  if (sourceMember.declaringName !== "Array" || sourceMember.memberName !== "constructor" || !isNewExpression(request.call, context)) {
    return undefined;
  }
  if (request.arguments.length === 0) {
    return candidates.find((candidate) => candidate.id === "Tsonic.CSharp.Js.JSArray..ctor()");
  }
  if (request.arguments.length !== 1) {
    return undefined;
  }
  return host.selectTargetMember(
    candidates.filter((candidate) => candidate.id === "Tsonic.CSharp.Js.JSArray..ctor(System.Double)"),
    { arguments: request.arguments },
    context,
  );
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

function getPrevalidatedArrayFromCallMember(
  sourceMember: SourceLibraryMember,
  candidates: readonly TargetMember[],
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): TargetMember | undefined {
  if (sourceMember.declaringName !== "Array" || sourceMember.memberName !== "from" || request.arguments.length !== 1) {
    return undefined;
  }
  const sourceType = getSourceLibraryCallArgumentTargetTypes(request, context, host)[0];
  if (host.isCsharpStringType(sourceType)) {
    return candidates.find((candidate) => candidate.id === "Tsonic.CSharp.Js.Array.from:string:native");
  }
  if (sourceType !== undefined && getCsharpArrayLikeElementType(sourceType) !== undefined) {
    return candidates.find((candidate) => candidate.id === "Tsonic.CSharp.Js.Array.from:array:native");
  }
  return undefined;
}

function getPrevalidatedArrayCallbackCallMember(
  sourceMember: SourceLibraryMember,
  candidates: readonly TargetMember[],
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): TargetMember | undefined {
  if (
    request.sourceSelectedSignature === undefined ||
    (sourceMember.declaringName !== "Array" && sourceMember.declaringName !== "ReadonlyArray") ||
    !arrayCallbackSourceMembers.has(sourceMember.memberName)
  ) {
    return undefined;
  }
  const callbackArgumentIndex = sourceMember.memberName === "from" ? 1 : 0;
  const callbackParameterCount = getSourceFunctionParameterCount(request.arguments[callbackArgumentIndex], context);
  if (callbackParameterCount === undefined) {
    return undefined;
  }
  const targetCallbackParameterIndex = sourceMember.memberName === "from" ? 1 : 1;
  const matching = candidates.filter((candidate) =>
    getTargetDelegateParameterCount(candidate.parameters[targetCallbackParameterIndex]?.type) === callbackParameterCount
  );
  return matching.length === 1 ? matching[0] : undefined;
}

const arrayCallbackSourceMembers = new Set([
  "every",
  "filter",
  "find",
  "findIndex",
  "findLast",
  "findLastIndex",
  "forEach",
  "from",
  "map",
  "some",
  "sort",
]);

function getSourceFunctionParameterCount(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): number | undefined {
  const node = asNodeSubject(subject);
  const ast = context.compiler?.ast;
  if (node === undefined || ast === undefined) {
    return undefined;
  }
  if (!ast.is.IsArrowFunction(node) && !ast.is.IsFunctionExpression(node)) {
    return undefined;
  }
  return getNodeList(getNodeField(node, "Parameters")).length;
}

function getTargetDelegateParameterCount(type: TargetTypeRef | undefined): number | undefined {
  return type?.kind === "target-named"
    ? (type as { readonly csharpDelegateSignature?: { readonly parameters?: readonly unknown[] } }).csharpDelegateSignature?.parameters?.length
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
