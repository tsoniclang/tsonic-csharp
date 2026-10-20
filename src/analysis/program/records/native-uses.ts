import type { Node } from "@tsonic/tsts";
import { targetUseSiteIdentity, type TargetUseSiteRef } from "@tsonic/target-api/analysis";
import type { CsharpNativeDemandAnalysis, CsharpNativeUse, CsharpNativeOrderStep, CsharpNativeUnadmitted } from "../../../target-model/records/native-demand.js";

export function sealCsharpNativeUseClassifications(input: {
  readonly entries: readonly { readonly site: TargetUseSiteRef; readonly use: CsharpNativeUse }[];
  readonly unadmitted: readonly CsharpNativeUnadmitted[];
  readonly requiredBindingRoots: readonly Node[];
  readonly requiredNativeValueDeclarations: readonly Node[];
  readonly published: ReadonlyMap<object, ReadonlyMap<string, CsharpNativeUse>>;
  readonly orders: ReadonlyMap<Node, readonly CsharpNativeOrderStep[]>;
  readonly emissions: ReadonlyMap<Node, { readonly site: TargetUseSiteRef; readonly use: CsharpNativeUse }>;
}): CsharpNativeDemandAnalysis {
  const published = new Map([...input.published].map(([subject, rows]) => [subject, new Map(rows)]));
  const orders = new Map(input.orders);
  const emissions = new Map(input.emissions);
  return Object.freeze({ entries: Object.freeze([...input.entries]), unadmitted: Object.freeze([...input.unadmitted]),
    requiredBindingRoots: Object.freeze([...input.requiredBindingRoots]),
    requiredNativeValueDeclarations: Object.freeze([...input.requiredNativeValueDeclarations]),
    nativeUse: Object.freeze({ get: (site: TargetUseSiteRef) => published.get(site.subject)?.get(targetUseSiteIdentity(site)),
      order: (construct: Node) => orders.get(construct), expression: (node: Node) => emissions.get(node) }),
  });
}
