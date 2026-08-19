import type {
  Node,
  ResolvedSourceResourceManagementInfo,
  SourceFile,
} from "@tsonic/tsts";
import type {
  CsharpPolicyContext,
} from "../../context.js";
import type {
  TargetTypeRef,
} from "../../types/index.js";
import {
  getCsharpRuntimeUnionArms,
  getCsharpNullableElementTargetType,
  isCsharpRuntimeNullTargetType,
  isCsharpRuntimeUndefinedTargetType,
  targetTypeRefEquals,
} from "../../types/index.js";
import type {
  CsharpOperationSelection,
} from "../selection/index.js";

export interface CsharpResolvedResourceManagement {
  readonly kind: "resolved";
  readonly source: ResolvedSourceResourceManagementInfo;
  readonly registration:
    | {
        readonly kind: "direct";
        readonly resourceType: TargetTypeRef;
        readonly disposal: CsharpResourceDisposalOperation;
      }
    | {
        readonly kind: "runtime-union";
        readonly resourceType: TargetTypeRef;
        readonly arms: readonly CsharpResourceDisposalArm[];
      };
}

export interface CsharpResourceDisposalOperation {
  readonly kind: "sync" | "async";
  readonly targetName: "Dispose" | "DisposeAsync";
}

export interface CsharpResourceDisposalArm {
  readonly armIndex: number;
  readonly targetType: TargetTypeRef;
  readonly disposal: CsharpResourceDisposalOperation;
}

export function selectCsharpResourceManagement(
  input: CsharpPolicyContext,
  declaration: Node,
  sourceFile: SourceFile,
): CsharpOperationSelection<CsharpResolvedResourceManagement> {
  const source = input.semantics(sourceFile)
    .getResolvedResourceManagementInfo(declaration);
  if (source === undefined) {
    return rejected(
      "TSTS did not retain exact checked resource-management evidence for this declaration.",
    );
  }
  if (source.disposal.kind !== "selected") {
    return rejected(
      "Untyped dynamic resource disposal has no closed C# target operation.",
    );
  }
  const storageType = input.types.resolveStorage(declaration, sourceFile);
  if (storageType === undefined) {
    return rejected(
      "The exact selected resource has no closed C# storage and disposal carrier.",
    );
  }
  const alternatives = source.disposal.alternatives.map((alternative) => {
    const targetType = input.types.resolveType(alternative.sourceType, sourceFile);
    const disposal = resolveDisposalOperation(alternative.kind);
    return targetType === undefined
      ? undefined
      : { targetType, disposal };
  });
  if (alternatives.some((alternative) => alternative === undefined)) {
    return rejected(
      "An exact selected resource alternative has no closed C# disposal operation.",
    );
  }
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
  const storageArms = getCsharpRuntimeUnionArms(storageType);
  if (storageArms === undefined) {
    return rejected(
      "Multiple selected resource alternatives require one exact C# runtime-union storage carrier.",
    );
  }
  const disposableArmIndexes = storageArms.flatMap((arm, armIndex) =>
    isCsharpRuntimeNullTargetType(arm) || isCsharpRuntimeUndefinedTargetType(arm)
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

function resolveDisposalOperation(
  sourceKind: "sync" | "async",
): CsharpResourceDisposalOperation {
  return sourceKind === "sync"
    ? { kind: "sync", targetName: "Dispose" }
    : { kind: "async", targetName: "DisposeAsync" };
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
