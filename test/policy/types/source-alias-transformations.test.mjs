// Standard type transformations (NonNullable, Parameters, ReturnType, Pick ...) are evaluated by the Host: the alias
// descriptor IS the transformed type, and C# represents it (nextgen C-2542 §2, I6, R2). The deleted C# reference
// resolver (resolution/source-references.ts) re-ran the transformation over checker components; its protected
// behaviour (no native carrier is required for a discarded input) is now a property of the published descriptor.
import assert from "node:assert/strict";
import test from "node:test";
import { createTsonicPlugin as nodejsCapability } from "../../../../csharp-nodejs/dist/index.js";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { hostProgram, representationServices, representations, represented } from "../../representation/host-fixture.mjs";
import { csharpSourcePrimitiveTargetType, csharpStringTargetType, targetTypeRefEquals } from "../../../dist/target-model/types/index.js";

test("a transformed alias publishes only its result; discarded inputs need no native carrier", () => {
  const program = hostProgram(`
import type { int64 } from "@tsonic/core/types.js";
declare function opaque(value: symbol, extra: never): int64;
type Present = NonNullable<string | undefined>;
type Inputs = Parameters<(value: int64, label: string) => void>;
type Output = ReturnType<typeof opaque>;
export function present(value: Present): Present { return value; }
export function inputs(value: Inputs): Inputs { return value; }
export function output(value: Output): Output { return value; }
`);
  const at = representations(representationServices(program));
  const parameter = owner => program.ast.parameters(program.named(owner))[0];
  const present = program.slot(parameter("present"));
  assert.equal(present.kind === "string" || present.kind === "declared", true, "NonNullable keeps the string arm only");
  assert.equal(targetTypeRefEquals(represented(at.slot(parameter("present"))), csharpStringTargetType()), true);
  const tuple = represented(at.slot(parameter("inputs")));
  assert.equal(tuple.kind === "tuple" && tuple.elements.length === 2 &&
    targetTypeRefEquals(tuple.elements[0], csharpSourcePrimitiveTargetType("int64")) &&
    targetTypeRefEquals(tuple.elements[1], csharpStringTargetType()), true, "Parameters keeps the native int64 width");
  assert.equal(targetTypeRefEquals(represented(at.slot(parameter("output"))), csharpSourcePrimitiveTargetType("int64")), true,
    "ReturnType needs no carrier for the symbol and never inputs it discards");
});

test("provider-derived error aliases retain exact native components through unions and delegates", () => {
  const compiled = compileCsharpSource({
    surface: "js",
    capabilities: [nodejsCapability()],
    sourceText: `
      import type {
        TransportError, RequestFailure, NextControl, NextFunction,
        CloseCallback, ExactCallback, ExactArguments, ExactResult,
      } from "./contracts.js";
      export function transport(value: TransportError): TransportError { return value; }
      export function failure(value: RequestFailure): RequestFailure { return value; }
      export function control(value: NextControl): NextControl { return value; }
      export function next(value: NextFunction): NextFunction { return value; }
      export function close(value: CloseCallback): CloseCallback { return value; }
      export function exact(value: ExactCallback, arguments_: ExactArguments): ExactResult {
        return value(arguments_[0], arguments_[1]);
      }
    `,
    files: {
      "contracts.ts": `
        import type { Readable } from "node:stream";
        import type { int64 } from "@tsonic/core/types.js";
        export type TransportError = NonNullable<Parameters<Readable["destroy"]>[0]>;
        export type RequestFailure = Error | TransportError;
        export type NextControl = string | RequestFailure | null | undefined;
        export type NextFunction = (value?: NextControl) => void | Promise<void>;
        export type CloseCallback = (error?: RequestFailure) => void;
        export type ExactCallback = (value: int64, error?: TransportError) => int64;
        export type ExactArguments = Parameters<ExactCallback>;
        export type ExactResult = ReturnType<ExactCallback>;
      `,
    },
  });
  assertCsharpCompilationSucceeded(compiled);
  const generated = [...compiled.artifacts.values()].join("\n");
  assert.match(generated, /(?:System\.)?Exception transport\((?:System\.)?Exception value\)/u);
  assert.match(generated, /long exact\(/u);
  assert.doesNotMatch(generated, /source-alias-representation-unavailable|source-fact-dependent-type-transform|Convert\.ToDouble|DynamicInvoke|System\.Reflection/u);
});

test("provider method parameter projections survive an indirect tuple alias", () => {
  const compiled = compileCsharpSource({
    surface: "js",
    capabilities: [nodejsCapability()],
    sourceText: `
      import type { Readable } from "node:stream";
      type DestroyArguments = Parameters<Readable["destroy"]>;
      type TransportError = NonNullable<DestroyArguments[0]>;
      export function preserve(value: DestroyArguments): DestroyArguments { return value; }
      export function forward(value: TransportError): TransportError { return value; }
    `,
  });
  assertCsharpCompilationSucceeded(compiled);
  const generated = [...compiled.artifacts.values()].join("\n");
  assert.match(generated, /(?:System\.)?Exception forward\((?:System\.)?Exception value\)/u);
  assert.match(generated, /ValueTuple<(?:System\.)?Exception\?>/u);
});

test("provider-derived error union carriers do not depend on prior scalar alias resolution", () => {
  const declarations = {
    handlers: "export function handlers(values: Handler[]): Handler[] { return values; }",
    control: "export function control(value: NextControl): NextControl { return value; }",
    failure: "export function failure(value: RequestFailure): RequestFailure { return value; }",
    transport: "export function transport(value: TransportError): TransportError { return value; }",
  };
  for (const first of Object.keys(declarations)) {
    const order = [first, ...Object.keys(declarations).filter(name => name !== first)];
    const compiled = compileCsharpSource({
      surface: "js",
      capabilities: [nodejsCapability()],
      sourceText: `
        import type { Handler, NextControl, RequestFailure, TransportError } from "./contracts.js";
        ${order.map(name => declarations[name]).join("\n")}
      `,
      files: {
        "contracts.ts": `
          import type { Readable } from "node:stream";
          export type TransportError = NonNullable<Parameters<Readable["destroy"]>[0]>;
          export type RequestFailure = Error | TransportError;
          export type NextControl = string | RequestFailure | null | undefined;
          export type NextFunction = (value?: NextControl) => void | Promise<void>;
          export interface Handler { (next: NextFunction): void; }
        `,
      },
    });
    assertCsharpCompilationSucceeded(compiled);
    const generated = [...compiled.artifacts.values()].join("\n");
    assert.match(generated, /(?:System\.)?Exception failure\((?:System\.)?Exception value\)/u, first);
    assert.doesNotMatch(generated, /source-alias-representation-unavailable|source-fact-dependent-type-transform|DynamicInvoke|System\.Reflection/u, first);
  }
});
