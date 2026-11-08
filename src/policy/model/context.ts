import type { Node } from "@tsonic/tsts";
import type { CsharpProviderCallSelectionHost } from "./provider-calls.js";
import type { CsharpSourceIdentityPolicy } from "../../source/extension/identities.js";

export interface CsharpPolicyContext extends CsharpProviderCallSelectionHost {
  readonly moduleCallables: import("../../target-model/records/callables/module-callables.js").CsharpModuleCallableIdentities;
  readonly sourceIdentities: CsharpSourceIdentityPolicy;
  callOnlyAlias(declaration: Node): import("@tsonic/target-api/source").SourceCallOnlyAlias | undefined;
}
