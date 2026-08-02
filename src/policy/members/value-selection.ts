import type {
  Node,
  ReadonlySourceFactResolver,
} from "@tsonic/tsts";
import type {
  SourceProgramNavigation,
} from "@tsonic/target-api";
import type {
  CsharpProviderRelationResolver,
} from "../../provider/target-relations/resolver.js";
import type {
  CsharpProviderTargetRelation,
} from "../../provider/target-relations/index.js";
import {
  resolveCsharpProviderDeclarationEvidence,
} from "../../provider/target-relations/evidence.js";

type CsharpProviderValueRelation = Extract<
  CsharpProviderTargetRelation,
  { readonly kind: "value" }
>;

export interface CsharpProviderValueSelectionHost {
  readonly sourceFacts?: ReadonlySourceFactResolver;
  readonly navigation: SourceProgramNavigation;
  readonly providers: CsharpProviderRelationResolver;
}

export type CsharpProviderValueSelection =
  | {
      readonly kind: "resolved";
      readonly relation: CsharpProviderValueRelation;
    }
  | {
      readonly kind: "not-provider";
    }
  | {
      readonly kind: "missing" | "conflict" | "ambiguous";
      readonly reason: string;
    };

export function selectCsharpProviderValue(
  host: CsharpProviderValueSelectionHost,
  node: Node,
): CsharpProviderValueSelection {
  const reference = host.navigation.referenceFor(node);
  const declaration = resolveCsharpProviderDeclarationEvidence(
    host.sourceFacts,
    [
      reference?.declaration,
      reference?.symbol,
      node,
    ],
    "export",
  );
  if (declaration.kind === "missing") {
    return { kind: "not-provider" };
  }
  if (declaration.kind === "conflict") {
    return { kind: "conflict", reason: declaration.reason };
  }
  const resolution = host.providers.resolveValue(declaration.declaration);
  if (resolution.kind === "missing") {
    return { kind: "missing", reason: resolution.reason };
  }
  if (resolution.kind === "rejected") {
    return { kind: "missing", reason: resolution.diagnostic.message };
  }
  const relations = resolution.relations.filter(
    (relation): relation is CsharpProviderValueRelation =>
      relation.kind === "value",
  );
  if (relations.length === 1) {
    return { kind: "resolved", relation: relations[0]! };
  }
  if (relations.length === 0) {
    return {
      kind: "missing",
      reason: "The selected provider value has no C# target relation.",
    };
  }
  return {
    kind: "ambiguous",
    reason:
      "The selected provider value has more than one C# target relation.",
  };
}
