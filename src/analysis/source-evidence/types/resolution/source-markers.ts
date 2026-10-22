import { selectTsonicFixedArrayFromSource } from "@tsonic/source-core/facts";
import type { TsonicFixedArraySelection } from "@tsonic/source-core/facts";
import type { CsharpTypePolicyBaseHost } from "./model.js";
import type { SourceFile, Type } from "@tsonic/tsts";

export function createCsharpFixedArrayTypeQuery(
  host: Pick<CsharpTypePolicyBaseHost, "sourceFacts" | "semantics">,
): (type: Type, sourceFile: SourceFile) => TsonicFixedArraySelection | undefined {
  const selections = new WeakMap<Type, WeakMap<SourceFile, TsonicFixedArraySelection | null>>();
  return (type, sourceFile) => {
    if (host.sourceFacts === undefined) return undefined;
    let byFile = selections.get(type);
    const cached = byFile?.get(sourceFile);
    if (cached !== undefined) return cached ?? undefined;
    const selected = selectTsonicFixedArrayFromSource(type, host.semantics(sourceFile), host.sourceFacts);
    byFile ??= new WeakMap();
    byFile.set(sourceFile, selected ?? null);
    selections.set(type, byFile);
    return selected;
  };
}
