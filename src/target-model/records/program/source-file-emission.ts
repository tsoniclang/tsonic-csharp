import type { SourceFile } from "@tsonic/tsts";
import type { CsharpClassFactory } from "../objects/class-factories.js";

export interface CsharpSourceFileEmissionRecords {
  readonly moduleFactories: { readonly get: (file: SourceFile) => readonly CsharpClassFactory[] | undefined };
}
