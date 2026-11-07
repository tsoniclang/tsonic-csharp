// Reads of published Source facts (SourceProgramFacts) for C# consumers (nextgen C-2542, R2, I4).
//
// Every Host refusal is forwarded unchanged before any C# analysis runs (analyzeCsharpAnalysisProgram), so a C#
// consumer never meets a refused Source outcome: reaching one, or meeting no fact for a supported form, is a Host
// producer defect and fails as an analysis invariant. These readers never fall back and never ask the checker.
import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant, type TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  SourceCallSelection,
  SourceDeclarationTarget,
  SourceInstantiation,
  SourceIterationSelection,
  SourceMemberAccessSelection,
  SourceProgramFacts,
  SourceRefusal,
  SourceResourceSelection,
  SourceTypeDescriptor,
  SourceTypeFlowRefusal,
  SourceUnionRelation,
} from "@tsonic/target-api/source";

type Refused = { readonly kind: "refused" };
type Admitted<T> = Exclude<T, Refused>;

function refusedInvariant(subject: string, site: Node): never {
  return failTargetAnalysisInvariant("tsonic-csharp",
    `${subject} is a Host refusal at a node C# analyzed; Host refusals are forwarded before C# analysis.`, site);
}

function missingInvariant(subject: string, site: Node): never {
  return failTargetAnalysisInvariant("tsonic-csharp", `The Host published no ${subject} for a supported form.`, site);
}

/** The project declaration a reference denotes (identity.target with project membership); undefined otherwise. */
export function sourceProjectTarget(facts: SourceProgramFacts, reference: Node | undefined): SourceDeclarationTarget | undefined {
  const target = reference === undefined ? undefined : facts.navigation.identity.target(reference);
  return target?.project === true ? target : undefined;
}

/** The declaration of sourceProjectTarget. */
export function sourceProjectDeclaration(facts: SourceProgramFacts, reference: Node | undefined): Node | undefined {
  return sourceProjectTarget(facts, reference)?.declaration;
}

/** The published value type of a value node (values.type). */
export function sourceValueType(facts: SourceProgramFacts, node: Node): SourceTypeDescriptor {
  const outcome = facts.values.type(node);
  return outcome.kind === "refused" ? refusedInvariant("The value type", node) : outcome.type;
}

/** The published declared or inferred slot type of a declaration, parameter, field or element binding (values.slot). */
export function sourceSlot(facts: SourceProgramFacts, slot: Node): Admitted<ReturnType<SourceProgramFacts["values"]["slot"]>> {
  const outcome = facts.values.slot(slot);
  return outcome.kind === "refused" ? refusedInvariant("The slot type", slot) : outcome;
}

/** The selected callee of a call, `new`, tagged template or super call (selections.call). */
export function sourceCallSelection(facts: SourceProgramFacts, use: Node): SourceCallSelection {
  const selected = facts.selections.call(use);
  if (selected === undefined) return missingInvariant("call selection", use);
  return "code" in selected ? refusedInvariant("The call selection", use) : selected;
}

/** The selected member of a property access (selections.memberAccess). */
export function sourceMemberAccess(facts: SourceProgramFacts, use: Node): SourceMemberAccessSelection {
  return facts.selections.memberAccess(use) ?? missingInvariant("member access selection", use);
}

/**
 * The iteration protocol of a for-of, spread, destructuring or yield* (selections.iteration). A for-await without one
 * protocol ("unresolved-protocol") is refused by the loop selection (operations/iteration/selection.ts) before this read.
 */
export function sourceIteration(facts: SourceProgramFacts, statement: Node): SourceIterationSelection {
  const selected = facts.selections.iteration(statement);
  if (selected === undefined) return missingInvariant("iteration selection", statement);
  if ("kind" in selected && selected.kind === "unresolved-protocol") return failTargetAnalysisInvariant("tsonic-csharp",
    "An unresolved for-await iteration protocol reached a protocol read; the loop selection refuses it first.", statement);
  return "code" in selected ? refusedInvariant("The iteration selection", statement) : selected;
}

/** The resource selection of a `using` / `await using` declaration (selections.resource); undefined for any other. */
export function sourceResourceSelection(facts: SourceProgramFacts, declaration: Node): SourceResourceSelection | undefined {
  const selected = facts.selections.resource(declaration);
  return selected !== undefined && "code" in selected ? refusedInvariant("The resource selection", declaration) : selected;
}

/** The per-use instantiation of a generic use; undefined when neither receiver nor signature has binders. */
export function sourceInstantiation(facts: SourceProgramFacts, use: Node): Admitted<SourceInstantiation> | undefined {
  const instantiation = facts.instantiations.at(use);
  return instantiation?.kind === "refused" ? refusedInvariant("The instantiation", use) : instantiation;
}

/** The union relation at a use whose source or destination is a closed sum; undefined when neither side is a sum. */
export function sourceUnionRelation(facts: SourceProgramFacts, use: Node): Admitted<SourceUnionRelation> | undefined {
  const relation = facts.relations.at(use);
  return relation?.kind === "refused" ? refusedInvariant("The union relation", use) : relation;
}

/**
 * The interface re-expresses a JS array: its representation base (analyses.interfaceRepresentationBase: the single
 * `extends` edge of an interface whose type is identical to that base) is a JS array or readonly array by the JS
 * profile collection fact of the published base descriptor (SourceHeritageEdge.type). The one reader for this question
 * (declarations/type-only.ts, project-types/type-policy.ts); baseline `isArrayLike(selectedType)` (no typed arrays).
 */
export function sourceInterfaceRepresentsJsArray(facts: SourceProgramFacts, declaration: Node): boolean {
  const base = facts.analyses.interfaceRepresentationBase(declaration);
  const collection = base === undefined ? undefined : facts.profile.collection(base.type)?.kind;
  return collection === "array" || collection === "readonly-array";
}

/** A Host refusal forwarded unchanged (R5): code, message and site. C# never rewrites or re-codes it. */
export function forwardSourceRefusal(refusal: SourceRefusal | SourceTypeFlowRefusal): TargetDiagnostic {
  return Object.freeze({
    code: refusal.code,
    category: "error" as const,
    source: "tsonic",
    message: "message" in refusal ? refusal.message : refusal.reason,
    sourceNode: refusal.site,
  });
}
