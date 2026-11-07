// Reads of published Source facts (SourceProgramFacts) for C# consumers (nextgen C-2542, R2, I4).
//
// Every Host refusal is forwarded unchanged before any C# analysis runs (analyzeCsharpAnalysisProgram), so a C#
// consumer never meets a refused Source outcome: reaching one, or meeting no fact for a supported form, is a Host
// producer defect and fails as an analysis invariant. These readers never fall back and never ask the checker.
import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant, type TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  SourceCallSelection,
  SourceClosedSum,
  SourceDeclarationTarget,
  SourceInstantiation,
  SourceIterationSelection,
  SourceMemberAccessSelection,
  SourceProgramFacts,
  SourceRefusal,
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

/** The published return type of a callable declaration (values.callableReturn). */
export function sourceCallableReturn(facts: SourceProgramFacts, declaration: Node): SourceTypeDescriptor {
  const outcome = facts.values.callableReturn(declaration);
  return outcome.kind === "refused" ? refusedInvariant("The callable return", declaration) : outcome.type;
}

/** The published result of `await e` or of an awaited callable result (values.awaited). */
export function sourceAwaitedType(facts: SourceProgramFacts, node: Node): SourceTypeDescriptor {
  const outcome = facts.values.awaited(node);
  return outcome.kind === "refused" ? refusedInvariant("The awaited type", node) : outcome.type;
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

/** The iteration protocol of a for-of, spread, destructuring or yield* (selections.iteration). */
export function sourceIteration(facts: SourceProgramFacts, statement: Node): SourceIterationSelection {
  const selected = facts.selections.iteration(statement);
  if (selected === undefined) return missingInvariant("iteration selection", statement);
  return "code" in selected ? refusedInvariant("The iteration selection", statement) : selected;
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

/** The closed sum a union descriptor denotes; undefined only for a non-union descriptor. */
export function sourceSumOf(facts: SourceProgramFacts, descriptor: SourceTypeDescriptor): SourceClosedSum | undefined {
  return facts.sums.sumOf(descriptor);
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
