import type {
  ProviderExportDeclaration,
  ProviderMemberDeclaration,
} from "@tsonic/tsts";
import {
  nodeUrlUrlExportName,
  nodeUrlUrlSearchParamsExportName,
} from "./identities.js";
import {
  urlTargetType,
  urlSearchParamsTargetType,
} from "./helpers.js";
import {
  nodeUrlCallTargetMembers,
  nodeUrlUrlClassCallTargetMembers,
  nodeUrlUrlClassPropertyTargetMembers,
  nodeUrlUrlSearchParamsClassCallTargetMembers,
  nodeUrlUrlSearchParamsClassPropertyTargetMembers,
} from "./target-members.js";
import type {
  NodeUrlCallTargetMember,
  NodeUrlClassCallTargetMember,
  NodeUrlClassPropertyTargetMember,
} from "./types.js";
import {
  nodeUrlUnsupportedFunctionDeclarations,
  nodeUrlUrlPatternUnsupportedClassMemberDeclarations,
  nodeUrlUrlUnsupportedClassMemberDeclarations,
} from "./unsupported.js";
import {
  nodejsDefaultModuleObjectExports,
} from "../module-defaults.js";
import {
  nodeUrlModuleSpecifier,
} from "./identities.js";
import type {
  NodeUrlUnsupportedClassMemberDeclaration,
} from "./unsupported.js";

export function nodeUrlExports(): readonly ProviderExportDeclaration[] {
  const exports = [
    nodeUrlUrlExportDeclaration(),
    nodeUrlUrlSearchParamsExportDeclaration(),
    nodeUrlUrlPatternExportDeclaration(),
    ...nodeUrlFunctionExportDeclarations(),
  ];
  return [
    ...exports,
    ...nodejsDefaultModuleObjectExports(nodeUrlModuleSpecifier, exports),
  ];
}

function nodeUrlFunctionExportDeclarations(): readonly ProviderExportDeclaration[] {
  const membersByExportName = new Map<string, readonly {
    readonly signatureId: string;
    readonly providerParameters: NodeUrlCallTargetMember["providerParameters"];
    readonly providerReturnType: NodeUrlCallTargetMember["providerReturnType"];
  }[]>();
  for (const member of nodeUrlCallTargetMembers()) {
    membersByExportName.set(member.exportName, [...membersByExportName.get(member.exportName) ?? [], member]);
  }
  for (const declaration of nodeUrlUnsupportedFunctionDeclarations()) {
    membersByExportName.set(declaration.exportName, [...membersByExportName.get(declaration.exportName) ?? [], declaration]);
  }
  return [...membersByExportName.entries()].map(([exportName, members]) => ({
    id: `node:url.${exportName}`,
    name: exportName,
    kind: "function" as const,
    signatures: members.map((member) => ({
      id: member.signatureId,
      parameters: member.providerParameters,
      returnType: member.providerReturnType,
    })),
  }));
}

function nodeUrlUrlExportDeclaration(): ProviderExportDeclaration {
  return {
    id: `node:url.${nodeUrlUrlExportName}`,
    name: nodeUrlUrlExportName,
    kind: "class",
    targetIdentity: {
      target: "csharp",
      id: urlTargetType.id,
      displayName: "Tsonic.CSharp.Node.URL",
    },
    members: [
      ...providerMembersForUrlClassCalls(nodeUrlUrlClassCallTargetMembers()),
      ...nodeUrlUrlClassPropertyTargetMembers().map(providerMemberForUrlClassProperty),
      ...nodeUrlUrlUnsupportedClassMemberDeclarations()
        .map(providerMemberForUnsupportedUrlClassMember),
    ],
  };
}

function nodeUrlUrlSearchParamsExportDeclaration(): ProviderExportDeclaration {
  return {
    id: `node:url.${nodeUrlUrlSearchParamsExportName}`,
    name: nodeUrlUrlSearchParamsExportName,
    kind: "class",
    targetIdentity: {
      target: "csharp",
      id: urlSearchParamsTargetType.id,
      displayName: "Tsonic.CSharp.Node.URLSearchParams",
    },
    members: [
      ...providerMembersForUrlClassCalls(nodeUrlUrlSearchParamsClassCallTargetMembers()),
      ...nodeUrlUrlSearchParamsClassPropertyTargetMembers().map(providerMemberForUrlClassProperty),
    ],
  };
}

function nodeUrlUrlPatternExportDeclaration(): ProviderExportDeclaration {
  return unsupportedClassExportDeclaration("URLPattern", nodeUrlUrlPatternUnsupportedClassMemberDeclarations());
}

function unsupportedClassExportDeclaration(
  exportName: string,
  members: readonly NodeUrlUnsupportedClassMemberDeclaration[],
): ProviderExportDeclaration {
  return {
    id: `node:url.${exportName}`,
    name: exportName,
    kind: "class",
    members: members.map(providerMemberForUnsupportedUrlClassMember),
  };
}

function providerMembersForUrlClassCalls(
  members: readonly NodeUrlClassCallTargetMember[],
): readonly ProviderMemberDeclaration[] {
  const membersById = new Map<string, readonly NodeUrlClassCallTargetMember[]>();
  for (const member of members) {
    membersById.set(member.memberId, [...membersById.get(member.memberId) ?? [], member]);
  }
  return [...membersById.values()].map((memberGroup) => {
    const first = memberGroup[0];
    if (first === undefined) {
      throw new Error("Missing C# NodeJS url provider member group.");
    }
    return {
      id: first.memberId,
      name: first.memberName,
      kind: first.memberKind,
      ...(first.static === true ? { static: true } : {}),
      signatures: memberGroup.map((member) => ({
        id: member.signatureId,
        parameters: member.providerParameters,
        ...(member.providerReturnType !== undefined ? { returnType: member.providerReturnType } : {}),
      })),
    };
  });
}

function providerMemberForUrlClassProperty(member: NodeUrlClassPropertyTargetMember): ProviderMemberDeclaration {
  return {
    id: member.memberId,
    name: member.memberName,
    kind: "property",
    ...(member.readonly === true ? { readonly: true } : {}),
    type: member.providerType,
  };
}

function providerMemberForUnsupportedUrlClassMember(member: NodeUrlUnsupportedClassMemberDeclaration): ProviderMemberDeclaration {
  return {
    id: member.memberId,
    name: member.memberName,
    kind: member.memberKind,
    ...(member.readonly === true ? { readonly: true } : {}),
    ...(member.providerType !== undefined ? { type: member.providerType } : {}),
    ...(member.signatureId !== undefined
      ? {
        signatures: [{
          id: member.signatureId,
          parameters: member.providerParameters ?? [],
          ...(member.providerReturnType !== undefined ? { returnType: member.providerReturnType } : {}),
        }],
      }
      : {}),
  };
}
