import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpNodeQuerySource } from "./root-sources.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpCompletedCallableSignature } from "./callable-signature-completion.js";
import { resolveFormedCsharpCallableDeclarationSignature } from "./source-profiles.js";
import { csharpDeclaredMemberComponents } from "./declared-receiver-body.js";

export type CsharpDeclaredCallableBody = { readonly source: CsharpNodeQuerySource } & (
  | { readonly kind: "not-declared-callable" }
  | { readonly kind: "callable"; readonly signature: CsharpCompletedCallableSignature;
      readonly components: readonly TargetTypeRef[] }
);

export function resolveFormedCsharpDeclaredCallableBody(
  scope: CsharpTypeResolutionScope,
  source: CsharpNodeQuerySource,
): CsharpDeclaredCallableBody {
  const root = source.root;
  if (root.node !== source.node || root.sourceFile !== source.sourceFile) return failTargetAnalysisInvariant("tsonic-csharp",
    "A callable body requires its exact retained node-query source.", source.node);
  const semantic = root.kind === "node" ? root.semantic : undefined;
  const callable = semantic?.kind === "type" ? semantic.callable : undefined;
  if (callable?.kind !== "callable" || callable.signature.source.declaration?.declaration !== source.node) {
    return Object.freeze({ kind: "not-declared-callable", source });
  }
  if (callable.state !== semantic!.state || callable.signature.state !== callable.state ||
    callable.signature.source.queries !== callable.source.queries) return failTargetAnalysisInvariant("tsonic-csharp",
      "A callable body requires its original declared signature and bound child state.", source.node);
  const signature = resolveFormedCsharpCallableDeclarationSignature(scope, callable.signature);
  if (signature === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
    "The callable's declared body signature could not complete before its physical ABI.", source.node);
  return Object.freeze({ kind: "callable", source, signature,
    components: csharpDeclaredMemberComponents([Object.freeze({ type: signature.signature,
      typeParameters: signature.declaration.typeParameters })], scope.host.typeParameterConstraints),
  });
}
