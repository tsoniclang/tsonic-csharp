import type { CsharpResolvedResourceManagement, CsharpResourceDisposalOperation } from "../../../target-model/records/management.js";

import type { TargetTypeRef } from "../../types/index.js";
import { getCsharpRuntimeUnionArms, getCsharpNullableElementTargetType, isCsharpAbsenceTargetType, targetTypeRefEquals } from "../../types/index.js";
import type { CsharpOperationSelection } from "../../../target-model/records/operator-selection.js";

import type { ResolvedSourceResourceManagementInfo } from "@tsonic/tsts";
import type { CsharpTypeDefinitions } from "../../../target-model/types/source-union-definitions.js";

export function selectCsharpNativeResourceManagement(
  source: ResolvedSourceResourceManagementInfo,
  storageType: TargetTypeRef,
  alternatives: readonly { readonly targetType: TargetTypeRef; readonly disposal: CsharpResourceDisposalOperation }[],
  definitions: CsharpTypeDefinitions | undefined,
): CsharpOperationSelection<CsharpResolvedResourceManagement> {
  const canonical = canonicalDisposalAlternatives(
    alternatives as readonly {
      readonly targetType: TargetTypeRef;
      readonly disposal: CsharpResourceDisposalOperation;
    }[],
  );
  if (canonical === undefined) {
    return rejected(
      "Source resource alternatives that share one C# carrier must select one identical disposal operation.",
    );
  }
  const directResourceType = getCsharpNullableElementTargetType(storageType) ??
    storageType;
  if (
    canonical.length === 1 &&
    targetTypeRefEquals(canonical[0]!.targetType, directResourceType)
  ) {
    return {
      kind: "resolved",
      source,
      registration: {
        kind: "direct",
        resourceType: canonical[0]!.targetType,
        disposal: canonical[0]!.disposal,
      },
    };
  }
  const storageArms = getCsharpRuntimeUnionArms(directResourceType, definitions);
  if (storageArms === undefined) {
    return rejected(
      "Multiple selected resource alternatives require one exact C# runtime-union storage carrier.",
    );
  }
  const disposableArmIndexes = storageArms.flatMap((arm, armIndex) =>
    isCsharpAbsenceTargetType(arm)
      ? []
      : [armIndex]);
  const arms = canonical.flatMap((alternative) => {
    const armIndex = storageArms.findIndex((arm) =>
      targetTypeRefEquals(arm, alternative.targetType));
    return armIndex < 0
      ? []
      : [{
          armIndex,
          targetType: alternative.targetType,
          disposal: alternative.disposal,
        }];
  });
  if (
    arms.length !== canonical.length ||
    arms.length !== disposableArmIndexes.length ||
    disposableArmIndexes.some((armIndex) =>
      !arms.some((arm) => arm.armIndex === armIndex))
  ) {
    return rejected(
      "The exact selected resource alternatives do not cover every non-nullish C# runtime-union arm.",
    );
  }
  return {
    kind: "resolved",
    source,
    registration: {
      kind: "runtime-union",
      resourceType: storageType,
      arms: Object.freeze([...arms].sort((left, right) =>
        left.armIndex - right.armIndex)),
    },
  };
}

function canonicalDisposalAlternatives(
  alternatives: readonly {
    readonly targetType: TargetTypeRef;
    readonly disposal: CsharpResourceDisposalOperation;
  }[],
): readonly {
  readonly targetType: TargetTypeRef;
  readonly disposal: CsharpResourceDisposalOperation;
}[] | undefined {
  const canonical: {
    readonly targetType: TargetTypeRef;
    readonly disposal: CsharpResourceDisposalOperation;
  }[] = [];
  for (const alternative of alternatives) {
    const existing = canonical.find((candidate) =>
      targetTypeRefEquals(candidate.targetType, alternative.targetType));
    if (existing === undefined) {
      canonical.push(alternative);
      continue;
    }
    if (
      existing.disposal.kind !== alternative.disposal.kind ||
      existing.disposal.targetName !== alternative.disposal.targetName
    ) {
      return undefined;
    }
  }
  return canonical;
}

function rejected(
  reason: string,
): Extract<CsharpOperationSelection<never>, { readonly kind: "rejected" }> {
  return { kind: "rejected", reason };
}
