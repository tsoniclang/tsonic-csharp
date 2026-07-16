import type {
  ExtensionObservationContext,
  Node,
} from "@tsonic/tsts";
import type {
  CsharpSelectedCallTargetFact,
} from "../csharp-facts.js";
import type {
  CsharpOperationsProviderHost,
} from "./operations-provider.js";
import type {
  CsharpTargetMember,
} from "./target-types.js";
import {
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import {
  csharpProviderDiagnostic,
} from "./diagnostics.js";
import {
  csharpJsSurfaceExtensionId,
} from "./identity.js";
import {
  createCsharpLifecycleObservationContext,
} from "./runtime-carrier-context.js";
import {
  asNodeSubject,
  getNodeField,
} from "./ast-utils.js";
import {
  getCsharpArrayBoundaryCoreCarrierForReference,
} from "./surfaces/js/array-boundary-facts.js";
import {
  selectTargetMember,
} from "./target-member-selection.js";
import {
  jsonObjectShapeStringifyTargetMembers,
} from "./surfaces/js/json.js";
import {
  jsonSerializableObjectShapeForSubject,
  recordJsonSerializableObjectShapes,
} from "./surfaces/js/json-shape-serialization.js";
import {
  targetTypeRefEquals,
} from "./target-ref-utils.js";

export function finalizeSelectedCallTargetMember(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  call: Node,
  selectedTarget: CsharpSelectedCallTargetFact | undefined,
  member: CsharpTargetMember,
  host: CsharpOperationsProviderHost,
): CsharpTargetMember | undefined {
  const requirement = selectedTarget?.finalizationRequirement;
  const requirementFinalizedMember = requirement === undefined
    ? member
    : finalizeSelectedCallRequirement(lifecycleContext, call, member, requirement, host);
  if (requirementFinalizedMember === undefined) {
    return undefined;
  }
  return finalizeSelectedCallTargetFamily(lifecycleContext, call, selectedTarget, requirementFinalizedMember, host);
}

function finalizeSelectedCallRequirement(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  call: Node,
  member: CsharpTargetMember,
  requirement: NonNullable<CsharpSelectedCallTargetFact["finalizationRequirement"]>,
  host: CsharpOperationsProviderHost,
): CsharpTargetMember | undefined {
  const compiler = lifecycleContext.compiler;
  const argument = compiler !== undefined && compiler.ast.is.IsCallExpression(call)
    ? compiler.ast.arguments(call)[requirement.argumentIndex]
    : undefined;
  const context = compiler === undefined
    ? undefined
    : createCsharpLifecycleObservationContext(lifecycleContext, "operation.mapCheckedCall");
  switch (requirement.kind) {
    case "closed-json-value": {
      const argumentTargetType = argument === undefined || context === undefined
        ? undefined
        : getFinalizedCallArgumentTargetType(argument, context, host);
      if (argument !== undefined && argumentTargetType !== undefined && context !== undefined &&
        recordJsonSerializableObjectShapes(argument, argumentTargetType, context, host)) {
        return member;
      }
      return rejectMissingJsonFinalization(lifecycleContext, call, member, requirement);
    }
    case "closed-json-object-shape": {
      const argumentTargetType = argument === undefined || context === undefined
        ? undefined
        : getFinalizedCallArgumentTargetType(argument, context, host);
      const shape = argument === undefined || context === undefined
        ? undefined
        : jsonSerializableObjectShapeForSubject(argument, argumentTargetType, context, host);
      if (shape === undefined || argument === undefined || context === undefined ||
        !recordJsonSerializableObjectShapes(argument, shape.targetType, context, host)) {
        return rejectMissingJsonFinalization(lifecycleContext, call, member, requirement);
      }
      const finalized = jsonObjectShapeStringifyTargetMembers(shape.targetType)[0];
      return finalized === undefined
        ? rejectMissingJsonFinalization(lifecycleContext, call, member, requirement)
        : {
            ...finalized,
            ...(member.sourceIdentityKeys === undefined ? {} : { sourceIdentityKeys: member.sourceIdentityKeys }),
          };
    }
  }
}

function getFinalizedCallArgumentTargetType(
  argument: Node,
  context: ExtensionObservationContext,
  host: CsharpOperationsProviderHost,
) {
  return context.facts.get(argument, runtimeCarrierFactKey)?.carrier ??
    context.factResolver.resolve(argument, runtimeCarrierFactKey)?.carrier ??
    host.getTargetTypeRefForSubject(argument, context, {
      allowRuntimeCarrier: true,
      allowSemanticTypeQuery: false,
    });
}

function finalizeSelectedCallTargetFamily(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  call: Node,
  selectedTarget: CsharpSelectedCallTargetFact | undefined,
  member: CsharpTargetMember,
  host: CsharpOperationsProviderHost,
): CsharpTargetMember | undefined {
  const family = selectedTarget?.selectionFamily;
  if (family === undefined) {
    return member;
  }
  if (
    member.csharpDeferredTargetSelection?.familyId === family.familyId &&
    member.csharpDeferredTargetSelection.variant === "implementation"
  ) {
    return member;
  }
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined || !compiler.ast.is.IsCallExpression(call)) {
    return rejectMissingTargetFamilyFinalization(lifecycleContext, call, family, member);
  }
  const callee = asNodeSubject(getNodeField(call, "Expression"));
  const receiver = callee !== undefined && compiler.ast.is.IsPropertyAccessExpression(callee)
    ? asNodeSubject(getNodeField(callee, "Expression"))
    : undefined;
  if (receiver === undefined) {
    return rejectMissingTargetFamilyFinalization(lifecycleContext, call, family, member);
  }
  const context = createCsharpLifecycleObservationContext(lifecycleContext, "operation.mapCheckedCall");
  const sourceFile = compiler.ast.getSourceFile(call);
  const receiverCarrier = getCsharpArrayBoundaryCoreCarrierForReference(receiver, context) ??
    context.facts.get(receiver, runtimeCarrierFactKey)?.carrier ??
    context.factResolver.resolve(receiver, runtimeCarrierFactKey)?.carrier;
  if (receiverCarrier === undefined) {
    return rejectMissingTargetFamilyFinalization(lifecycleContext, call, family, member);
  }
  const arguments_ = compiler.ast.arguments(call).filter((argument): argument is NonNullable<typeof argument> => argument !== undefined);
  const eligibleMembers = family.members.filter((candidate) =>
    deferredFamilyCandidateAcceptsReceiverCarrier(candidate, receiverCarrier)
  );
  const selected = selectTargetMember(
    eligibleMembers,
    {
      arguments: arguments_,
      receiver,
      sourceSelectionProven: true,
      sourceSelectedIdentity: family.sourceIdentity,
    },
    context,
    (subject, resolutionContext, options) => subject === receiver
      ? receiverCarrier
      : host.getTargetTypeRefForSubject(subject, resolutionContext, {
          ...options,
          allowRuntimeCarrier: true,
          allowSemanticTypeQuery: true,
          sourceFile,
        }),
    {
      getBaseTargetTypeRef: host.getBaseTargetTypeRef,
      getAssignableTargetTypeRefs: host.getAssignableTargetTypeRefs,
    },
  );
  return selected?.csharpDeferredTargetSelection?.familyId === family.familyId
    ? selected
    : rejectMissingTargetFamilyFinalization(lifecycleContext, call, family, member);
}

function deferredFamilyCandidateAcceptsReceiverCarrier(
  member: CsharpTargetMember,
  receiverCarrier: import("@tsonic/tsts").TargetTypeRef,
): boolean {
  if (member.csharpDeferredTargetSelection?.variant !== "canonical") {
    return true;
  }
  const expectedReceiver = member.receiverPassing === "first-argument"
    ? member.parameters[0]?.type
    : member.declaringType;
  return expectedReceiver !== undefined && targetTypeRefEquals(expectedReceiver, receiverCarrier);
}

function rejectMissingTargetFamilyFinalization(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"] },
  call: Node,
  family: NonNullable<CsharpSelectedCallTargetFact["selectionFamily"]>,
  member: CsharpTargetMember,
): undefined {
  lifecycleContext.host.diagnostics.append(csharpProviderDiagnostic(
    csharpJsSurfaceExtensionId,
    "CSHARP_SELECTED_CALL_TARGET_FAMILY_NOT_CLOSED",
    9100170,
    "C# call emission requires one exact target member variant selected from finalized carrier facts.",
    [{
      message: "Missing exact target member family closure",
      details: {
        familyId: family.familyId,
        sourceIdentity: family.sourceIdentity,
        canonicalMemberId: member.id,
        candidateMemberIds: family.members.map((candidate) => candidate.id),
        requiredFacts: [
          "TSTS-selected source call identity",
          "canonical target operation family metadata",
          "finalized receiver and argument target carriers",
          "one uniquely matching target member variant",
        ],
      },
    }],
    call,
  ));
  return undefined;
}

function rejectMissingJsonFinalization(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"] },
  call: Node,
  member: CsharpTargetMember,
  requirement: NonNullable<CsharpSelectedCallTargetFact["finalizationRequirement"]>,
): undefined {
  lifecycleContext.host.diagnostics.append(csharpProviderDiagnostic(
    csharpJsSurfaceExtensionId,
    "CSHARP_JSON_VALUE_NOT_CLOSED",
    9100169,
    `C# JSON serialization requires a finalized closed target carrier for argument ${requirement.argumentIndex + 1}.`,
    [{
      message: "Missing closed JSON serialization evidence",
      details: {
        requirement: requirement.kind,
        argumentIndex: requirement.argumentIndex,
        selectedTargetMemberId: member.id,
        requiredFacts: [
          "TSTS-selected JSON operation identity",
          "finalized target argument carrier",
          "closed object-shape member carriers when structurally serialized",
        ],
      },
    }],
    call,
  ));
  return undefined;
}
