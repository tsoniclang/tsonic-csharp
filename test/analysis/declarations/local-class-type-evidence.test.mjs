import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles, formatDiagnostics } from "@tsonic/tsts";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { projectTypeDefinition } from "../../../dist/policy/types/project/project-types.js";

test("local class catalogs require exact outer type-parameter evidence", () => {
  const checked = createCompilerSessionFromFiles({
    currentDirectory: "/project",
    files: { "/project/index.ts": `
      function factory<Outer>(outer: Outer) {
        return class Box<Inner> {
          value: Inner;
          constructor(value: Inner) { this.value = value; }
          read(): Outer { return outer; }
        };
      }
    ` },
    compilerOptions: { strict: true, target: "es2022", module: "esnext" },
  }).checkSource();
  assert.equal(checked.diagnostics.length, 0, formatDiagnostics(checked.diagnostics));
  const source = createTargetSourceProgram(checked);
  let declaration;
  const visit = node => {
    if (source.ast.is.IsClassExpression(node)) declaration = node;
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  const sourceFile = checked.getSourceFile("/project/index.ts");
  assert.ok(sourceFile);
  visit(sourceFile);
  assert.ok(declaration);
  const semantics = source.semantics.forNode(declaration);
  const host = { ast: source.ast, navigation: source.navigation, semanticsFor: () => semantics };
  const definition = projectTypeDefinition(host, declaration);
  assert.ok(definition);
  assert.equal(definition.outerTypeParameters.length, 1);
  assert.equal(definition.sourceTypeParameterCount, 1);
  assert.equal(definition.typeParameterNames.length, 2);
  assert.equal(projectTypeDefinition({ ...host, semanticsFor: () => ({ ...semantics,
    declarations: { ...semantics.declarations, declaredType: () => undefined },
  }) }, declaration), undefined);
  assert.equal(projectTypeDefinition({ ...host, semanticsFor: () => ({ ...semantics,
    types: { ...semantics.types, typeArgumentBindings: () => undefined },
  }) }, declaration), undefined);
});
