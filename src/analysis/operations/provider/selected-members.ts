import type { CsharpTargetCallSelection, CsharpTargetElementSelection, CsharpTargetPropertySelection } from "../../../target-model/records/member-selections.js";
import type { Node, SourceFile } from "@tsonic/tsts";

import type { CsharpProviderCallSelectionHost } from "../../../policy/model/provider-calls.js";
import { selectCsharpProviderCall } from "./calls/selection.js";
import { selectCsharpProviderElement } from "./element-selection.js";
import { selectCsharpProviderProperty } from "./property-selection.js";
import { selectCsharpProjectElement } from "./project-indexers.js";
import { selectCsharpComposedSourceProfileCall, selectCsharpComposedSourceProfileElement, selectCsharpComposedSourceProfileProperty } from "../../source-profiles/selection.js";

import { selectCsharpUnionProperty } from "./union-properties.js";

import { selectCsharpInheritedConstructorTarget } from "./calls/implicit-super.js";
import { selectCsharpSourceCoreFixedArrayElement, selectCsharpSourceCoreFixedArrayProperty } from "../../source-profiles/source-core-fixed-array.js";

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
  if (profile.kind === "rejected") return profile;
  const forwarding = selectCsharpInheritedConstructorTarget(host, provider.source, profile.call.targetMember);
  return forwarding.kind === "missing" ? forwarding : {
        kind: "resolved",
        source: provider.source,
        call: { ...profile.call, targetMember: forwarding.member },
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
      invocation: { kind: "member" },
    };
  }
  if (provider.kind !== "not-provider") {
    return provider;
  }
  const union = selectCsharpUnionProperty(host, provider.source, sourceFile);
  if (union !== undefined) return union;
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
          invocation: { kind: "member" },
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
        invocation: profile.invocation,
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
