// The C# target's ABI premise for native-int / native-uint (E24, N5; K-2680). This module is its one owner. The premise
// is known only when the build itself fixes the processor architecture, and that happens only through the generated
// project's RuntimeIdentifier or PlatformTarget property:
// - PlatformTarget=x64 / arm64 marks the assembly for that machine, so a runtime of another width does not load it;
// - the .NET SDK derives PlatformTarget from a stated RuntimeIdentifier, and builds a RID-specific app for it.
// Anything else is `missing`:
// - RuntimeIdentifiers (plural) is the restore set; a build without a single RID stays portable.
// - AnyCPU, or no statement, is a portable build that runs on whatever architecture executes it. Neither the
//   toolchain (toolchain/native.ts) nor the generated run command (descriptor/starter-project.ts) passes an
//   architecture.
// - A user-owned project is never read or edited (backend/planner/project/project-artifacts.ts), so its architecture
//   is unread.
// Never the machine running the compiler, never a provider data layout (a raw-address operation reads its own
// data-layout addressWidth, representation/values.ts).
import type { SourceNativeIntegerBits, SourceNativeIntegerPremise, SourcePlatformFacts } from "@tsonic/target-api/source";
import type { CsharpProjectConfiguration } from "./model.js";

/** The .NET processor architectures whose pointer width the C# target knows. A name outside it states no width. */
export const csharpArchitectureWidths: ReadonlyMap<string, SourceNativeIntegerBits> = new Map([
  ["x64", 64],
  ["arm64", 64],
]);

/** One architecture the generated project fixes, with the property that fixes it. */
export interface CsharpArchitectureStatement {
  readonly basis: string;
  readonly architecture: string;
}

export type CsharpArchitectureState =
  | { readonly kind: "missing"; readonly reason: string }
  | { readonly kind: "stated"; readonly statements: readonly CsharpArchitectureStatement[] };

export interface CsharpPlatformSelection {
  /** What the build fixes about its architecture; `missing` when nothing tsonic reads fixes it. */
  readonly architecture: CsharpArchitectureState;
  /** The neutral premise the composition root passes to the Host (TargetCompilationSession.sourcePlatform()). */
  readonly premise: SourcePlatformFacts;
}

/**
 * The platform selection of one C# build. No statement gives a `missing` premise with the reason. A stated
 * architecture in csharpArchitectureWidths gives its width; one outside it gives `missing`; statements of different
 * widths give `conflicting`.
 */
export function resolveCsharpPlatform(
  project: CsharpProjectConfiguration,
  properties: Readonly<Record<string, string | number | boolean>>,
): CsharpPlatformSelection {
  const architecture = csharpArchitectureState(project, properties);
  return Object.freeze({
    architecture,
    premise: architecture.kind === "missing"
      ? Object.freeze({ kind: "missing", reason: architecture.reason })
      : csharpStatedArchitecturePremise(architecture.statements),
  });
}

function csharpArchitectureState(
  project: CsharpProjectConfiguration,
  properties: Readonly<Record<string, string | number | boolean>>,
): CsharpArchitectureState {
  if (project.kind === "user-owned") return Object.freeze({ kind: "missing",
    reason: `The user-owned project '${project.projectFile}' owns its architecture; the C# target does not read it.` });
  const statements: CsharpArchitectureStatement[] = [];
  for (const [name, raw] of Object.entries(properties)) {
    const property = name.toLowerCase();
    const value = String(raw).trim();
    if (property === "runtimeidentifier" && value.length > 0) statements.push(runtimeIdentifierStatement(name, value));
    else if (property === "platformtarget" && value.length > 0 && value.toLowerCase() !== "anycpu") {
      statements.push(Object.freeze({ basis: `${name}=${value}`, architecture: value.toLowerCase() }));
    }
  }
  return statements.length === 0
    ? Object.freeze({ kind: "missing",
      reason: "The generated project fixes no architecture (no RuntimeIdentifier or PlatformTarget); its portable build runs on any architecture." })
    : Object.freeze({ kind: "stated", statements: Object.freeze(statements) });
}

/** A .NET runtime identifier names its architecture in its last segment (linux-x64, linux-musl-arm64, win-x86). */
function runtimeIdentifierStatement(property: string, rid: string): CsharpArchitectureStatement {
  const segments = rid.toLowerCase().split("-");
  return Object.freeze({ basis: `${property}=${rid}`, architecture: segments.length > 1 ? segments[segments.length - 1]! : "" });
}

function csharpStatedArchitecturePremise(statements: readonly CsharpArchitectureStatement[]): SourcePlatformFacts {
  const premises: SourceNativeIntegerPremise[] = [];
  for (const statement of statements) {
    const width = csharpArchitectureWidths.get(statement.architecture);
    if (width === undefined) return Object.freeze({ kind: "missing",
      reason: `${statement.basis} names no architecture whose width the C# target knows (${[...csharpArchitectureWidths.keys()].join(", ")}).` });
    premises.push(Object.freeze({ nativeIntegerBits: width, basis: statement.basis }));
  }
  const widths = new Set(premises.map(premise => premise.nativeIntegerBits));
  if (widths.size > 1) return Object.freeze({ kind: "conflicting", premises: Object.freeze(premises) });
  return Object.freeze({ kind: "known", nativeIntegerBits: premises[0]!.nativeIntegerBits,
    basis: premises.map(premise => premise.basis).join("; ") });
}

/** Structural equality of two premises (the Host-published fact against the C# target's own premise). */
export function csharpPlatformPremisesEqual(left: SourcePlatformFacts, right: SourcePlatformFacts): boolean {
  if (left.kind === "known") return right.kind === "known" && left.nativeIntegerBits === right.nativeIntegerBits &&
    left.basis === right.basis;
  if (left.kind === "missing") return right.kind === "missing" && left.reason === right.reason;
  return right.kind === "conflicting" && left.premises.length === right.premises.length &&
    left.premises.every((premise, index) => premise.nativeIntegerBits === right.premises[index]!.nativeIntegerBits &&
      premise.basis === right.premises[index]!.basis);
}
