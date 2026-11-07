// Closed Host sums -> CLR carriers (R6, A11, C-2459). Arms stay in the Host arm order: no sort, no flattening. Arms
// whose .NET carriers are equal share one storage arm and keep their own roles (Q73 coincident roles); every Host arm
// is placed through csharpSourceSumStorage, never chosen by carrier. Absence arms are lifted to Nullable<T> /
// reference T?. A sum with open arms (free type parameters) is the same generic runtime union over its arms
// (`string | T` -> Union<string, T>), substituted per instantiation (Q91, baseline capability); inside the generic body
// the union struct's own members serve it, with no constraint.
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { SourceClosedSum, SourceKeyCategory, SourceTypeDescriptor } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../target-model/types/model.js";
import { csharpAbsenceTargetType, csharpSourceSumStorage, csharpSourceSumTargetType } from "../target-model/types/carriers/runtime-carriers.js";
import { csharpNullableTargetType } from "../target-model/types/carriers/nullable.js";
import { csharpRefusal, isCsharpRefusal, type CsharpRepresentation, type CsharpRepresentationContext } from "./context.js";

export type RepresentDescriptor = (descriptor: SourceTypeDescriptor) => CsharpRepresentation;

const maximumUnionArity = 8;

function isAbsenceArm(type: SourceTypeDescriptor): boolean {
  return type.kind === "intrinsic" && type.intrinsic === "absence";
}

/**
 * OI-LT / E3: a sum record is represented only under the exact program view that published it. The record must be the
 * immutable record this view returns for its own identity; a record from another view (same AST, same-shaped family or
 * forged) is never relabelled as this view's. Identity is the record object, not its family, arms, names or ordinals.
 */
function authenticateSum(sum: SourceClosedSum, context: CsharpRepresentationContext): void {
  // No probe by catching (C2-D1): a foreign identity throws inside the Host's own query, and that invariant propagates.
  if (context.facts.sums.sum(sum.identity) !== sum) failTargetAnalysisInvariant("tsonic-csharp",
    "A closed sum record is represented only under the program view that published it (E3, OI-LT).", context.occurrence);
}

function assertSealedSum(sum: SourceClosedSum, site: CsharpRepresentationContext["occurrence"]): void {
  if (sum.arms.length === 0) failTargetAnalysisInvariant("tsonic-csharp", "A Host closed sum must have at least one arm.", site);
  for (const arm of sum.arms) {
    // A11: a void arm is absence and the Host publishes it as absence. Nested sums are flattened by the Host builder.
    if (arm.type.kind === "union" || arm.type.kind === "optional" ||
      arm.type.kind === "intrinsic" && arm.type.intrinsic === "void") failTargetAnalysisInvariant("tsonic-csharp",
      "A Host closed sum arm must be flattened and publish void as absence (A11).", site);
  }
  if (sum.arms.filter(arm => isAbsenceArm(arm.type)).length > 1) failTargetAnalysisInvariant("tsonic-csharp",
    "A Host closed sum has at most one absence arm.", site);
  for (const role of sum.roles) {
    if (sum.roles[role.role] !== role || role.arms.length === 0 ||
      role.arms.some(index => !Number.isInteger(index) || index < 0 || index >= sum.arms.length)) failTargetAnalysisInvariant(
      "tsonic-csharp", "A Host closed sum role must name existing arms by position.", site);
  }
}

/** The sum carrier: positional Union<...> over the present arms, Nullable/`?` when an absence arm exists. */
export function representClosedSum(sum: SourceClosedSum, context: CsharpRepresentationContext,
  represent: RepresentDescriptor, descriptor?: SourceTypeDescriptor): CsharpRepresentation {
  authenticateSum(sum, context);
  assertSealedSum(sum, context.occurrence);
  const absent = sum.arms.some(arm => isAbsenceArm(arm.type));
  const presentArms = sum.arms.filter(arm => !isAbsenceArm(arm.type));
  if (presentArms.length === 0) return csharpAbsenceTargetType();
  const present: TargetTypeRef[] = [];
  for (const arm of presentArms) {
    const selected = represent(arm.type);
    if (isCsharpRefusal(selected)) return selected;
    present.push(selected);
  }
  // Q86: the Host key category of each present arm (facts.profile.keyCategories of this sum's descriptor) travels on
  // the union carrier, so a collection key over a binder instantiated with this union reads the Host answer.
  const keyCategories = descriptor === undefined ? undefined : context.facts.profile.keyCategories(descriptor);
  const value = csharpSourceSumStorage(present).storage.length === 1 ? present[0]!
    : representPresentArms(present, context, keyCategories);
  if (isCsharpRefusal(value)) return value;
  return absent ? csharpNullableTargetType(value) : value;
}

function representPresentArms(present: readonly TargetTypeRef[], context: CsharpRepresentationContext,
  keyCategories: readonly SourceKeyCategory[] | undefined): CsharpRepresentation {
  // Q73: equal carriers are one storage arm; both Host arms and their roles stay (storage cardinality is separate
  // from role cardinality). Arity is the .NET storage arity.
  const layout = csharpSourceSumStorage(present);
  if (layout.storage.length > maximumUnionArity) return csharpRefusal("CSHARP_UNION_ARITY",
    `The union has ${layout.storage.length} distinct non-absent .NET arms; the C# runtime union carries at most ${maximumUnionArity}.`,
    context.occurrence);
  const union = csharpSourceSumTargetType(layout.storage, layout.slots, keyCategories);
  if (union === undefined) failTargetAnalysisInvariant("tsonic-csharp", "A 2..8-arm source sum must have a runtime union carrier.", context.occurrence);
  return union;
}
