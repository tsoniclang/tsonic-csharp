import {
  HasSyntacticModifier,
  ModifierFlagsAsync,
} from "@tsonic/target-api/source";
import type { AstReader, Node } from "@tsonic/tsts";
import type { CsharpNamePlan, CsharpNativeMemberIdentity } from "../../../target-model/names/model.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import type { CsharpObjectShapeFact } from "../../../target-model/types/model.js";
import { objectShapeArtifactKey } from "../../../target-model/records/object-shape-demand.js";

export function planCsharpNativeMemberHiding(
  names: Pick<CsharpNamePlan, "memberHiding">,
  subject: CsharpNativeMemberIdentity,
): readonly "new"[] {
  const hides = names.memberHiding.get(subject);
  if (hides === undefined) return failCsharpPlannerInvariant(
    "An admitted native member lost its final physical-container hiding decision.",
    subject.kind === "source" ? subject.declaration : subject.kind === "value" ? subject.container : undefined);
  return hides ? ["new"] : [];
}

export function planCsharpAdmittedMemberName(names: Pick<CsharpNamePlan, "resolve">, node: Node | undefined): string {
  const selected = names.resolve(node);
  if (selected.kind !== "resolved") return failCsharpPlannerInvariant(
    "An admitted native member lost its final representable name.", node);
  return selected.name;
}

export function planCsharpArtifactMemberHiding(names: Pick<CsharpNamePlan, "memberHiding">,
  shape: CsharpObjectShapeFact, name: string): readonly "new"[] {
  return planCsharpNativeMemberHiding(names,
    { kind: "artifact", container: objectShapeArtifactKey(shape), member: name, role: "member" });
}

export function isAsyncNode(
  ast: AstReader,
  node: Node,
): boolean {
  return HasSyntacticModifier(ast, node, ModifierFlagsAsync);
}
