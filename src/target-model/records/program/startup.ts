import type { SourceFile } from "@tsonic/tsts";
import type { CsharpSourceModuleBootstrap } from "./source-modules.js";
import type { CsharpTargetBinaryExecutionDriver } from "../../metadata/provider-metadata.js";

export interface CsharpStartupEmission {
  readonly kind: "none" | "library" | "binary";
  readonly entryFileName: string | undefined;
  readonly asynchronous: boolean;
  readonly driver: CsharpTargetBinaryExecutionDriver | undefined;
  readonly workers: readonly {
    readonly sourceFile: SourceFile;
    readonly fileName: string;
    readonly identity: string;
    readonly bootstrap: CsharpSourceModuleBootstrap;
  }[];
}

export interface CsharpStartupRecords {
  readonly startup: { readonly get: () => CsharpStartupEmission };
}
