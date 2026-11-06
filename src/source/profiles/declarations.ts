import { targetSourceProfileDeclaration, typescriptNoLibUtilityDeclarations } from "@tsonic/target-api/provider";
import type { TargetCompilationSessionContext, TargetSourceProfileContributions } from "@tsonic/target-api/provider";
import { jsSurfaceSourceProfileDeclarations, sourceNoLibBaseDeclarations, sourcePrimitiveProfileDeclarations } from "@tsonic/js-source-profile";
import { csharpTargetId } from "../../target-model/identities/target.js";

export const csharpSourceProfileOwnerId = csharpTargetId;
export const csharpJsSourceProfileOwnerId = "js";


const csharpProfileDeclarations = `
${sourcePrimitiveProfileDeclarations}
${sourceNoLibBaseDeclarations}

interface IArguments {
  readonly Length: int32;
}

interface String {
  [Symbol.iterator](): IterableIterator<string>;
  readonly Length: int32;
  Split(separator: string): string[];
  StartsWith(value: string): boolean;
  EndsWith(value: string): boolean;
  Contains(value: string): boolean;
  Trim(): string;
  ToString(): string;
}

interface Array<T> extends Iterable<T> {
  readonly Length: int32;
  [index: int32]: T;
}

interface ReadonlyArray<T> extends Iterable<T> {
  readonly Length: int32;
  readonly [index: int32]: T;
}
`.trim();



export function csharpSourceProfileContributions(context: TargetCompilationSessionContext): TargetSourceProfileContributions {
  if (context.selectedSurfaceIds.includes(csharpJsSourceProfileOwnerId)) {
    return {
      declarations: [],
    };
  }
  return {
    declarations: [
      targetSourceProfileDeclaration(
        "typescript-utilities.d.ts",
        typescriptNoLibUtilityDeclarations,
      ),
      targetSourceProfileDeclaration("csharp-globals.d.ts", csharpProfileDeclarations),
    ],
  };
}

export function csharpJsSurfaceSourceProfileContributions(): TargetSourceProfileContributions {
  return {
    declarations: [
      targetSourceProfileDeclaration(
        "typescript-utilities.d.ts",
        typescriptNoLibUtilityDeclarations,
      ),
      targetSourceProfileDeclaration("js-globals.d.ts", jsSurfaceSourceProfileDeclarations),
    ],
  };
}
