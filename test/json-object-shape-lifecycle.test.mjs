import { test } from "node:test";
import assert from "node:assert/strict";
import {
  selectedTargetSignatureFactKey,
} from "@tsonic/tsts";
import {
  csharpJsonSerializableShapeFactKey,
  csharpObjectShapeFactKey,
  csharpTargetOperationFactKey,
} from "../dist/source/csharp-facts.js";
import {
  collectNodesByKind,
  createCsharpSession,
  formatDiagnostics,
} from "./surface-boundary.helpers.mjs";

test("JSON finalization closes every structurally identical implementation of an interface-backed object shape", () => {
  const session = createCsharpSession(`
    export interface Todo {
      id: number;
      title: string;
      completed: boolean;
    }

    export function createTodos(): Todo[] {
      const first: Todo = { id: 1, title: "first", completed: false };
      const second: Todo = { id: 2, title: "second", completed: true };
      return [first, second];
    }

    export function encode(values: Todo[]): string {
      return JSON.stringify(values);
    }
  `, { selectedSurfaces: [{ id: "js" }], typescriptCompatibility: "compat" });
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const extensionHost = session.finalizeExtensions();
  const objectLiterals = collectNodesByKind(sourceFile, session.ast, "KindObjectLiteralExpression");
  const shapes = objectLiterals.map((node) => extensionHost.facts.get(node, csharpObjectShapeFactKey));
  const stringifyCall = collectNodesByKind(sourceFile, session.ast, "KindCallExpression")
    .find((call) => extensionHost.facts.get(call, selectedTargetSignatureFactKey)?.member.id.startsWith("Tsonic.CSharp.Js.JSON.stringify:"));

  assert.equal(objectLiterals.length, 2);
  assert.ok(shapes[0]);
  assert.ok(shapes[1]);
  assert.equal(shapes[0].targetType, shapes[1].targetType);
  assert.equal(extensionHost.facts.get(shapes[0].targetType, csharpJsonSerializableShapeFactKey)?.kind, "closed-object-shape");
  assert.match(extensionHost.facts.get(stringifyCall, csharpTargetOperationFactKey)?.operationId ?? "", /^Tsonic\.CSharp\.Js\.JSON\.stringify:/u);
  assert.equal(extensionHost.diagnostics.all().map((diagnostic) => diagnostic.extensionCode).join("\n"), "");
});

test("generic call argument conversion makes an object literal implement the selected source interface", () => {
  const session = createCsharpSession(`
    export interface Payload {
      value: string;
    }

    function identity<T>(value: T): T {
      return value;
    }

    export function create(): Payload {
      return identity<Payload>({ value: "closed" });
    }
  `);
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const extensionHost = session.finalizeExtensions();
  const objectLiteral = collectNodesByKind(sourceFile, session.ast, "KindObjectLiteralExpression")[0];
  const shape = extensionHost.facts.get(objectLiteral, csharpObjectShapeFactKey);

  assert.ok(shape);
  assert.equal(shape.implements?.length, 1);
  assert.equal(shape.implements[0]?.kind, "target-named");
  assert.equal(shape.implements[0]?.id, "Payload");
  assert.equal(extensionHost.diagnostics.all().map((diagnostic) => diagnostic.extensionCode).join("\n"), "");
});
