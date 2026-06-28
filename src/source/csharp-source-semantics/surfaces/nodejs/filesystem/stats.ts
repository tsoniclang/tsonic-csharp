import type {
  ProviderExportDeclaration,
  ProviderTypeExpression,
} from "@tsonic/tsts";
import type {
  CsharpTargetMember,
} from "../../../target-types.js";
import type {
  NodejsClassCallTargetMember,
  NodejsClassPropertyTargetMember,
} from "../members/types.js";
import {
  nodeFsStatsAtimeMemberId,
  nodeFsStatsAtimeMsMemberId,
  nodeFsStatsBirthtimeMemberId,
  nodeFsStatsBirthtimeMsMemberId,
  nodeFsStatsCtimeMemberId,
  nodeFsStatsCtimeMsMemberId,
  nodeFsStatsExportName,
  nodeFsStatsIsDirectoryMemberId,
  nodeFsStatsIsDirectorySignatureId,
  nodeFsStatsIsFileMemberId,
  nodeFsStatsIsFileSignatureId,
  nodeFsStatsMtimeMemberId,
  nodeFsStatsMtimeMsMemberId,
  nodeFsStatsSizeMemberId,
} from "./identities.js";
import {
  boolProviderType,
  boolTargetType,
  dateProviderType,
  dateTargetType,
  doubleTargetType,
  longTargetType,
  numberProviderType,
  statsTargetType,
} from "./types.js";

export function nodeFsStatsExportDeclaration(): ProviderExportDeclaration {
  return {
    id: `node:fs.${nodeFsStatsExportName}`,
    name: nodeFsStatsExportName,
    kind: "class",
    targetIdentity: {
      target: "csharp",
      id: statsTargetType.id,
      displayName: "Tsonic.CSharp.Node.Stats",
    },
    members: [
      ...nodeFsStatsPropertyTargetMetadataRows.map(providerMemberForNodeFsStatsProperty),
      ...nodeFsStatsCallTargetMetadataRows.map(providerMemberForNodeFsStatsCall),
    ],
  };
}

export function nodeFsClassCallTargetMembers(): readonly NodejsClassCallTargetMember[] {
  return nodeFsStatsCallTargetMetadataRows.map(nodeFsStatsCallTargetMember);
}

export function nodeFsClassPropertyTargetMembers(): readonly NodejsClassPropertyTargetMember[] {
  return nodeFsStatsPropertyTargetMetadataRows.map(nodeFsStatsPropertyTargetMember);
}

interface NodeFsStatsPropertyTargetMetadataRow {
  readonly memberName: string;
  readonly memberId: string;
  readonly providerType: ProviderTypeExpression;
  readonly member: CsharpTargetMember;
}

interface NodeFsStatsCallTargetMetadataRow {
  readonly memberName: string;
  readonly memberId: string;
  readonly signatureId: string;
  readonly providerReturnType: ProviderTypeExpression;
  readonly member: CsharpTargetMember;
}

const nodeFsStatsPropertyTargetMetadataRows = [
  {
    memberName: "size",
    memberId: nodeFsStatsSizeMemberId,
    providerType: numberProviderType,
    member: {
      id: "Tsonic.CSharp.Node.Stats.size",
      sourceName: "size",
      targetName: "size",
      kind: "property",
      parameters: [],
      returnType: longTargetType,
      declaringType: statsTargetType,
    },
  },
  {
    memberName: "atime",
    memberId: nodeFsStatsAtimeMemberId,
    providerType: dateProviderType,
    member: {
      id: "Tsonic.CSharp.Node.Stats.atime",
      sourceName: "atime",
      targetName: "atime",
      kind: "property",
      parameters: [],
      returnType: dateTargetType,
      declaringType: statsTargetType,
    },
  },
  {
    memberName: "atimeMs",
    memberId: nodeFsStatsAtimeMsMemberId,
    providerType: numberProviderType,
    member: {
      id: "Tsonic.CSharp.Node.Stats.atimeMs",
      sourceName: "atimeMs",
      targetName: "atimeMs",
      kind: "property",
      parameters: [],
      returnType: doubleTargetType,
      declaringType: statsTargetType,
    },
  },
  {
    memberName: "mtime",
    memberId: nodeFsStatsMtimeMemberId,
    providerType: dateProviderType,
    member: {
      id: "Tsonic.CSharp.Node.Stats.mtime",
      sourceName: "mtime",
      targetName: "mtime",
      kind: "property",
      parameters: [],
      returnType: dateTargetType,
      declaringType: statsTargetType,
    },
  },
  {
    memberName: "mtimeMs",
    memberId: nodeFsStatsMtimeMsMemberId,
    providerType: numberProviderType,
    member: {
      id: "Tsonic.CSharp.Node.Stats.mtimeMs",
      sourceName: "mtimeMs",
      targetName: "mtimeMs",
      kind: "property",
      parameters: [],
      returnType: doubleTargetType,
      declaringType: statsTargetType,
    },
  },
  {
    memberName: "ctime",
    memberId: nodeFsStatsCtimeMemberId,
    providerType: dateProviderType,
    member: {
      id: "Tsonic.CSharp.Node.Stats.ctime",
      sourceName: "ctime",
      targetName: "ctime",
      kind: "property",
      parameters: [],
      returnType: dateTargetType,
      declaringType: statsTargetType,
    },
  },
  {
    memberName: "ctimeMs",
    memberId: nodeFsStatsCtimeMsMemberId,
    providerType: numberProviderType,
    member: {
      id: "Tsonic.CSharp.Node.Stats.ctimeMs",
      sourceName: "ctimeMs",
      targetName: "ctimeMs",
      kind: "property",
      parameters: [],
      returnType: doubleTargetType,
      declaringType: statsTargetType,
    },
  },
  {
    memberName: "birthtime",
    memberId: nodeFsStatsBirthtimeMemberId,
    providerType: dateProviderType,
    member: {
      id: "Tsonic.CSharp.Node.Stats.birthtime",
      sourceName: "birthtime",
      targetName: "birthtime",
      kind: "property",
      parameters: [],
      returnType: dateTargetType,
      declaringType: statsTargetType,
    },
  },
  {
    memberName: "birthtimeMs",
    memberId: nodeFsStatsBirthtimeMsMemberId,
    providerType: numberProviderType,
    member: {
      id: "Tsonic.CSharp.Node.Stats.birthtimeMs",
      sourceName: "birthtimeMs",
      targetName: "birthtimeMs",
      kind: "property",
      parameters: [],
      returnType: doubleTargetType,
      declaringType: statsTargetType,
    },
  },
] satisfies readonly NodeFsStatsPropertyTargetMetadataRow[];

const nodeFsStatsCallTargetMetadataRows = [
  {
    memberName: "isFile",
    memberId: nodeFsStatsIsFileMemberId,
    signatureId: nodeFsStatsIsFileSignatureId,
    providerReturnType: boolProviderType,
    member: {
      id: "Tsonic.CSharp.Node.Stats.IsFile()",
      sourceName: "isFile",
      targetName: "IsFile",
      kind: "method",
      parameters: [],
      returnType: boolTargetType,
      declaringType: statsTargetType,
    },
  },
  {
    memberName: "isDirectory",
    memberId: nodeFsStatsIsDirectoryMemberId,
    signatureId: nodeFsStatsIsDirectorySignatureId,
    providerReturnType: boolProviderType,
    member: {
      id: "Tsonic.CSharp.Node.Stats.IsDirectory()",
      sourceName: "isDirectory",
      targetName: "IsDirectory",
      kind: "method",
      parameters: [],
      returnType: boolTargetType,
      declaringType: statsTargetType,
    },
  },
] satisfies readonly NodeFsStatsCallTargetMetadataRow[];

function providerMemberForNodeFsStatsProperty(row: NodeFsStatsPropertyTargetMetadataRow): {
  readonly id: string;
  readonly name: string;
  readonly kind: "property";
  readonly readonly: true;
  readonly type: ProviderTypeExpression;
} {
  return {
    id: row.memberId,
    name: row.memberName,
    kind: "property",
    readonly: true,
    type: row.providerType,
  };
}

function providerMemberForNodeFsStatsCall(row: NodeFsStatsCallTargetMetadataRow): {
  readonly id: string;
  readonly name: string;
  readonly kind: "method";
  readonly signatures: readonly [{
    readonly id: string;
    readonly parameters: readonly [];
    readonly returnType: ProviderTypeExpression;
  }];
} {
  return {
    id: row.memberId,
    name: row.memberName,
    kind: "method",
    signatures: [{
      id: row.signatureId,
      parameters: [],
      returnType: row.providerReturnType,
    }],
  };
}

function nodeFsStatsCallTargetMember(
  row: NodeFsStatsCallTargetMetadataRow,
): NodejsClassCallTargetMember {
  return {
    exportName: nodeFsStatsExportName,
    memberName: row.memberName,
    memberId: row.memberId,
    signatureId: row.signatureId,
    member: row.member,
  };
}

function nodeFsStatsPropertyTargetMember(
  row: NodeFsStatsPropertyTargetMetadataRow,
): NodejsClassPropertyTargetMember {
  return {
    exportName: nodeFsStatsExportName,
    memberName: row.memberName,
    memberId: row.memberId,
    member: row.member,
  };
}
