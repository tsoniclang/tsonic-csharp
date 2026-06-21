import type { TargetTypeRef } from "@tsonic/tsts";

export function isProjectSourceTypeRef(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "target-specific" &&
    type.target === "csharp" &&
    type.name === "project-source-type";
}
