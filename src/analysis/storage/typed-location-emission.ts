import type { Node } from "@tsonic/tsts";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant, type TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpStorageClassifications } from "../../target-model/records/storage/storage.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations/operations.js";
import type { CsharpObjectMemberRecords } from "../../target-model/records/objects/object-members.js";
import type { CsharpTypedLocationStorage } from "../../target-model/records/storage/typed-location-storage.js";
import type { CsharpTypedLocationEmission, CsharpTypedStorageEmission } from "../../target-model/records/storage/typed-location-emission.js";
import type { CsharpTypedLocationOperationKind } from "../../target-model/records/storage/typed-locations.js";
import { csharpRuntimeLocationTargetType } from "../../target-model/types/carriers/runtime-carriers.js";
import { objectShapeBoundStorageMemberName } from "../../target-model/names/object-members.js";
import { selectCsharpTypeEmission } from "../../policy/types/resolution/type-emission.js";
import { createCsharpTypedLocationEmissionRecords } from "../program/records/storage/typed-location-emission.js";
import { csharpTypedLocationLoweringRefusal } from "../operations/typed-locations.js";

export function analyzeCsharpTypedLocationEmission(input: { readonly source: TargetSourceProgram; readonly nodes: readonly Node[];
  readonly storage: CsharpStorageClassifications; readonly operations: CsharpTargetOperationClassifications;
  readonly members: CsharpObjectMemberRecords; readonly admitted: (node: Node) => boolean }) {
  const locations = new Map<Node, CsharpTypedLocationEmission>();
  const storage = new Map<CsharpTypedLocationStorage, CsharpTypedStorageEmission>();
  const issues: TargetDiagnostic[] = [];
  const carriers: TargetTypeRef[] = [];
  const refuse = (node: Node, message: string): void => { issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: node, message }); };
  const locationIssue = (node: Node, kind: CsharpTypedLocationOperationKind, reason: string): void =>
    refuse(node, csharpTypedLocationLoweringRefusal(kind, reason));
  const admitStorage = (subject: CsharpTypedLocationStorage): void => {
    if (storage.has(subject)) return;
    const carrier = csharpRuntimeLocationTargetType(subject.valueType);
    carriers.push(carrier, subject.valueType);
    if (!selectCsharpTypeEmission({ carrier })) locationIssue(subject.expression, "location-address", "The selected C# value-property location types are not renderable.");
    const source = input.operations.sourceMember.get(subject.expression);
    const shape = source?.objectShape;
    const member = source?.shapeMember?.kind === "resolved" ? source.shapeMember.member : undefined;
    const native = shape === undefined || member === undefined ? undefined : input.storage.nativeField.get(shape.targetType, member.targetName);
    const boundCarrier = shape === undefined || member?.bound !== true ? undefined : input.members.objectMember.get(shape, member)?.boundStorage;
    if (shape !== undefined && member?.bound === true && boundCarrier === undefined)
      failTargetAnalysisInvariant("tsonic-csharp", "An admitted bound field requires its exact native location storage.", subject.expression);
    const bound = shape === undefined || member === undefined || boundCarrier === undefined ? undefined
      : Object.freeze({ name: objectShapeBoundStorageMemberName(shape, member), carrier: boundCarrier });
    if (boundCarrier !== undefined) carriers.push(boundCarrier);
    const address: CsharpTypedStorageEmission["address"] = input.storage.nativeArray.get(subject.expression)?.kind === "element" ? { kind: "native-array" }
      : subject.kind === "reference-property-storage" && native !== undefined ? { kind: "native-field", name: native.storageName }
      : subject.kind === "direct-storage" && subject.identity.kind === "local-storage" && input.storage.nativeBacking.get(subject.identity.declaration) !== undefined
        ? { kind: "native-local" } : { kind: "managed" };
    storage.set(subject, Object.freeze({ carrier, bound, address: Object.freeze(address) }));
    if (subject.kind === "value-property-storage") admitStorage(subject.receiverStorage);
  };
  for (const node of input.nodes) {
    if (!input.admitted(node)) continue;
    const projected = input.operations.sourceMember.get(node)?.projectedWrite;
    if (projected?.kind === "rejected") refuse(node, projected.reason);
    else if (projected?.kind === "resolved") admitStorage(projected.storage);
    const handler = input.operations.nativeHandler.get(node);
    if (handler?.kind !== "typed-location") continue;
    const selection = handler.selection;
    if (selection.kind === "rejected") { locationIssue(node, selection.operation, selection.reason); continue; }
    const types = [selection.pointeeType, selection.locationType,
      ...(selection.kind === "location-hash" || selection.kind === "location-equal" ? [selection.parameterType] : []),
      ...(selection.kind === "location-bind" || selection.kind === "location-view" || selection.kind === "location-project"
        ? [...selection.typeArguments, ...selection.arguments.map(argument => argument.type)] : [])];
    carriers.push(...types);
    if (types.some(carrier => !selectCsharpTypeEmission({ carrier }))) { locationIssue(node, selection.kind, "The selected C# typed-location operation is not renderable."); continue; }
    if (selection.kind === "location-address") admitStorage(selection.storage);
    const suspends = selection.kind === "location-store" && input.source.navigation.expressionEffects(selection.valueExpression).suspends;
    const address = selection.kind === "location-store" && selection.location.kind === "native-ref-return"
      ? input.storage.nativeLocation.get(selection.location.expression) : undefined;
    if (selection.kind === "location-store" && selection.location.kind === "native-ref-return") {
      if (address?.kind !== "resolved" || !address.writable || address.address?.passing !== "byref-readwrite") {
        locationIssue(node, selection.kind, address?.kind === "rejected" ? address.reason : "A native ref-return store requires its sealed writable managed address."); continue;
      }
      if (suspends) { refuse(node, "An opaque native ref-return address cannot be held across asynchronous suspension."); continue; }
    }
    locations.set(node, Object.freeze({ selection, suspends, storeAddress: address?.kind === "resolved" ? address : undefined }));
  }
  return Object.freeze({ records: createCsharpTypedLocationEmissionRecords(locations, storage), carriers: Object.freeze(carriers), issues: Object.freeze(issues) });
}
