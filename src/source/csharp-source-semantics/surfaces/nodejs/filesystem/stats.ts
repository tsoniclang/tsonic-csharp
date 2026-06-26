import type {
  ProviderExportDeclaration,
  ProviderTypeExpression,
  TargetMember,
} from "@tsonic/tsts";
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
      {
        id: nodeFsStatsSizeMemberId,
        name: "size",
        kind: "property",
        readonly: true,
        type: numberProviderType,
      },
      ...nodeFsStatsTimestampProviderMembers(),
      {
        id: nodeFsStatsIsFileMemberId,
        name: "isFile",
        kind: "method",
        signatures: [{
          id: nodeFsStatsIsFileSignatureId,
          parameters: [],
          returnType: boolProviderType,
        }],
      },
      {
        id: nodeFsStatsIsDirectoryMemberId,
        name: "isDirectory",
        kind: "method",
        signatures: [{
          id: nodeFsStatsIsDirectorySignatureId,
          parameters: [],
          returnType: boolProviderType,
        }],
      },
    ],
  };
}

export function nodeFsClassCallTargetMembers(): readonly NodejsClassCallTargetMember[] {
  return [
    nodeFsStatsCallTargetMember("isFile", nodeFsStatsIsFileMemberId, nodeFsStatsIsFileSignatureId, getNodeFsStatsIsFileTargetMember()),
    nodeFsStatsCallTargetMember("isDirectory", nodeFsStatsIsDirectoryMemberId, nodeFsStatsIsDirectorySignatureId, getNodeFsStatsIsDirectoryTargetMember()),
  ];
}

export function nodeFsClassPropertyTargetMembers(): readonly NodejsClassPropertyTargetMember[] {
  return [
    nodeFsStatsPropertyTargetMember("size", nodeFsStatsSizeMemberId, getNodeFsStatsSizeTargetMember()),
    nodeFsStatsPropertyTargetMember("atime", nodeFsStatsAtimeMemberId, getNodeFsStatsDateTargetMember("atime")),
    nodeFsStatsPropertyTargetMember("atimeMs", nodeFsStatsAtimeMsMemberId, getNodeFsStatsUnixMillisecondsTargetMember("atimeMs")),
    nodeFsStatsPropertyTargetMember("mtime", nodeFsStatsMtimeMemberId, getNodeFsStatsDateTargetMember("mtime")),
    nodeFsStatsPropertyTargetMember("mtimeMs", nodeFsStatsMtimeMsMemberId, getNodeFsStatsUnixMillisecondsTargetMember("mtimeMs")),
    nodeFsStatsPropertyTargetMember("ctime", nodeFsStatsCtimeMemberId, getNodeFsStatsDateTargetMember("ctime")),
    nodeFsStatsPropertyTargetMember("ctimeMs", nodeFsStatsCtimeMsMemberId, getNodeFsStatsUnixMillisecondsTargetMember("ctimeMs")),
    nodeFsStatsPropertyTargetMember("birthtime", nodeFsStatsBirthtimeMemberId, getNodeFsStatsDateTargetMember("birthtime")),
    nodeFsStatsPropertyTargetMember("birthtimeMs", nodeFsStatsBirthtimeMsMemberId, getNodeFsStatsUnixMillisecondsTargetMember("birthtimeMs")),
  ];
}

function nodeFsStatsTimestampProviderMembers(): readonly {
  readonly id: string;
  readonly name: string;
  readonly kind: "property";
  readonly readonly: true;
  readonly type: ProviderTypeExpression;
}[] {
  return [
    nodeFsStatsTimestampProviderMember("atime", nodeFsStatsAtimeMemberId, dateProviderType),
    nodeFsStatsTimestampProviderMember("atimeMs", nodeFsStatsAtimeMsMemberId, numberProviderType),
    nodeFsStatsTimestampProviderMember("mtime", nodeFsStatsMtimeMemberId, dateProviderType),
    nodeFsStatsTimestampProviderMember("mtimeMs", nodeFsStatsMtimeMsMemberId, numberProviderType),
    nodeFsStatsTimestampProviderMember("ctime", nodeFsStatsCtimeMemberId, dateProviderType),
    nodeFsStatsTimestampProviderMember("ctimeMs", nodeFsStatsCtimeMsMemberId, numberProviderType),
    nodeFsStatsTimestampProviderMember("birthtime", nodeFsStatsBirthtimeMemberId, dateProviderType),
    nodeFsStatsTimestampProviderMember("birthtimeMs", nodeFsStatsBirthtimeMsMemberId, numberProviderType),
  ];
}

function nodeFsStatsTimestampProviderMember(
  name: string,
  id: string,
  type: ProviderTypeExpression,
): {
  readonly id: string;
  readonly name: string;
  readonly kind: "property";
  readonly readonly: true;
  readonly type: ProviderTypeExpression;
} {
  return {
    id,
    name,
    kind: "property",
    readonly: true,
    type,
  };
}

function getNodeFsStatsSizeTargetMember(): TargetMember {
  return {
    id: "Tsonic.CSharp.Node.Stats.size",
    sourceName: "size",
    targetName: "size",
    kind: "property",
    parameters: [],
    returnType: longTargetType,
    declaringType: statsTargetType,
  };
}

function getNodeFsStatsDateTargetMember(sourceName: string): TargetMember {
  return {
    id: `Tsonic.CSharp.Node.Stats.${sourceName}`,
    sourceName,
    targetName: sourceName,
    kind: "property",
    parameters: [],
    returnType: dateTargetType,
    declaringType: statsTargetType,
  };
}

function getNodeFsStatsUnixMillisecondsTargetMember(sourceName: string): TargetMember {
  return {
    id: `Tsonic.CSharp.Node.Stats.${sourceName}`,
    sourceName,
    targetName: sourceName,
    kind: "property",
    parameters: [],
    returnType: doubleTargetType,
    declaringType: statsTargetType,
  };
}

function getNodeFsStatsIsFileTargetMember(): TargetMember {
  return nodeFsStatsBoolMethodTargetMember("isFile", "IsFile");
}

function getNodeFsStatsIsDirectoryTargetMember(): TargetMember {
  return nodeFsStatsBoolMethodTargetMember("isDirectory", "IsDirectory");
}

function nodeFsStatsBoolMethodTargetMember(sourceName: string, targetName: string): TargetMember {
  return {
    id: `Tsonic.CSharp.Node.Stats.${targetName}()`,
    sourceName,
    targetName,
    kind: "method",
    parameters: [],
    returnType: boolTargetType,
    declaringType: statsTargetType,
  };
}

function nodeFsStatsCallTargetMember(
  memberName: string,
  memberId: string,
  signatureId: string,
  member: TargetMember,
): NodejsClassCallTargetMember {
  return {
    exportName: nodeFsStatsExportName,
    memberName,
    memberId,
    signatureId,
    member,
  };
}

function nodeFsStatsPropertyTargetMember(
  memberName: string,
  memberId: string,
  member: TargetMember,
): NodejsClassPropertyTargetMember {
  return {
    exportName: nodeFsStatsExportName,
    memberName,
    memberId,
    member,
  };
}
