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
  SourceLibraryMemberId,
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
  for (const policy of prevalidatedCallSelectionPolicies) {
    if (!policy.sourceMemberIds.has(sourceMember.id)) {
      continue;
    }
    const member = selectPrevalidatedCallMember(policy, sourceMember, candidates, request, context, host);
    if (member !== undefined) {
      return member;
    }
  }
  return candidates.length === 1 ? candidates[0] : undefined;
}

export function sourceLibraryCallSelectionOptions(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  sourceMember: SourceLibraryMember,
  host: CsharpJsSurfaceHost,
): Parameters<CsharpJsSurfaceHost["selectTargetMember"]>[3] {
  if (!arraySelectionOptionSourceMemberIds.has(sourceMember.id)) {
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

interface PrevalidatedCallSelectionPolicy {
  readonly sourceMemberIds: ReadonlySet<SourceLibraryMemberId>;
  readonly reason: PrevalidatedCallSelectionReason;
  readonly strategy: PrevalidatedCallSelectionStrategy;
}

type PrevalidatedCallSelectionReason =
  | "provider-overload-selection"
  | "constructor-call-vs-new"
  | "native-array-input-carrier"
  | "callback-arity-overload";

type PrevalidatedCallSelectionStrategy =
  | { readonly kind: "host-select" }
  | { readonly kind: "array-constructor"; readonly emptyTargetId: string; readonly lengthTargetId: string }
  | { readonly kind: "date-constructor"; readonly targetIds: DateConstructorTargetIds }
  | { readonly kind: "array-from-native"; readonly stringTargetId: string; readonly arrayTargetId: string }
  | { readonly kind: "callback-arity"; readonly callbackArgumentIndexes: ReadonlyMap<SourceLibraryMemberId, number>; readonly targetCallbackParameterIndex: number };

interface DateConstructorTargetIds {
  readonly call: string;
  readonly empty: string;
  readonly string: string;
  readonly number: string;
  readonly object: string;
  readonly components: string;
}

function selectPrevalidatedCallMember(
  policy: PrevalidatedCallSelectionPolicy,
  sourceMember: SourceLibraryMember,
  candidates: readonly TargetMember[],
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): TargetMember | undefined {
  switch (policy.strategy.kind) {
    case "host-select":
      return host.selectTargetMember(candidates, {
        arguments: request.arguments,
        receiver: request.calleeReceiver,
      }, context);
    case "array-constructor":
      return selectArrayConstructorPolicyMember(policy.strategy, candidates, request, context, host);
    case "date-constructor":
      return selectDateConstructorPolicyMember(policy.strategy, candidates, request, context, host);
    case "array-from-native":
      return selectArrayFromNativePolicyMember(policy.strategy, candidates, request, context, host);
    case "callback-arity":
      return selectCallbackArityPolicyMember(policy.strategy, sourceMember, candidates, request, context);
  }
}

function selectArrayConstructorPolicyMember(
  strategy: Extract<PrevalidatedCallSelectionStrategy, { readonly kind: "array-constructor" }>,
  candidates: readonly TargetMember[],
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): TargetMember | undefined {
  if (!isNewExpression(request.call, context)) {
    return undefined;
  }
  if (request.arguments.length === 0) {
    return findCandidateById(candidates, strategy.emptyTargetId);
  }
  if (request.arguments.length !== 1) {
    return undefined;
  }
  return host.selectTargetMember(
    candidates.filter((candidate) => candidate.id === strategy.lengthTargetId),
    { arguments: request.arguments },
    context,
  );
}

function selectDateConstructorPolicyMember(
  strategy: Extract<PrevalidatedCallSelectionStrategy, { readonly kind: "date-constructor" }>,
  candidates: readonly TargetMember[],
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): TargetMember | undefined {
  if (!isNewExpression(request.call, context)) {
    return findCandidateById(candidates, strategy.targetIds.call);
  }
  const argumentCount = request.arguments.length;
  if (argumentCount === 0) {
    return findCandidateById(candidates, strategy.targetIds.empty);
  }
  if (argumentCount === 1) {
    const argument = request.arguments[0];
    if (dateSingleArgumentIsString(argument, context, host)) {
      return findCandidateById(candidates, strategy.targetIds.string);
    }
    if (dateSingleArgumentIsNumber(argument, context, host)) {
      return findCandidateById(candidates, strategy.targetIds.number);
    }
    return findCandidateById(candidates, strategy.targetIds.object);
  }
  return argumentCount <= 7
    ? findCandidateById(candidates, strategy.targetIds.components)
    : undefined;
}

function selectArrayFromNativePolicyMember(
  strategy: Extract<PrevalidatedCallSelectionStrategy, { readonly kind: "array-from-native" }>,
  candidates: readonly TargetMember[],
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  host: CsharpJsSurfaceHost,
): TargetMember | undefined {
  if (request.arguments.length !== 1) {
    return undefined;
  }
  const sourceType = getSourceLibraryCallArgumentTargetTypes(request, context, host)[0];
  if (host.isCsharpStringType(sourceType)) {
    return findCandidateById(candidates, strategy.stringTargetId);
  }
  return sourceType !== undefined && getCsharpArrayLikeElementType(sourceType) !== undefined
    ? findCandidateById(candidates, strategy.arrayTargetId)
    : undefined;
}

function selectCallbackArityPolicyMember(
  strategy: Extract<PrevalidatedCallSelectionStrategy, { readonly kind: "callback-arity" }>,
  sourceMember: SourceLibraryMember,
  candidates: readonly TargetMember[],
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): TargetMember | undefined {
  const callbackArgumentIndex = strategy.callbackArgumentIndexes.get(sourceMember.id);
  if (request.sourceSelectedSignature === undefined || callbackArgumentIndex === undefined) {
    return undefined;
  }
  const callbackParameterCount = getSourceFunctionParameterCount(request.arguments[callbackArgumentIndex], context);
  if (callbackParameterCount === undefined) {
    return undefined;
  }
  const matching = candidates.filter((candidate) =>
    getTargetDelegateParameterCount(candidate.parameters[strategy.targetCallbackParameterIndex]?.type) === callbackParameterCount
  );
  return matching.length === 1 ? matching[0] : undefined;
}

function findCandidateById(candidates: readonly TargetMember[], targetId: string): TargetMember | undefined {
  return candidates.find((candidate) => candidate.id === targetId);
}

const prevalidatedCallSelectionPolicies: readonly PrevalidatedCallSelectionPolicy[] = [
  {
    sourceMemberIds: sourceMemberIdSet(["JSON.parse", "JSON.stringify"]),
    reason: "provider-overload-selection",
    strategy: { kind: "host-select" },
  },
  {
    sourceMemberIds: sourceMemberIdSet(["Date.now", "Date.parse", "Date.UTC"]),
    reason: "provider-overload-selection",
    strategy: { kind: "host-select" },
  },
  {
    sourceMemberIds: sourceMemberIdSet(["Date.constructor"]),
    reason: "constructor-call-vs-new",
    strategy: {
      kind: "date-constructor",
      targetIds: {
        call: "Tsonic.CSharp.Js.Date.call",
        empty: "Tsonic.CSharp.Js.Date..ctor()",
        string: "Tsonic.CSharp.Js.Date..ctor(System.String)",
        number: "Tsonic.CSharp.Js.Date..ctor(System.Double)",
        object: "Tsonic.CSharp.Js.Date..ctor(System.Object)",
        components: "Tsonic.CSharp.Js.Date..ctor(System.Int32,System.Int32,System.Int32,System.Int32,System.Int32,System.Int32,System.Int32)",
      },
    },
  },
  {
    sourceMemberIds: sourceMemberIdSet(["Array.constructor"]),
    reason: "constructor-call-vs-new",
    strategy: {
      kind: "array-constructor",
      emptyTargetId: "Tsonic.CSharp.Js.JSArray..ctor()",
      lengthTargetId: "Tsonic.CSharp.Js.JSArray..ctor(System.Double)",
    },
  },
  {
    sourceMemberIds: sourceMemberIdSet(["Array.from"]),
    reason: "native-array-input-carrier",
    strategy: {
      kind: "array-from-native",
      stringTargetId: "Tsonic.CSharp.Js.Array.from:string:native",
      arrayTargetId: "Tsonic.CSharp.Js.Array.from:array:native",
    },
  },
  {
    sourceMemberIds: sourceMemberIdSet([
      "Array.every",
      "Array.filter",
      "Array.find",
      "Array.findIndex",
      "Array.findLast",
      "Array.findLastIndex",
      "Array.forEach",
      "Array.from",
      "Array.map",
      "Array.some",
      "Array.sort",
      "ReadonlyArray.every",
      "ReadonlyArray.filter",
      "ReadonlyArray.find",
      "ReadonlyArray.findIndex",
      "ReadonlyArray.findLast",
      "ReadonlyArray.findLastIndex",
      "ReadonlyArray.forEach",
      "ReadonlyArray.map",
      "ReadonlyArray.some",
    ]),
    reason: "callback-arity-overload",
    strategy: {
      kind: "callback-arity",
      callbackArgumentIndexes: new Map<SourceLibraryMemberId, number>([
        ["Array.from", 1],
        ["Array.every", 0],
        ["Array.filter", 0],
        ["Array.find", 0],
        ["Array.findIndex", 0],
        ["Array.findLast", 0],
        ["Array.findLastIndex", 0],
        ["Array.forEach", 0],
        ["Array.map", 0],
        ["Array.some", 0],
        ["Array.sort", 0],
        ["ReadonlyArray.every", 0],
        ["ReadonlyArray.filter", 0],
        ["ReadonlyArray.find", 0],
        ["ReadonlyArray.findIndex", 0],
        ["ReadonlyArray.findLast", 0],
        ["ReadonlyArray.findLastIndex", 0],
        ["ReadonlyArray.forEach", 0],
        ["ReadonlyArray.map", 0],
        ["ReadonlyArray.some", 0],
      ]),
      targetCallbackParameterIndex: 1,
    },
  },
];

const arraySelectionOptionSourceMemberIds = sourceMemberIdSet([
  "Array.constructor",
  "Array.from",
  "Array.of",
  "Array.isArray",
  "Array.push",
  "Array.pop",
  "Array.shift",
  "Array.unshift",
  "Array.concat",
  "Array.at",
  "Array.includes",
  "Array.indexOf",
  "Array.lastIndexOf",
  "Array.join",
  "Array.slice",
  "Array.splice",
  "Array.reverse",
  "Array.sort",
  "Array.forEach",
  "Array.some",
  "Array.every",
  "Array.filter",
  "Array.map",
  "Array.find",
  "Array.findIndex",
  "Array.findLast",
  "Array.findLastIndex",
  "ReadonlyArray.concat",
  "ReadonlyArray.at",
  "ReadonlyArray.includes",
  "ReadonlyArray.indexOf",
  "ReadonlyArray.lastIndexOf",
  "ReadonlyArray.join",
  "ReadonlyArray.slice",
  "ReadonlyArray.forEach",
  "ReadonlyArray.some",
  "ReadonlyArray.every",
  "ReadonlyArray.filter",
  "ReadonlyArray.map",
  "ReadonlyArray.find",
  "ReadonlyArray.findIndex",
  "ReadonlyArray.findLast",
  "ReadonlyArray.findLastIndex",
]);

function sourceMemberIdSet(ids: readonly SourceLibraryMemberId[]): ReadonlySet<SourceLibraryMemberId> {
  return new Set(ids);
}

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
