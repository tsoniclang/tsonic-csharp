import type {
  ProviderExportDeclaration,
} from "@tsonic/tsts";
import {
  nodeFsCallExportDeclarations,
} from "./calls.js";
import {
  nodeFsStatsExportDeclaration,
} from "./stats.js";
import {
  nodeFsPromisesExportDeclarations,
} from "./promises.js";

export {
  nodeFsModuleSpecifier,
  nodeFsPromisesModuleSpecifier,
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
  nodeFsUnsupportedTargetIdentities,
} from "./calls.js";
export {
  getNodeFsPromisesCallTargetMember,
  nodeFsPromisesCallTargetMembers,
} from "./promises.js";
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

export function nodeFsPromisesExports(): readonly ProviderExportDeclaration[] {
  return nodeFsPromisesExportDeclarations();
}
