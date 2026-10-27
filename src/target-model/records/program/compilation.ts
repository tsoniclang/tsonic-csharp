import type { CsharpLanguageDialect } from "../../configuration/model.js";
import type { CsharpProjectClassifications } from "../../project/plan.js";

export interface CsharpCompilationEmission {
  readonly project: CsharpProjectClassifications;
  readonly namespace: string;
  readonly languageDialect: CsharpLanguageDialect;
}

export interface CsharpCompilationRecords {
  readonly compilation: { readonly get: () => CsharpCompilationEmission };
}
