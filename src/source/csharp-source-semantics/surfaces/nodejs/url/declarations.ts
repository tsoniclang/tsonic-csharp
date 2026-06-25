import type {
  ProviderExportDeclaration,
  ProviderMemberDeclaration,
} from "@tsonic/tsts";
import {
  nodeUrlUrlExportName,
} from "./identities.js";
import {
  urlTargetType,
} from "./helpers.js";
import {
  nodeUrlCallTargetMembers,
  nodeUrlClassCallTargetMembers,
  nodeUrlClassPropertyTargetMembers,
} from "./target-members.js";
import type {
  NodeUrlCallTargetMember,
  NodeUrlClassCallTargetMember,
  NodeUrlClassPropertyTargetMember,
} from "./types.js";
import {
  nodeUrlUnsupportedClassMemberDeclarations,
  nodeUrlUnsupportedFunctionDeclarations,
} from "./unsupported.js";
import type {
  NodeUrlUnsupportedClassMemberDeclaration,
} from "./unsupported.js";

export function nodeUrlExports(): readonly ProviderExportDeclaration[] {
  return [
    nodeUrlUrlExportDeclaration(),
    nodeUrlUrlSearchParamsExportDeclaration(),
    nodeUrlUrlPatternExportDeclaration(),
    ...nodeUrlCallExportDeclarations(),
    ...nodeUrlUnsupportedFunctionDeclarations().map(({ exportName, signatureId, providerParameters, providerReturnType }) => ({
      id: `node:url.${exportName}`,
      name: exportName,
      kind: "function" as const,
      signatures: [{
        id: signatureId,
        parameters: providerParameters,
        returnType: providerReturnType,
      }],
    })),
  ];
}

function nodeUrlCallExportDeclarations(): readonly ProviderExportDeclaration[] {
  const membersByExportName = new Map<string, readonly NodeUrlCallTargetMember[]>();
  for (const member of nodeUrlCallTargetMembers()) {
    membersByExportName.set(member.exportName, [...membersByExportName.get(member.exportName) ?? [], member]);
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
      ...nodeUrlClassCallTargetMembers().map(providerMemberForUrlClassCall),
      ...nodeUrlClassPropertyTargetMembers().map(providerMemberForUrlClassProperty),
      ...nodeUrlUnsupportedClassMemberDeclarations()
        .filter((member) => member.exportName === nodeUrlUrlExportName)
        .map(providerMemberForUnsupportedUrlClassMember),
    ],
  };
}

function nodeUrlUrlSearchParamsExportDeclaration(): ProviderExportDeclaration {
  return unsupportedClassExportDeclaration("URLSearchParams");
}

function nodeUrlUrlPatternExportDeclaration(): ProviderExportDeclaration {
  return unsupportedClassExportDeclaration("URLPattern");
}

function unsupportedClassExportDeclaration(exportName: string): ProviderExportDeclaration {
  return {
    id: `node:url.${exportName}`,
    name: exportName,
    kind: "class",
    members: nodeUrlUnsupportedClassMemberDeclarations()
      .filter((member) => member.exportName === exportName)
      .map(providerMemberForUnsupportedUrlClassMember),
  };
}

function providerMemberForUrlClassCall(member: NodeUrlClassCallTargetMember): ProviderMemberDeclaration {
  return {
    id: member.memberId,
    name: member.memberName,
    kind: member.memberKind,
    ...(member.static === true ? { static: true } : {}),
    signatures: [{
      id: member.signatureId,
      parameters: member.providerParameters,
      ...(member.providerReturnType !== undefined ? { returnType: member.providerReturnType } : {}),
    }],
  };
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
