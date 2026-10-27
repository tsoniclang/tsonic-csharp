import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpNativeMemberHidingReader } from "../../../../target-model/records/native/native-member-names.js";
import type { CsharpNativeMemberNames, CsharpNativeMemberIdentity, CsharpNativeMemberRole } from "../../../../target-model/names/model.js";
import { csharpNativeMemberIdentityParts } from "../../../../target-model/names/model.js";

export function createCsharpNativeMemberHidingRecords(names: CsharpNativeMemberNames): CsharpNativeMemberHidingReader {
  const containers = new Map<Node | string, Map<Node | string, Map<CsharpNativeMemberRole, boolean>>>();
  for (const entry of names.memberHiding) {
    const [container, member, role] = csharpNativeMemberIdentityParts(entry.subject);
    let members = containers.get(container);
    if (members === undefined) {
      members = new Map();
      containers.set(container, members);
    }
    let roles = members.get(member);
    if (roles === undefined) {
      roles = new Map();
      members.set(member, roles);
    }
    if (roles.has(role)) failTargetAnalysisInvariant("tsonic-csharp", "A native member-name decision has exactly one producer.");
    roles.set(role, entry.hides);
  }
  return Object.freeze({ get: (subject: CsharpNativeMemberIdentity) => {
    const [container, member, role] = csharpNativeMemberIdentityParts(subject);
    return containers.get(container)?.get(member)?.get(role);
  } });
}
