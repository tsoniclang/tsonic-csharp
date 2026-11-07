// The C# target's ABI premise for native-int / native-uint (E24, N5). This module is its one owner: the processor
// architectures the C# target supports, and the premise of one build read from what the C# target resolves for that
// build (the generated project's RuntimeIdentifier, RuntimeIdentifiers and PlatformTarget properties). Never the
// machine running the compiler, never a provider data layout.
import type { SourceNativeIntegerBits, SourceNativeIntegerPremise, SourcePlatformFacts } from "@tsonic/target-api/source";
import type { CsharpProjectConfiguration } from "./model.js";

/** The .NET processor architectures the C# target supports, with their pointer width. */
export const csharpSupportedArchitectures: ReadonlyMap<string, SourceNativeIntegerBits> = new Map([
  ["x64", 64],
  ["arm64", 64],
]);

/** One architecture the build states, with the property that states it. */
export interface CsharpArchitectureStatement {
  readonly basis: string;
  readonly architecture: string;
}

export type CsharpRuntimeIdentifierState =
  | { readonly kind: "missing"; readonly reason: string }
  | { readonly kind: "stated"; readonly statements: readonly CsharpArchitectureStatement[] };

export interface CsharpPlatformSelection {
  /** What the build states about its architecture; `missing` when it states nothing tsonic resolves. */
  readonly runtimeIdentifier: CsharpRuntimeIdentifierState;
  /** The neutral premise the composition root passes to the Host (TargetCompilationSession.sourcePlatform()). */
  readonly premise: SourcePlatformFacts;
}

/**
 * The platform selection of one C# build. A stated architecture decides the width; a stated architecture outside the
 * supported set gives a `missing` premise (the C# target has no width for it); statements of different widths give a
 * `conflicting` premise. With no statement, the premise is the width every supported architecture shares.
 */
export function resolveCsharpPlatform(
  project: CsharpProjectConfiguration,
  properties: Readonly<Record<string, string | number | boolean>>,
): CsharpPlatformSelection {
  const runtimeIdentifier = csharpRuntimeIdentifierState(project, properties);
  return Object.freeze({
    runtimeIdentifier,
    premise: runtimeIdentifier.kind === "missing"
      ? csharpSupportedArchitecturePremise(runtimeIdentifier.reason)
      : csharpStatedArchitecturePremise(runtimeIdentifier.statements),
  });
}

function csharpRuntimeIdentifierState(
  project: CsharpProjectConfiguration,
  properties: Readonly<Record<string, string | number | boolean>>,
): CsharpRuntimeIdentifierState {
  if (project.kind === "user-owned") return Object.freeze({ kind: "missing",
    reason: `The user-owned project '${project.projectFile}' owns its runtime identifier; the C# target does not read it.` });
  const statements: CsharpArchitectureStatement[] = [];
  for (const [name, raw] of Object.entries(properties)) {
    const property = name.toLowerCase();
    const value = String(raw).trim();
    if (property === "runtimeidentifier") statements.push(runtimeIdentifierStatement(name, value));
    else if (property === "runtimeidentifiers") {
      for (const rid of value.split(";").map(entry => entry.trim()).filter(entry => entry.length > 0)) {
        statements.push(runtimeIdentifierStatement(name, rid));
      }
    } else if (property === "platformtarget" && value.toLowerCase() !== "anycpu") {
      statements.push(Object.freeze({ basis: `${name}=${value}`, architecture: value.toLowerCase() }));
    }
  }
  return statements.length === 0
    ? Object.freeze({ kind: "missing", reason: "The generated project states no RuntimeIdentifier, RuntimeIdentifiers or PlatformTarget." })
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
    const width = csharpSupportedArchitectures.get(statement.architecture);
    if (width === undefined) return Object.freeze({ kind: "missing",
      reason: `${statement.basis} names no architecture the C# target supports (${supportedArchitectureList()}).` });
    premises.push(Object.freeze({ nativeIntegerBits: width, basis: statement.basis }));
  }
  const widths = new Set(premises.map(premise => premise.nativeIntegerBits));
  if (widths.size > 1) return Object.freeze({ kind: "conflicting", premises: Object.freeze(premises) });
  return Object.freeze({ kind: "known", nativeIntegerBits: premises[0]!.nativeIntegerBits,
    basis: premises.map(premise => premise.basis).join("; ") });
}

/** The default the C# target guarantees when the build states no architecture: the width all supported ones share. */
function csharpSupportedArchitecturePremise(missingReason: string): SourcePlatformFacts {
  const widths = new Set(csharpSupportedArchitectures.values());
  if (widths.size !== 1) return Object.freeze({ kind: "missing",
    reason: `${missingReason} The supported C# architectures (${supportedArchitectureList()}) differ in width.` });
  return Object.freeze({ kind: "known", nativeIntegerBits: [...widths][0]!,
    basis: `${missingReason} Every architecture the C# target supports (${supportedArchitectureList()}) has this width.` });
}

function supportedArchitectureList(): string {
  return [...csharpSupportedArchitectures.keys()].join(", ");
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
