import type { CsharpLanguageDialect } from "../configuration/model.js";

export interface CsharpCompilationEmission {
  readonly namespace: string;
  readonly languageDialect: CsharpLanguageDialect;
}

export interface CsharpCompilationRecords {
  readonly compilation: { readonly get: () => CsharpCompilationEmission };
}
