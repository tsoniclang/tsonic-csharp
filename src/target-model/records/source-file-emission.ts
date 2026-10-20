import type { SourceFile } from "@tsonic/tsts";
import type { CsharpClassFactory } from "./class-factories.js";

export interface CsharpSourceFileEmissionRecords {
  readonly moduleFactories: { readonly get: (file: SourceFile) => readonly CsharpClassFactory[] | undefined };
}
