import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpRepresentationOutcome, CsharpRepresentedType } from "../../target-model/types/representation.js";
import type { CsharpRepresentedMemberUse, CsharpRepresentedMemberUseArm,
  CsharpSourceRepresentationQueries } from "../../policy/model/type-resolution.js";

export function representCsharpMemberUse(host: CsharpSourceRepresentationQueries,
  occurrence: Node): CsharpRepresentationOutcome<CsharpRepresentedMemberUse> {
  const publication = host.facts.objects.use(occurrence);
  if (publication.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: publication });
  const source = publication.value;
  if (source.occurrence !== occurrence || source.arms.length === 0) failTargetAnalysisInvariant("tsonic-csharp",
    "A member use requires its exact original occurrence and complete receiver-arm vector.", occurrence);
  const receiver = host.representation.represent(source.receiver.value, "value", source.receiver.occurrence);
  if (receiver.kind !== "represented") return receiver;
  const arms: CsharpRepresentedMemberUseArm[] = [];
  for (const arm of source.arms) {
    const selectedReceiver = host.representation.represent(arm.receiver, "value", source.receiver.occurrence);
    if (selectedReceiver.kind !== "represented") return selectedReceiver;
    const members: CsharpRepresentedMemberUseArm["members"][number][] = [];
    if (arm.kind === "member") {
      for (const origin of [...arm.origins, ...arm.readOrigins, ...arm.writeOrigins]) {
        const selected = host.representation.member(arm.receiver, origin, "storage", occurrence);
        if (selected.kind !== "represented") return selected;
        members.push(Object.freeze({ origin, value: selected.value }));
      }
    }
    let key: CsharpRepresentedType | undefined;
    if (arm.kind === "index") {
      const selected = host.representation.represent(arm.key, "value", occurrence);
      if (selected.kind !== "represented") return selected;
      key = selected.value;
      const definition = arm.receiver.type.kind === "declared" ? host.representation.source.definition(arm.receiver)
        : Object.freeze({ kind: "resolved" as const, value: arm.receiver });
      if (definition.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: definition });
      const selectors = arm.selection.kind === "array-element" ? [{ kind: "array-element" } as const]
        : arm.selection.kind === "tuple-element" ? [{ kind: "tuple-element", index: arm.selection.index } as const]
        : arm.selection.kind === "index-signature" ? arm.selection.declarations.map(declaration => ({ kind: "index-value", declaration } as const))
        : [];
      if (arm.selection.kind === "index-signature" && selectors.length === 0) failTargetAnalysisInvariant("tsonic-csharp",
        "An index use requires every original index-signature declaration.", occurrence);
      for (const selector of selectors) {
        const child = host.representation.source.component(definition.value, selector);
        if (child.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: child });
        const value = host.representation.represent(child.value, "storage", occurrence);
        if (value.kind !== "represented") return value;
      }
    }
    let read: CsharpRepresentedType | undefined;
    if (arm.readType !== undefined) {
      const selected = host.representation.represent(arm.readType, "value", occurrence);
      if (selected.kind !== "represented") return selected;
      read = selected.value;
    }
    let write: CsharpRepresentedType | undefined;
    if (arm.writeType !== undefined) {
      const selected = host.representation.represent(arm.writeType, "storage", occurrence);
      if (selected.kind !== "represented") return selected;
      write = selected.value;
    }
    let destination: CsharpRepresentedType | undefined;
    if (arm.kind === "member" && arm.writeDestination !== undefined) {
      const selected = host.representation.represent(arm.writeDestination.applied, "storage", occurrence);
      if (selected.kind !== "represented") return selected;
      destination = selected.value;
    }
    if (arm.kind === "index") destination = write;
    if (arm.kind === "member" && (arm.readType !== undefined && arm.readOrigins.length === 0 ||
      arm.writeType !== undefined && (arm.writeOrigins.length === 0 || destination === undefined))) {
      failTargetAnalysisInvariant("tsonic-csharp", "A selected member read or write requires all exact original origins and its applied destination.", occurrence);
    }
    if (arm.kind === "index" && arm.readonly && write !== undefined) failTargetAnalysisInvariant("tsonic-csharp",
      "A readonly Source index cannot publish a writable Native destination.", occurrence);
    arms.push(Object.freeze({ source: arm, receiver: selectedReceiver.value, members: Object.freeze(members), read, write, destination, key }));
  }
  let read: CsharpRepresentedType | undefined;
  if (source.readType !== undefined) {
    const selected = host.representation.represent(source.readType, "value", occurrence);
    if (selected.kind !== "represented") return selected;
    read = selected.value;
  }
  let write: CsharpRepresentedType | undefined;
  if (source.writeType !== undefined) {
    const selected = host.representation.represent(source.writeType, "storage", occurrence);
    if (selected.kind !== "represented") return selected;
    write = selected.value;
  }
  return Object.freeze({ kind: "represented", value: Object.freeze({ source, receiver: receiver.value,
    arms: Object.freeze(arms), read, write }) });
}
