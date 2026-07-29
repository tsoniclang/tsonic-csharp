import type {
  ExtensionDiagnostic,
  SourceFile,
  SourceFileQueries,
} from "@tsonic/tsts";
import type {
  CsharpTargetReceiverRelation,
} from "../../provider/target-relations/index.js";
import type {
  CsharpTargetMember,
  TargetTypeRef,
} from "../types/index.js";
import type {
  CsharpProviderCallSelectionHost,
} from "./call-selection.js";
import {
  csharpSourceProfileDeclarationIdentity,
} from "./source-profile-identity.js";
import type {
  CsharpSourceProfileDeclarationIdentity,
  CsharpSourceProfileOwner,
} from "./source-profile-identity.js";
import type {
  CsharpSelectedCallArgument,
  CsharpSelectedTargetCall,
  CsharpTargetElementInvocation,
  ResolvedSourceCallInfo,
} from "./selection-types.js";

type ResolvedSourcePropertyAccessInfo = NonNullable<
  ReturnType<SourceFileQueries["checker"]["getResolvedPropertyAccessInfo"]>
>;
type ResolvedSourceElementAccessInfo = NonNullable<
  ReturnType<SourceFileQueries["checker"]["getResolvedElementAccessInfo"]>
>;

export interface CsharpSourceProfileIdentitySelector {
  readonly owner: CsharpSourceProfileOwner;
  readonly kind: CsharpSourceProfileDeclarationIdentity["kind"];
  readonly declaringName?: string;
  readonly name?: string;
}

export interface CsharpSourceProfileCallPolicyContext {
  readonly host: CsharpProviderCallSelectionHost;
  readonly source: ResolvedSourceCallInfo;
  readonly sourceFile: SourceFile;
  readonly identity: CsharpSourceProfileDeclarationIdentity;
}

export interface CsharpSourceProfilePropertyPolicyContext {
  readonly host: CsharpProviderCallSelectionHost;
  readonly source: ResolvedSourcePropertyAccessInfo;
  readonly sourceFile: SourceFile;
  readonly identity: CsharpSourceProfileDeclarationIdentity;
}

export interface CsharpSourceProfileElementPolicyContext {
  readonly host: CsharpProviderCallSelectionHost;
  readonly source: ResolvedSourceElementAccessInfo;
  readonly sourceFile: SourceFile;
  readonly identity: CsharpSourceProfileDeclarationIdentity;
}

export type CsharpSourceProfileCallPolicyResult =
  | {
      readonly kind: "resolved";
      readonly call: CsharpSelectedTargetCall;
    }
  | {
      readonly kind: "rejected";
      readonly diagnostic: ExtensionDiagnostic;
    };

export type CsharpSourceProfilePropertyPolicyResult =
  | {
      readonly kind: "resolved";
      readonly targetMember: CsharpTargetMember;
      readonly receiver: CsharpTargetReceiverRelation;
    }
  | {
      readonly kind: "rejected";
      readonly diagnostic: ExtensionDiagnostic;
    };

export type CsharpSourceProfileElementPolicyResult =
  | {
      readonly kind: "resolved";
      readonly targetMember: CsharpTargetMember;
      readonly targetParameterIndex: number;
      readonly receiver: CsharpTargetReceiverRelation;
      readonly invocation: CsharpTargetElementInvocation;
    }
  | {
      readonly kind: "rejected";
      readonly diagnostic: ExtensionDiagnostic;
    };

export interface CsharpSourceProfileCallPolicy {
  readonly source: CsharpSourceProfileIdentitySelector;
  select(
    context: CsharpSourceProfileCallPolicyContext,
  ): CsharpSourceProfileCallPolicyResult | undefined;
}

export interface CsharpSourceProfilePropertyPolicy {
  readonly source: CsharpSourceProfileIdentitySelector;
  select(
    context: CsharpSourceProfilePropertyPolicyContext,
  ): CsharpSourceProfilePropertyPolicyResult | undefined;
}

export interface CsharpSourceProfileElementPolicy {
  readonly source: CsharpSourceProfileIdentitySelector;
  select(
    context: CsharpSourceProfileElementPolicyContext,
  ): CsharpSourceProfileElementPolicyResult | undefined;
}

export function selectCsharpSourceProfileCallPolicy(
  host: CsharpProviderCallSelectionHost,
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
  policies: readonly CsharpSourceProfileCallPolicy[],
): CsharpSourceProfileCallPolicyResult | undefined {
  const declaration = host.queries(sourceFile).checker
    .getSignatureDeclaration(source.selectedSignature);
  const identity = csharpSourceProfileDeclarationIdentity(
    host.queries(sourceFile).ast,
    declaration,
  );
  if (identity === undefined) {
    return undefined;
  }
  const matches = policies.filter((policy) =>
    sourceProfileIdentityMatches(policy.source, identity)
  );
  const selected = selectExactlyOnePolicy(matches, identity);
  return selected.kind === "missing"
    ? undefined
    : selected.kind === "ambiguous"
      ? { kind: "rejected", diagnostic: selected.diagnostic }
      : selected.policy.select({ host, source, sourceFile, identity });
}

export function selectCsharpSourceProfilePropertyPolicy(
  host: CsharpProviderCallSelectionHost,
  source: ResolvedSourcePropertyAccessInfo,
  sourceFile: SourceFile,
  policies: readonly CsharpSourceProfilePropertyPolicy[],
): CsharpSourceProfilePropertyPolicyResult | undefined {
  const identity = csharpSourceProfileDeclarationIdentity(
    host.queries(sourceFile).ast,
    source.selectedDeclaration,
  );
  if (identity === undefined) {
    return undefined;
  }
  const matches = policies.filter((policy) =>
    sourceProfileIdentityMatches(policy.source, identity)
  );
  const selected = selectExactlyOnePolicy(matches, identity);
  return selected.kind === "missing"
    ? undefined
    : selected.kind === "ambiguous"
      ? { kind: "rejected", diagnostic: selected.diagnostic }
      : selected.policy.select({ host, source, sourceFile, identity });
}

export function selectCsharpSourceProfileElementPolicy(
  host: CsharpProviderCallSelectionHost,
  source: ResolvedSourceElementAccessInfo,
  sourceFile: SourceFile,
  policies: readonly CsharpSourceProfileElementPolicy[],
): CsharpSourceProfileElementPolicyResult | undefined {
  const identity = csharpSourceProfileDeclarationIdentity(
    host.queries(sourceFile).ast,
    source.selectedDeclaration,
  );
  if (identity === undefined) {
    return undefined;
  }
  const matches = policies.filter((policy) =>
    sourceProfileIdentityMatches(policy.source, identity)
  );
  const selected = selectExactlyOnePolicy(matches, identity);
  return selected.kind === "missing"
    ? undefined
    : selected.kind === "ambiguous"
      ? { kind: "rejected", diagnostic: selected.diagnostic }
      : selected.policy.select({ host, source, sourceFile, identity });
}

export function csharpSourceProfileCall(
  source: ResolvedSourceCallInfo,
  targetMember: CsharpTargetMember,
  receiver: CsharpTargetReceiverRelation,
  targetMethodTypeArguments: readonly TargetTypeRef[] = [],
  options: {
    readonly targetParameterBySourceParameter?: readonly (
      number | undefined
    )[];
  } = {},
): CsharpSelectedTargetCall | undefined {
  const sourceParameters = source.sourceSelectedSignatureParameters;
  if (
    source.sourceSelectedSignatureKind !== "resolved"
  ) {
    return undefined;
  }
  if (
    targetMethodTypeArguments.length !==
      (targetMember.typeParameters?.length ?? 0)
  ) {
    return undefined;
  }
  if (
    receiver.kind === "instance" && source.sourceReceiver === undefined ||
    receiver.kind === "target-parameter" &&
      (
        source.sourceReceiver === undefined ||
        receiver.targetParameterIndex < 0 ||
        receiver.targetParameterIndex >= targetMember.parameters.length
      )
  ) {
    return undefined;
  }
  const explicitMapping = options.targetParameterBySourceParameter;
  if (
    explicitMapping !== undefined &&
    explicitMapping.length !== sourceParameters.length
  ) {
    return undefined;
  }
  const targetParameterIndexBySource = explicitMapping === undefined
    ? defaultSourceParameterMapping(sourceParameters.length, receiver)
    : new Map(
        explicitMapping.flatMap((targetIndex, sourceIndex) =>
          targetIndex === undefined ? [] : [[sourceIndex, targetIndex] as const]
        ),
      );
  const usedTargetIndexes = new Set<number>();
  if (receiver.kind === "target-parameter") {
    usedTargetIndexes.add(receiver.targetParameterIndex);
  }
  for (const targetIndex of targetParameterIndexBySource.values()) {
    if (
      targetIndex < 0 ||
      targetIndex >= targetMember.parameters.length ||
      usedTargetIndexes.has(targetIndex)
    ) {
      return undefined;
    }
    usedTargetIndexes.add(targetIndex);
  }
  if (
    targetMember.parameters.some((parameter, index) =>
      !usedTargetIndexes.has(index) &&
      parameter.optional !== true &&
      parameter.csharpOmittableOptionalArgument !== true &&
      parameter.paramsArray !== true
    )
  ) {
    return undefined;
  }
  const arguments_: CsharpSelectedCallArgument[] = [];
  for (const binding of source.sourceArgumentBindings) {
    const relatedTargetIndex = targetParameterIndexBySource.get(
      binding.sourceParameterIndex,
    );
    const targetParameter = relatedTargetIndex === undefined
      ? undefined
      : targetMember.parameters[relatedTargetIndex];
    if (
      relatedTargetIndex === undefined ||
      targetParameter === undefined
    ) {
      return undefined;
    }
    arguments_.push({
      sourceArgumentIndex: binding.sourceArgumentIndex,
      effectiveArgumentIndex: binding.effectiveArgumentIndex,
      sourceForm: binding.sourceForm,
      ...(binding.spreadElementIndex === undefined
        ? {}
        : { spreadElementIndex: binding.spreadElementIndex }),
      targetParameterIndex: relatedTargetIndex,
      targetParameter,
    });
  }
  return {
    origin: "source-profile",
    targetMember,
    receiver,
    targetMethodTypeArguments,
    arguments: Object.freeze(arguments_),
  };
}

function defaultSourceParameterMapping(
  sourceParameterCount: number,
  receiver: CsharpTargetReceiverRelation,
): ReadonlyMap<number, number> {
  const mapping = new Map<number, number>();
  let targetIndex = 0;
  for (let sourceIndex = 0; sourceIndex < sourceParameterCount; sourceIndex += 1) {
    while (
      receiver.kind === "target-parameter" &&
      targetIndex === receiver.targetParameterIndex
    ) {
      targetIndex += 1;
    }
    mapping.set(sourceIndex, targetIndex);
    targetIndex += 1;
  }
  return mapping;
}

export function csharpSourceProfileDiagnostic(
  extensionCode: string,
  numericCode: number,
  message: string,
  evidence: readonly string[] = [],
): ExtensionDiagnostic {
  return Object.freeze({
    extensionId: "tsonic-csharp",
    extensionCode,
    numericCode,
    publicCode: extensionCode,
    category: "error",
    message,
    ...(evidence.length === 0
      ? {}
      : {
          evidence: Object.freeze(
            evidence.map((entry) => Object.freeze({ message: entry })),
          ),
        }),
  });
}

function sourceProfileIdentityMatches(
  selector: CsharpSourceProfileIdentitySelector,
  identity: CsharpSourceProfileDeclarationIdentity,
): boolean {
  return selector.owner === identity.owner &&
    selector.kind === identity.kind &&
    (
      selector.declaringName === undefined ||
      selector.declaringName === identity.declaringName
    ) &&
    (selector.name === undefined || selector.name === identity.name);
}

type SourceProfilePolicySelection<T> =
  | { readonly kind: "missing" }
  | { readonly kind: "selected"; readonly policy: T }
  | {
      readonly kind: "ambiguous";
      readonly diagnostic: ExtensionDiagnostic;
    };

function selectExactlyOnePolicy<T>(
  candidates: readonly T[],
  identity: CsharpSourceProfileDeclarationIdentity,
): SourceProfilePolicySelection<T> {
  if (candidates.length === 0) {
    return { kind: "missing" };
  }
  if (candidates.length === 1) {
    return { kind: "selected", policy: candidates[0]! };
  }
  return {
    kind: "ambiguous",
    diagnostic: csharpSourceProfileDiagnostic(
      "CSHARP_SOURCE_PROFILE_POLICY_AMBIGUOUS",
      9100999,
      `More than one C# policy owns the exact source-profile identity '${formatIdentity(identity)}'.`,
      [
        `Matching policy count: ${candidates.length}.`,
        "Source-profile policy composition must define one semantic owner for each exact declaration identity.",
      ],
    ),
  };
}

function formatIdentity(
  identity: CsharpSourceProfileDeclarationIdentity,
): string {
  return [
    identity.owner,
    identity.declaringName,
    identity.name,
    identity.kind,
  ].filter((part) => part !== undefined).join(".");
}
