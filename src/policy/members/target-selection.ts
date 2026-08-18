import type {
  ExtensionDiagnostic,
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  SourceFileSemantics,
} from "@tsonic/target-api";
import type {
  CsharpTargetMember,
  TargetTypeRef,
} from "../types/index.js";
import type {
  CsharpTargetReceiverRelation,
} from "../../provider/target-relations/index.js";
import type {
  CsharpProviderCallSelectionHost,
} from "./call-selection.js";
import {
  selectCsharpProviderCall,
} from "./call-selection.js";
import {
  selectCsharpProviderElement,
} from "./element-selection.js";
import {
  selectCsharpProviderProperty,
} from "./property-selection.js";
import {
  selectCsharpProjectElement,
} from "./project-element-selection.js";
import {
  selectCsharpComposedSourceProfileCall,
  selectCsharpComposedSourceProfileElement,
  selectCsharpComposedSourceProfileProperty,
} from "./source-profile-selection.js";
import {
  selectCsharpSourceCoreFixedArrayElement,
  selectCsharpSourceCoreFixedArrayProperty,
} from "./source-core-fixed-array.js";
import type {
  CsharpSelectedTargetCall,
  CsharpTargetElementInvocation,
  ResolvedSourceCallInfo,
} from "./selection-types.js";

type ResolvedSourcePropertyAccessInfo = NonNullable<
  ReturnType<SourceFileSemantics["getResolvedPropertyAccessInfo"]>
>;
type ResolvedSourceElementAccessInfo = NonNullable<
  ReturnType<SourceFileSemantics["getResolvedElementAccessInfo"]>
>;

export type CsharpTargetCallSelection =
  | {
      readonly kind: "resolved";
      readonly source: ResolvedSourceCallInfo;
      readonly call: CsharpSelectedTargetCall;
    }
  | {
      readonly kind: "source-owned";
      readonly source: ResolvedSourceCallInfo;
      readonly reason: string;
    }
  | {
      readonly kind: "missing" | "conflict";
      readonly reason: string;
    }
  | {
      readonly kind: "ambiguous";
      readonly reason: string;
      readonly candidates: readonly string[];
    }
  | {
      readonly kind: "rejected";
      readonly diagnostic: ExtensionDiagnostic;
    };

export type CsharpTargetPropertySelection =
  | {
      readonly kind: "resolved";
      readonly source: ResolvedSourcePropertyAccessInfo;
      readonly targetMember: CsharpTargetMember;
      readonly receiver: CsharpTargetReceiverRelation;
      readonly origin: "provider" | "source-profile";
    }
  | {
      readonly kind: "source-owned";
      readonly source: ResolvedSourcePropertyAccessInfo;
      readonly reason: string;
    }
  | {
      readonly kind: "missing" | "conflict";
      readonly reason: string;
    }
  | {
      readonly kind: "ambiguous";
      readonly reason: string;
      readonly candidates: readonly string[];
    }
  | {
      readonly kind: "rejected";
      readonly diagnostic: ExtensionDiagnostic;
    };

export type CsharpTargetElementSelection =
  | {
      readonly kind: "resolved";
      readonly source: ResolvedSourceElementAccessInfo;
      readonly targetMember: CsharpTargetMember;
      readonly targetParameterIndex: number;
      readonly receiver: CsharpTargetReceiverRelation;
      readonly invocation: CsharpTargetElementInvocation;
      readonly origin: "provider" | "source-profile";
    }
  | {
      readonly kind: "project-indexer";
      readonly source: ResolvedSourceElementAccessInfo;
      readonly keyType: TargetTypeRef;
      readonly valueType: TargetTypeRef;
      readonly selectedReadType?: TargetTypeRef;
    }
  | {
      readonly kind: "source-owned";
      readonly source: ResolvedSourceElementAccessInfo;
      readonly reason: string;
    }
  | {
      readonly kind: "missing" | "conflict";
      readonly reason: string;
    }
  | {
      readonly kind: "ambiguous";
      readonly reason: string;
      readonly candidates: readonly string[];
    }
  | {
      readonly kind: "rejected";
      readonly diagnostic: ExtensionDiagnostic;
    };

export function selectCsharpTargetCall(
  host: CsharpProviderCallSelectionHost,
  call: Node,
  sourceFile: SourceFile,
): CsharpTargetCallSelection {
  const provider = selectCsharpProviderCall(host, call, sourceFile);
  if (provider.kind === "resolved") {
    return provider;
  }
  if (provider.kind !== "not-provider") {
    return provider;
  }
  const profile = selectCsharpComposedSourceProfileCall(
    host,
    provider.source,
    sourceFile,
  );
  if (profile === undefined) {
    return {
      kind: "source-owned",
      source: provider.source,
      reason: provider.reason,
    };
  }
  return profile.kind === "rejected"
    ? profile
    : {
        kind: "resolved",
        source: provider.source,
        call: profile.call,
      };
}

export function selectCsharpTargetProperty(
  host: CsharpProviderCallSelectionHost,
  propertyAccess: Node,
  sourceFile: SourceFile,
): CsharpTargetPropertySelection {
  const provider = selectCsharpProviderProperty(
    host,
    propertyAccess,
    sourceFile,
  );
  if (provider.kind === "resolved") {
    return {
      kind: "resolved",
      source: provider.property.source,
      targetMember: provider.property.targetMember,
      receiver: provider.property.receiver,
      origin: "provider",
    };
  }
  if (provider.kind !== "not-provider") {
    return provider;
  }
  const fixedArray = selectCsharpSourceCoreFixedArrayProperty(
    host,
    provider.source,
    sourceFile,
  );
  if (fixedArray !== undefined) {
    return fixedArray.kind === "rejected"
      ? fixedArray
      : {
          kind: "resolved",
          source: provider.source,
          targetMember: fixedArray.targetMember,
          receiver: fixedArray.receiver,
          origin: "source-profile",
        };
  }
  const profile = selectCsharpComposedSourceProfileProperty(
    host,
    provider.source,
    sourceFile,
  );
  if (profile === undefined) {
    return {
      kind: "source-owned",
      source: provider.source,
      reason: provider.reason,
    };
  }
  return profile.kind === "rejected"
    ? profile
    : {
        kind: "resolved",
        source: provider.source,
        targetMember: profile.targetMember,
        receiver: profile.receiver,
        origin: "source-profile",
      };
}

export function selectCsharpTargetElement(
  host: CsharpProviderCallSelectionHost,
  elementAccess: Node,
  sourceFile: SourceFile,
): CsharpTargetElementSelection {
  const provider = selectCsharpProviderElement(
    host,
    elementAccess,
    sourceFile,
  );
  if (provider.kind === "resolved") {
    return {
      kind: "resolved",
      source: provider.element.source,
      targetMember: provider.element.targetMember,
      targetParameterIndex: provider.element.targetParameterIndex,
      receiver: provider.element.relation.receiver,
      invocation: { kind: "indexer" },
      origin: "provider",
    };
  }
  if (provider.kind !== "not-provider") {
    return provider;
  }
  const fixedArray = selectCsharpSourceCoreFixedArrayElement(
    host,
    provider.source,
    sourceFile,
  );
  if (fixedArray !== undefined) {
    return fixedArray.kind === "rejected"
      ? fixedArray
      : {
          kind: "resolved",
          source: provider.source,
          targetMember: fixedArray.targetMember,
          targetParameterIndex: fixedArray.targetParameterIndex,
          receiver: fixedArray.receiver,
          invocation: fixedArray.invocation,
          origin: "source-profile",
        };
  }
  const project = selectCsharpProjectElement(
    host,
    provider.source,
    sourceFile,
  );
  if (project.kind === "resolved") {
    return {
      kind: "project-indexer",
      source: project.source,
      keyType: project.keyType,
      valueType: project.valueType,
      ...(project.selectedReadType === undefined
        ? {}
        : { selectedReadType: project.selectedReadType }),
    };
  }
  if (project.kind === "rejected") {
    return { kind: "missing", reason: project.reason };
  }
  const profile = selectCsharpComposedSourceProfileElement(
    host,
    provider.source,
    sourceFile,
  );
  if (profile === undefined) {
    return {
      kind: "source-owned",
      source: provider.source,
      reason: provider.reason,
    };
  }
  return profile.kind === "rejected"
    ? profile
    : {
        kind: "resolved",
        source: provider.source,
        targetMember: profile.targetMember,
        targetParameterIndex: profile.targetParameterIndex,
        receiver: profile.receiver,
        invocation: profile.invocation,
        origin: "source-profile",
      };
}
