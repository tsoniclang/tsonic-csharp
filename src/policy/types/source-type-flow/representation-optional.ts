import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpOptionalStorageLayout } from "../../../target-model/types/projections.js";
import type { CsharpRepresentationOutcome, CsharpRepresentedTypeParameter } from "../../../target-model/types/representation.js";
import type { CsharpRepresentationHost } from "./representation-host.js";
import { selectCsharpOptionalStorage, selectCsharpOptionalStorageOperation } from "../storage/optional-storage.js";
import { represented, representationRequirements } from "./representation-results.js";
import { sourceRuntimeType } from "./representation-runtime.js";

export function representCsharpOptionalStorage(host: Pick<CsharpRepresentationHost, "providers">,
  payload: TargetTypeRef, site: Node): CsharpRepresentationOutcome<CsharpOptionalStorageLayout> {
  const layout = selectCsharpOptionalStorage(payload);
  let operations: TargetTypeRef;
  let requirement: CsharpRepresentedTypeParameter | undefined;
  if (layout.operations.kind === "type-parameter" && layout.operations.csharpProjection !== undefined) {
    const contract = sourceRuntimeType(host, "IOptionalStorage", [payload, layout.carrier], "interface", site);
    if (contract.kind !== "represented") return contract;
    requirement = Object.freeze({ ...layout.operations,
      csharpRequirementDependencies: Object.freeze([payload, layout.carrier]),
      csharpConstraints: Object.freeze({ kind: "resolved", constraints: Object.freeze([
        { kind: "keyword" as const, keyword: "struct" as const }, { kind: "type" as const, type: contract.value },
      ]) }),
    });
    operations = requirement;
  } else {
    const selected = selectCsharpOptionalStorageOperation(payload);
    const native = sourceRuntimeType(host, selected.name, selected.arguments, "struct", site);
    if (native.kind !== "represented") return native;
    operations = native.value;
  }
  const operationIdentity = layout.operations.kind === "type-parameter" ? layout.operations.identity : undefined;
  const requirements = layout.requirements.filter(value => value.identity !== operationIdentity);
  return represented(Object.freeze({ payload, carrier: layout.carrier, operations,
    requirements: representationRequirements([requirements, requirement === undefined ? [] : [requirement]]) }));
}
