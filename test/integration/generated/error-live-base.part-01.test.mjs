import assert from "node:assert/strict";
import test from "node:test";
import { liveErrorBaseWriteSource, liveErrorMixedRecoverySource, liveErrorStorageFiles } from "../../../../tsonic/test/fixtures/live-error-storage.mjs";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { assertNativeErrorWriteRefusals } from "../../helpers/native-error-refusals.mjs";

for (const surface of Array.from([undefined, "js"]).slice(0, 1)) {
test(`live inherited Error storage survives base values and throw recovery in C# ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: liveErrorStorageFiles["index.ts"],
      files: { "failures.ts": liveErrorStorageFiles["failures.ts"] } });
    assertNativeErrorWriteRefusal(compiled);
  });

test(`writes through Error base values retain native field identity in C# ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: liveErrorBaseWriteSource });
    assertNativeErrorWriteRefusal(compiled);
  });

for (const projectError of Array.from([false, true]).slice(0, 2)) {
test(`sealed mixed throws retain writable ${projectError ? "project" : "native"} Error identity in C# ${surface ?? "native"}`, { timeout: 300_000 }, () => {
      const compiled = compileCsharpSource({ surface, sourceText: liveErrorMixedRecoverySource(projectError) });
      assertNativeErrorWriteRefusal(compiled, "caught");
    });
}
}

for (const surface of Array.from([undefined, "js"]).slice(1, 2)) {
test(`live inherited Error storage survives base values and throw recovery in C# ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: liveErrorStorageFiles["index.ts"],
      files: { "failures.ts": liveErrorStorageFiles["failures.ts"] } });
    assertNativeErrorWriteRefusal(compiled);
  });

test(`writes through Error base values retain native field identity in C# ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: liveErrorBaseWriteSource });
    assertNativeErrorWriteRefusal(compiled);
  });

for (const projectError of Array.from([false, true]).slice(0, 1)) {
test(`sealed mixed throws retain writable ${projectError ? "project" : "native"} Error identity in C# ${surface ?? "native"}`, { timeout: 300_000 }, () => {
      const compiled = compileCsharpSource({ surface, sourceText: liveErrorMixedRecoverySource(projectError) });
      assertNativeErrorWriteRefusal(compiled, "caught");
    });
}
}

function assertNativeErrorWriteRefusal(compiled, receiver = "error") {
  assertNativeErrorWriteRefusals(compiled, ["name", "message", "stack"].map(member => `${receiver}.${member}`));
}

for (const surface of ["native", "js"]) {
  test(`native ${surface} Error subclasses keep base, collection, throw and custom-field identity`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      class HttpError extends Error {
        readonly status: number;
        detail: string = "initial";
        constructor(status: number) { super("initial message"); this.status = status; this.name = "HttpError"; }
      }
      class RequestError extends HttpError {
        readonly route: string = "/protected";
        constructor() { super(403); }
      }
      class OrdinaryThrownValue { name = "HttpError"; message = "not an Error"; }
      class StoredError { constructor(readonly error: Error) {} }
      function throughBase(error: Error): Error { return error; }
      function throwBase(error: Error): void { throw error; }
      export function run(): boolean {
        const original = new RequestError();
        const base: Error = throughBase(original);
        const stored = new StoredError(base);
        const items: Error[] = [base];
        if (base !== original || stored.error !== original || items[0] !== original ||
            base.name !== "RequestError" || base.message !== "initial message" || base.stack !== undefined) return false;
        original.detail = "updated";
        let recovered = false;
        let finalized: number = 0;
        try {
          try { throwBase(base); }
          catch (caught) {
            if (!(caught instanceof Error) || caught !== original || caught.name !== "RequestError" ||
                caught.message !== "initial message") return false;
            original.detail = "live in catch";
            throw caught;
          } finally { finalized += 1; }
        } catch (caught) {
          if (caught instanceof RequestError) {
            recovered = caught === original && caught.status === 403 && caught.route === "/protected" &&
              caught.detail === "live in catch";
            caught.detail = "recovered";
          }
        }
        if (!recovered || finalized !== 1 || original.detail !== "recovered" || base !== original ||
            stored.error !== original || items[0] !== original) return false;
        const sibling = new HttpError(500);
        if (throughBase(sibling) === base || sibling.name !== "HttpError" || sibling.message !== "initial message") return false;
        let rejected = false;
        try { throw new OrdinaryThrownValue(); }
        catch (caught) {
          if (caught instanceof Error) return false;
          if (caught instanceof OrdinaryThrownValue) rejected = caught.message === "not an Error";
        }
        const builtin = new Error("unchanged native Error");
        return rejected && builtin.stack === undefined && builtin.name === "Exception" &&
          builtin.message === "unchanged native Error";
      }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `native-error-subclass-identity-${surface}`);
  });
}
