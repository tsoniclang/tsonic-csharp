import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpProjectMemberTypeInstantiation, CsharpProjectTypeDeclaration } from "../../../target-model/records/types/project-types.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { csharpNullableTargetType } from "../../../target-model/types/carriers/nullable.js";
import type { CsharpTypeResolutionState } from "../../source-evidence/types/resolution/model.js";
import type { CsharpSourceTypeDependency } from "../../source-evidence/types/resolution/selected-values.js";
import { nextState } from "../../source-evidence/types/resolution/state.js";
import type { CsharpInheritedObjectShapeMemberSource } from "./member-source.js";
import { bindCsharpCallableSignatureCapture, type CsharpCallableSignatureInput } from "../../source-evidence/types/resolution/callable-signature-completion.js";

export interface CsharpInheritedMemberTypeInput {
  readonly declarations: readonly CsharpInheritedObjectShapeMemberSource[];
  readonly receiver: TargetTypeRef | undefined;
  readonly receiverDefinition: CsharpProjectTypeDeclaration | undefined;
  readonly state: CsharpTypeResolutionState;
  readonly method: boolean;
  readonly optional: boolean;
}

export type CsharpInheritedMemberTypeRequest = {
  readonly input: CsharpInheritedMemberTypeInput;
  readonly source: CsharpInheritedObjectShapeMemberSource;
} & (
  | { readonly kind: "declaration"; readonly dependency:
      Extract<CsharpSourceTypeDependency, { readonly kind: "node" }> |
      { readonly kind: "method"; readonly signature: CsharpCallableSignatureInput | undefined } }
  | { readonly kind: "instantiation"; readonly declared: TargetTypeRef; readonly carrier: TargetTypeRef;
      readonly receiver: TargetTypeRef }
);

export type CsharpCompletedInheritedMemberTypeRequest = {
  readonly request: CsharpInheritedMemberTypeRequest;
} & (
  | { readonly kind: "declaration"; readonly type: TargetTypeRef | undefined }
  | { readonly kind: "instantiation"; readonly result: CsharpProjectMemberTypeInstantiation }
);

export function* completeCsharpInheritedMemberTypeSource(
  input: CsharpInheritedMemberTypeInput,
): Generator<CsharpInheritedMemberTypeRequest, CsharpProjectMemberTypeInstantiation,
  CsharpCompletedInheritedMemberTypeRequest> {
  const { receiver, receiverDefinition } = input;
  if (receiver === undefined || receiverDefinition === undefined) return { kind: "not-project-member" };
  if (receiver.kind !== "target-named" || receiver.id !== receiverDefinition.id ||
    Array.from(input.declarations).some(source => source === undefined)) return failTargetAnalysisInvariant("tsonic-csharp",
      "Inherited member completion requires its exact receiver and dense declaration vector.");
  const inherited = input.declarations.filter(source => source.owner.id !== receiverDefinition.id);
  if (inherited.length === 0) return { kind: "not-project-member" };
  const selected: TargetTypeRef[] = [];
  for (const source of inherited) {
    if (input.method && (!Object.prototype.hasOwnProperty.call(source, "methodSignature") ||
      !Object.prototype.hasOwnProperty.call(source, "methodCallable") ||
      !Object.prototype.hasOwnProperty.call(source, "methodCallableType") ||
      !Object.prototype.hasOwnProperty.call(source, "methodNullish") ||
      source.methodCallable !== undefined && (source.methodCallable.type !== source.methodCallableType ||
        source.methodCallable.queries.sourceFile !== source.owner.sourceFile) ||
      (source.methodCallable?.kind === "callable" ? source.methodSignature?.source !== source.methodCallable.signature
        : source.methodSignature !== undefined))) {
      return failTargetAnalysisInvariant("tsonic-csharp",
        "An inherited method requires its exact retained declaration signature.", source.declaration);
    }
    const state = nextState(input.state);
    const signature = !input.method || source.methodSignature === undefined ? undefined
      : bindCsharpCallableSignatureCapture(source.methodSignature, state);
    const dependency = input.method ? Object.freeze({ kind: "method" as const, signature })
      : Object.freeze({ kind: "node" as const, node: source.typeNode ?? source.declaration, sourceFile: source.owner.sourceFile, state });
    const declarationRequest = Object.freeze({ kind: "declaration" as const, input, source, dependency });
    const completed = yield declarationRequest;
    if (completed.request !== declarationRequest || completed.kind !== "declaration") {
      return failTargetAnalysisInvariant("tsonic-csharp", "Inherited member completion requires its exact authored carrier dependency.");
    }
    const declared = completed.type;
    if (declared === undefined) return { kind: "unresolved",
      reason: `Inherited project member of '${source.owner.sourceName}' has no exact authored native carrier.` };
    const carrier = input.optional ? csharpNullableTargetType(declared) : declared;
    const instantiationRequest = Object.freeze({ kind: "instantiation" as const, input, source, declared, carrier,
      receiver });
    const instantiated = yield instantiationRequest;
    if (instantiated.request !== instantiationRequest || instantiated.kind !== "instantiation") {
      return failTargetAnalysisInvariant("tsonic-csharp", "Inherited member completion requires its exact declared ABI dependency.");
    }
    const result = instantiated.result;
    if (result.kind !== "resolved") return result.kind === "unresolved" ? result : { kind: "unresolved",
      reason: `Inherited project member of '${source.owner.sourceName}' lost its canonical project declaration.` };
    selected.push(result.type);
  }
  const first = selected[0]!;
  return selected.every(type => targetTypeRefEquals(first, type)) ? { kind: "resolved", type: first }
    : { kind: "unresolved", reason: "Inherited project member declarations have incompatible native carrier instantiations." };
}
