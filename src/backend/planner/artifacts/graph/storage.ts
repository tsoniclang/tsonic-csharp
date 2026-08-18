import type { CsharpArtifactGraphScope } from "./engine.js";
import type { CsharpArtifactRequestResult } from "./model.js";
import type { CsharpStorageRequirement, CsharpStorageTypeResult } from "../storage-requirements.js";
import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../../policy/types/index.js";
export function requireStorage(
  { dependOn, storage }: CsharpArtifactGraphScope,
  storageExpression: Node,
  requirement: CsharpStorageRequirement,
): CsharpArtifactRequestResult {
  const result = storage.require(storageExpression, requirement);
  if (result.kind === "accepted") {
    const owner = storage.contractOwner(storageExpression);
    if (owner !== undefined) {
      dependOn(owner, "storage-representation");
    }
  }
  return result;
}


export function resolveStorageType(
  { dependOn, storage }: CsharpArtifactGraphScope,
  declaration: Node,
  sourceType: TargetTypeRef,
): CsharpStorageTypeResult {
  const result = storage.resolve(declaration, sourceType);
  const owner = storage.contractOwner(declaration);
  if (owner !== undefined) {
    dependOn(owner, "storage-representation");
  }
  return result;
}


export function requiredStorageType(
  { dependOn, storage }: CsharpArtifactGraphScope,
  storageExpression: Node,
): TargetTypeRef | undefined {
  const owner = storage.contractOwner(storageExpression);
  if (owner !== undefined) {
    dependOn(owner, "storage-representation");
  }
  return storage.requiredType(storageExpression);
}


export function consumeTypedLocationIdentity(
  { dependOn, storage }: CsharpArtifactGraphScope,
declaration: Node): boolean {
  const owner = storage.contractOwner(declaration);
  if (owner !== undefined) {
    dependOn(owner, "storage-representation");
  }
  return storage.consumeTypedLocationIdentity(declaration);
}
