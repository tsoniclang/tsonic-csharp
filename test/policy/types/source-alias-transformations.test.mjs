import assert from "node:assert/strict";
import test from "node:test";
import { createTsonicPlugin as nodejsCapability } from "../../../../csharp-nodejs/dist/index.js";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { resolveTypeReferenceNode } from "../../../dist/policy/types/resolution/source-references.js";

test("checked component transformations do not require native carriers for discarded inputs", () => {
  const node = {};
  const name = {};
  const selectedType = {};
  const sourceFile = {};
  const component = { selectedType: {} };
  const carrier = { kind: "source-primitive", name: "int64" };
  for (const kind of ["component", "non-nullish", "parameter-list", "callable", "unresolved"]) {
    const transformation = { kind, component };
    const queries = {
      sourceFile,
      types: { authoredType: () => selectedType, standardTransformation: () => transformation },
      facts: { typeSubjects: () => [] },
    };
    let selections = 0;
    const result = resolveTypeReferenceNode({
      host: {
        ast: { as: { AsTypeReferenceNode: () => ({ TypeName: name }) },
          typeArguments: () => assert.fail("a checked projection must not resolve its discarded input carrier") },
        navigation: { sourceReferenceFor: () => undefined },
      },
      resolveDirectSourceFacts: () => undefined,
      resolveStandardSourceTypeTransformation: (actual, actualQueries, state, root, selected) => {
        selections += 1;
        assert.equal(actual === transformation, true, kind);
        assert.equal(actualQueries === queries, true, kind);
        assert.equal(root === node && selected === selectedType, true, kind);
        assert.equal(state.depth, 0, kind);
        return kind === "unresolved" ? undefined : carrier;
      },
    }, node, queries, { depth: 0 });
    assert.equal(result === (kind === "unresolved" ? undefined : carrier), true, kind);
    assert.equal(selections, 1, kind);
  }
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
