import type {
  ProviderExportDeclaration,
} from "@tsonic/tsts";
import {
  nodeFsCallExportDeclarations,
} from "./calls.js";
import {
  nodeFsStatsExportDeclaration,
} from "./stats.js";

export {
  nodeFsModuleSpecifier,
  nodeFsStatsExportName,
  nodeFsExistsSyncExportName,
  nodeFsExistsSyncSignatureId,
  nodeFsStatSyncExportName,
  nodeFsStatSyncSignatureId,
  nodeFsStatsSizeMemberId,
  nodeFsStatsAtimeMemberId,
  nodeFsStatsAtimeMsMemberId,
  nodeFsStatsMtimeMemberId,
  nodeFsStatsMtimeMsMemberId,
  nodeFsStatsCtimeMemberId,
  nodeFsStatsCtimeMsMemberId,
  nodeFsStatsBirthtimeMemberId,
  nodeFsStatsBirthtimeMsMemberId,
  nodeFsStatsIsFileMemberId,
  nodeFsStatsIsFileSignatureId,
  nodeFsStatsIsDirectoryMemberId,
  nodeFsStatsIsDirectorySignatureId,
} from "./identities.js";
export {
  getNodeFsCallTargetMember,
  getNodeFsExistsSyncTargetMember,
  nodeFsCallTargetMembers,
} from "./calls.js";
export {
  nodeFsClassCallTargetMembers,
  nodeFsClassPropertyTargetMembers,
} from "./stats.js";

export function nodeFsExports(): readonly ProviderExportDeclaration[] {
  return [
    nodeFsStatsExportDeclaration(),
    ...nodeFsCallExportDeclarations(),
  ];
}
