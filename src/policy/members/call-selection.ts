import type {
  ExtensionDiagnostic,
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  SourceFileSemantics,
  SourceProgramNavigation,
} from "@tsonic/target-api";
import type {
  CsharpProviderOperationHost,
  CsharpProviderOperationResolution,
} from "./provider-operations.js";
import {
  resolveCsharpProviderCallRelations,
} from "./provider-operations.js";
import type {
  CsharpInstantiatedProviderCall,
  CsharpProviderCallInstantiation,
  CsharpProviderCallInstantiationHost,
} from "./instantiation.js";
import {
  compareInstantiatedProviderCalls,
  instantiateCsharpProviderCall,
} from "./instantiation.js";

type ResolvedSourceCallInfo = NonNullable<
  ReturnType<SourceFileSemantics["getResolvedCallInfo"]>
>;

export type CsharpProviderCallSelection =
  | {
      readonly kind: "resolved";
      readonly source: ResolvedSourceCallInfo;
      readonly call: CsharpInstantiatedProviderCall;
    }
  | {
      readonly kind: "not-provider";
      readonly source: ResolvedSourceCallInfo;
      readonly reason: string;
    }
  | {
      readonly kind: "missing";
      readonly reason: string;
    }
  | {
      readonly kind: "conflict";
      readonly reason: string;
    }
  | {
      readonly kind: "ambiguous";
      readonly reason: string;
      readonly candidates: readonly string[];
    }
  | {
      readonly kind: "rejected";
      readonly diagnostic: ExtensionDiagnostic;
    };

export interface CsharpProviderCallSelectionHost
  extends CsharpProviderOperationHost,
    CsharpProviderCallInstantiationHost {
  readonly navigation: SourceProgramNavigation;
}

export function selectCsharpProviderCall(
  host: CsharpProviderCallSelectionHost,
  call: Node,
  sourceFile: SourceFile,
): CsharpProviderCallSelection {
  const source = host.semantics(sourceFile).getResolvedCallInfo(
    call,
  );
  if (source === undefined) {
    return {
      kind: "missing",
      reason: "The checker did not resolve an exact source call.",
    };
  }
  const projectCallee = host.navigation.isProjectDeclaration(
      source.sourceCallee.selectedDeclaration,
    )
    ? source.sourceCallee.selectedDeclaration
    : undefined;
  const resolution = resolveCsharpProviderCallRelations(
    host,
    call,
    sourceFile,
  );
  if (resolution.kind === "missing") {
    return {
      kind: "not-provider",
      source,
      reason: resolution.reason,
    };
  }
  if (resolution.kind === "conflict") {
    return { kind: "conflict", reason: resolution.reason };
  }
  if (resolution.kind === "rejected") {
    return resolution;
  }
  const selected = selectResolvedProviderCall(
    host,
    source,
    sourceFile,
    resolution,
  );
  if (selected.kind !== "resolved" || projectCallee === undefined) {
    return selected;
  }
  const forwarding = host.projectTypes.implicitConstructorForSignature(
    projectCallee,
    source.selectedSignature,
  );
  if (
    forwarding === undefined ||
    selected.call.targetMember.kind !== "constructor" ||
    forwarding.providerBaseMemberId !== selected.call.targetMember.id
  ) {
    return {
      kind: "missing",
      reason:
        "The project-owned callee has no exact implicit constructor relation for the selected provider signature.",
    };
  }
  return {
    kind: "resolved",
    source,
    call: {
      ...selected.call,
      targetMember: forwarding.targetMember,
    },
  };
}

function selectResolvedProviderCall(
  host: CsharpProviderCallSelectionHost,
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
  resolution: Extract<
    CsharpProviderOperationResolution,
    { readonly kind: "resolved" }
  >,
): CsharpProviderCallSelection {
  const candidates = resolution.relations
    .filter((relation) => relation.kind === "signature")
    .map((relation) => instantiateCsharpProviderCall(
      host,
      relation,
      source,
      sourceFile,
    ));
  const accepted = candidates
    .filter((candidate): candidate is Extract<
      CsharpProviderCallInstantiation,
      { readonly kind: "resolved" }
    > => candidate.kind === "resolved");
  if (accepted.length === 1) {
    return { kind: "resolved", source, call: accepted[0]!.call };
  }
  if (accepted.length === 0) {
    return {
      kind: "missing",
      reason: candidates
        .map((candidate) =>
          candidate.kind === "rejected" ? candidate.reason : undefined)
        .filter((reason): reason is string => reason !== undefined)
        .join(" "),
    };
  }
  const best = accepted.filter((candidate) =>
    !accepted.some((other) =>
      other !== candidate &&
      compareInstantiatedProviderCalls(host, other, candidate) === "left"
    ));
  if (best.length === 1) {
    return { kind: "resolved", source, call: best[0]!.call };
  }
  return {
    kind: "ambiguous",
    reason:
      "More than one C# target signature satisfies the same exact selected provider source signature.",
    candidates: best.map((candidate) =>
      `${candidate.call.relation.targetBinding.id}::${candidate.call.targetMember.id}`),
  };
}
