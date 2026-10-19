import type { CsharpNativeMemberIdentity } from "../names/model.js";

export interface CsharpNativeMemberHidingReader {
  readonly get: (subject: CsharpNativeMemberIdentity) => boolean | undefined;
}
