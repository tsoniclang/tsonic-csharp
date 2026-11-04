import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, CsharpTargetNamedTypeRef } from "../../../target-model/types/model.js";
import { csharpSourceMemberKeysEqual } from "../../../target-model/types/source-member-keys.js";
import { resolveCsharpObjectMethodImplementation, type CsharpObjectMethodImplementationInput } from "./method-implementations.js";
import { selectCsharpMethodValueEnvironment } from "../../../policy/types/objects/method-environments.js";
import { csharpObjectShapeMethodRequiresProtocol } from "../../../target-model/types/method-values.js";
import { selectCsharpCopiedMethodReceiver } from "../copied-methods.js";
import type { CsharpObjectShapePolicyHost, CsharpRecursiveObjectShapePolicy } from "./model.js";
import type { CsharpObjectLiteralTargetShapeResolution } from "../../../target-model/records/objects/object-shapes.js";
import { retainLiteralMemberEvidence } from "./member-evidence.js";
import type { CsharpObjectLiteralConstructionSource } from "./literal-source.js";
import type { CsharpObjectShapeSource } from "./shape-source.js";
import { instantiateMemberEvidence, type CsharpObjectShapeMemberProofInput } from "./member-instantiation.js";
import type { CsharpObjectShapeTargetInput } from "./method-values.js";

export type CsharpLiteralShapeRequest = {
  readonly source: CsharpObjectLiteralConstructionSource;
} & (
  | { readonly kind: "spread"; readonly spread: CsharpObjectLiteralConstructionSource["literal"]["spreads"][number] }
  | { readonly kind: "receiver"; readonly members: readonly CsharpObjectShapeMemberFact[];
      readonly sources: readonly CsharpObjectShapeFact[] }
  | { readonly kind: "implementation"; readonly input: CsharpObjectMethodImplementationInput }
  | { readonly kind: "target"; readonly input: CsharpObjectShapeTargetInput }
  | { readonly kind: "publication"; readonly shape: CsharpObjectShapeFact }
);

export type CsharpCompletedLiteralShapeRequest = { readonly request: CsharpLiteralShapeRequest } & (
  | { readonly kind: "spread"; readonly shape: CsharpObjectShapeFact | undefined }
  | { readonly kind: "receiver"; readonly selection: ReturnType<typeof selectCsharpCopiedMethodReceiver> }
  | { readonly kind: "implementation"; readonly implementation: CsharpObjectShapeFact["methodImplementation"] }
  | { readonly kind: "target" | "publication"; readonly shape: CsharpObjectShapeFact }
);

function requiresSourceProof(member: CsharpObjectShapeMemberFact, source: CsharpObjectShapeMemberProofInput): void {
  if (member.sourceSubjects !== source.sourceSubjects || member.sourceDeclarations !== source.sourceDeclarations ||
    member.sourceTypes !== source.sourceTypes || member.sourceMemberEvidence !== source.sourceMemberEvidence ||
    member.optional !== source.optional) failTargetAnalysisInvariant("tsonic-csharp",
      "Literal completion requires its exact retained selected source proof row.");
}

function requiresShapeSource(shape: CsharpObjectShapeFact, source: CsharpObjectShapeSource): void {
  if (shape.sourceType !== source.sourceType || shape.members.length !== source.members.length) {
    return failTargetAnalysisInvariant("tsonic-csharp", "Literal completion requires the same selected source occurrence.");
  }
  for (const [index, member] of shape.members.entries()) {
    const selected = source.members[index]!;
    if (!csharpSourceMemberKeysEqual(member.sourceKey, selected.sourceKey) || member.memberKind !== selected.memberKind) {
      return failTargetAnalysisInvariant("tsonic-csharp", "Literal completion requires every original selected member in order.");
    }
    requiresSourceProof(member, selected.proof);
  }
}

export function* completeCsharpLiteralShapeSource(
    source: CsharpObjectLiteralConstructionSource,
    expectedShape: CsharpObjectShapeFact | undefined,
    actualShape: CsharpObjectShapeFact | undefined,
  ): Generator<CsharpLiteralShapeRequest, CsharpObjectLiteralTargetShapeResolution, CsharpCompletedLiteralShapeRequest> {
    const { objectLiteral, accessors } = source.literal;
    if (accessors.kind === "rejected") return {
      kind: "rejected", subject: accessors.element, reason: accessors.reason,
    };
    if (expectedShape === undefined) {
      if (source.expected !== undefined) return failTargetAnalysisInvariant("tsonic-csharp",
        "Literal completion requires its genuinely absent expected source occurrence.", objectLiteral);
      if (accessors.kind === "none") return { kind: "not-applicable" };
      const setterOnly = accessors.members.find(member => member.getter === undefined);
      return setterOnly === undefined
        ? { kind: "rejected", subject: accessors.members[0]!.getter!.element,
            reason: "Object-literal accessor has no exact finalized property-shape contract." }
        : { kind: "rejected", subject: setterOnly.setter!.element,
            reason: `Object-literal setter '${setterOnly.sourceName}' has no getter and therefore no exact native read carrier.` };
    }
    if (source.expected === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
      "Literal completion requires its retained expected source occurrence.", objectLiteral);
    requiresShapeSource(expectedShape, source.expected);
    if (source.actual.kind === "absent") {
      if (actualShape !== undefined) return failTargetAnalysisInvariant("tsonic-csharp",
        "Literal completion cannot replace a completed absent actual occurrence.", objectLiteral);
    } else {
      if (actualShape === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
        "Literal completion requires its exact selected actual native child.", objectLiteral);
      requiresShapeSource(actualShape, source.actual.source);
    }
    const implemented = expectedShape.targetType.kind === "target-named" &&
        ((expectedShape.targetType as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind === "interface" ||
          (expectedShape.targetType as CsharpTargetNamedTypeRef).csharpStructuralContract === true)
      ? [expectedShape.targetType] : expectedShape.implements;
    const selected = source.selected;
    const sourceType = selected?.sourceType;
    const expectedMembers = source.actual.kind === "absent" ? expectedShape.members
      : selected?.kind === "instantiated" ? instantiateMemberEvidence(expectedShape.members, selected.instantiation) : undefined;
    if (sourceType === undefined || expectedMembers === undefined || source.members === undefined) return {
      kind: "rejected", subject: objectLiteral,
      reason: "Object-literal construction requires exact member correspondence with its declared native contract.",
    };
    const additionalMembers = source.additional.map(selection => {
      const member = actualShape?.members[selection.index];
      if (member === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
        "Literal completion requires every retained additional actual member.", objectLiteral);
      requiresSourceProof(member, selection.member.proof);
      return member;
    });
    const members = [...retainLiteralMemberEvidence([...expectedMembers, ...additionalMembers], source.members)];
    const nativeMethodLiteral = source.nativeMethodLiteral;
    const copiedMethods = source.literal.spreads.length !== 0 && expectedShape.members.some(csharpObjectShapeMethodRequiresProtocol);
    const ownsImplementation = expectedShape.methodImplementation?.declaration === objectLiteral;
    if (additionalMembers.length === 0 && accessors.kind === "none" && implemented === expectedShape.implements &&
      (!nativeMethodLiteral || ownsImplementation) && !copiedMethods) {
      const publication = Object.freeze({ kind: "publication" as const, source,
        shape: Object.freeze({ ...expectedShape, sourceType, members }) });
      const completed = yield publication;
      if (completed.request !== publication || completed.kind !== "publication") return failTargetAnalysisInvariant("tsonic-csharp",
        "Literal publication requires its exact selected occurrence receipt.", objectLiteral);
      return { kind: "resolved", shape: completed.shape };
    }
    if (copiedMethods) {
      const sources: CsharpObjectShapeFact[] = [];
      for (const spread of source.literal.spreads) {
        const request = Object.freeze({ kind: "spread" as const, source, spread });
        const completed = yield request;
        if (completed.request !== request || completed.kind !== "spread") return failTargetAnalysisInvariant("tsonic-csharp",
          "Copied methods require their exact ordered spread child receipt.", spread.property);
        const shape = completed.shape;
        if (shape === undefined) return { kind: "rejected", subject: spread.property,
          reason: "Copied generic methods require an exact source object environment." };
        sources.push(shape);
      }
      const request = Object.freeze({ kind: "receiver" as const, source,
        members: Object.freeze([...members]), sources: Object.freeze(sources) });
      const completed = yield request;
      if (completed.request !== request || completed.kind !== "receiver") return failTargetAnalysisInvariant("tsonic-csharp",
        "Copied methods require their exact retained receiver selection receipt.", objectLiteral);
      const receiver = completed.selection;
      if (receiver.kind === "rejected") return { kind: "rejected", subject: objectLiteral,
        reason: "Copied receiver-dependent methods require their exact native receiver and authored implementation." };
      if (receiver.kind === "selected") return { kind: "resolved", shape: receiver.shape };
      for (const shape of sources) {
        for (const sourceMember of shape.members) {
          const environment = selectCsharpMethodValueEnvironment(shape, sourceMember);
          if (environment === undefined) continue;
          const index = members.findIndex(member => csharpSourceMemberKeysEqual(member.sourceKey, sourceMember.sourceKey));
          if (index < 0 || source.ownedMembers[index] === true) continue;
          const member = members[index]!;
          members[index] = { ...member, methodValueContract: sourceMember.methodValueContract, methodValueStorage: environment.storage };
        }
      }
    }
    for (const selection of source.accessors) {
      const { accessor, index, input, output } = selection;
      const member = index === undefined ? undefined : members[index];
      if (member === undefined || input === undefined || member.memberKind !== "property") return {
        kind: "rejected", subject: accessor.getter?.element ?? accessor.setter!.element,
        reason: `Object-literal accessor '${accessor.sourceName}' does not match one exact finalized property-shape member.`,
      };
      requiresSourceProof(member, input);
      if (accessor.getter === undefined) return {
        kind: "rejected", subject: accessor.setter!.element,
        reason: `Object-literal setter '${accessor.sourceName}' has no getter and therefore no exact native read carrier.`,
      };
      if (member.readonly !== true && accessor.setter === undefined) return {
        kind: "rejected", subject: accessor.getter.element,
        reason: `Object-literal getter '${accessor.sourceName}' cannot satisfy the selected writable property contract without an exact setter.`,
      };
      if (output === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
        "Literal accessor completion requires its retained source output proof.", accessor.getter.element);
      members[index!] = { ...member, sourceSubjects: output.sourceSubjects,
        sourceDeclarations: output.sourceDeclarations, sourceTypes: output.sourceTypes,
        accessor: { getter: true, setter: accessor.setter !== undefined },
      };
    }
    const implementationRequest = Object.freeze({ kind: "implementation" as const, source, input: Object.freeze({
      source: source.implementation, memberNames: Object.freeze(members.map(member => member.targetName)),
      captures: source.captures,
    }) });
    const implementation = yield implementationRequest;
    if (implementation.request !== implementationRequest || implementation.kind !== "implementation") return failTargetAnalysisInvariant("tsonic-csharp",
      "Literal methods require their exact retained implementation receipt.", objectLiteral);
    const methodImplementation = implementation.implementation;
    if (nativeMethodLiteral && methodImplementation === undefined) return {
      kind: "rejected", subject: objectLiteral,
      reason: "Native object methods require one exact authored implementation and closed lexical capture types.",
    };
    const targetRequest: Extract<CsharpLiteralShapeRequest, { readonly kind: "target" }> = Object.freeze({ kind: "target", source, input: Object.freeze({
      target: Object.freeze({ kind: "structural", contract: false }),
      members, sourceType,
      ...(methodImplementation === undefined ? {} : { methodImplementation }),
      ...(implemented === undefined ? {} : { implements: implemented }),
    }) });
    const target = yield targetRequest;
    if (target.request !== targetRequest || target.kind !== "target") return failTargetAnalysisInvariant("tsonic-csharp",
      "Literal methods require their exact selected physical target receipt.", objectLiteral);
    const publication = Object.freeze({ kind: "publication" as const, source, shape: target.shape });
    const completed = yield publication;
    if (completed.request !== publication || completed.kind !== "publication") return failTargetAnalysisInvariant("tsonic-csharp",
      "Literal publication requires its exact physical target receipt.", objectLiteral);
    return { kind: "resolved", shape: completed.shape };
  }

export function createCsharpLiteralShapeResolver(
  host: CsharpObjectShapePolicyHost,
  dependencies: {
    readonly resolveNode: CsharpRecursiveObjectShapePolicy["resolveNode"];
    readonly rememberTargetShape: (shape: CsharpObjectShapeFact) => CsharpObjectShapeFact;
    readonly formTargetShape: (input: CsharpObjectShapeTargetInput) => CsharpObjectShapeFact;
  },
) {
  return (source: CsharpObjectLiteralConstructionSource, expected: CsharpObjectShapeFact | undefined,
    actual: CsharpObjectShapeFact | undefined): CsharpObjectLiteralTargetShapeResolution => {
    const completion = completeCsharpLiteralShapeSource(source, expected, actual);
    let step = completion.next();
    while (!step.done) {
      const request = step.value;
      if (request.kind === "spread") {
        step = completion.next(Object.freeze({ kind: "spread", request,
          shape: dependencies.resolveNode(request.spread.expression, source.literal.queries.sourceFile) }));
      } else if (request.kind === "receiver") {
        step = completion.next(Object.freeze({ kind: "receiver", request,
          selection: selectCsharpCopiedMethodReceiver(request.members, request.sources, host.ast) }));
      } else if (request.kind === "implementation") {
        step = completion.next(Object.freeze({ kind: "implementation", request,
          implementation: resolveCsharpObjectMethodImplementation(host, request.input) }));
      } else if (request.kind === "target") {
        step = completion.next(Object.freeze({ kind: "target", request, shape: dependencies.formTargetShape(request.input) }));
      } else {
        step = completion.next(Object.freeze({ kind: "publication", request, shape: dependencies.rememberTargetShape(request.shape) }));
      }
    }
    return step.value;
  };
}
