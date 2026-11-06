import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";

for (const surface of ["native", "js"]) {
  for (const order of ["getter-first", "setter-first", "getter-only"]) {
    test(`${surface} published ${order} members retain their complete original accessor declarations`, () => {
      const getter = "get value(): string { return backing; }";
      const setter = "set value(next: string) { backing = next; }";
      const accessors = order === "getter-first" ? [getter, setter] : order === "setter-first" ? [setter, getter] : [getter];
      const compiled = compileCsharpSource({ surface, sourceText: `
        export function read(): string {
          let backing = "present";
          const original = { ${accessors.join(",")} };
          return original.value;
        }
      ` });
      assertCsharpCompilationSucceeded(compiled);
      const source = compiled.result.program.source;
      const declaration = source.navigation.nodes.find(node => source.ast.is.IsVariableDeclaration(node) &&
        source.ast.text(source.ast.name(node)) === "original");
      const literal = declaration === undefined ? undefined : source.ast.as.AsVariableDeclaration(declaration)?.Initializer;
      assert.equal(literal !== undefined && source.ast.is.IsObjectLiteralExpression(literal), true,
        "the exact original allocation is present");
      const properties = source.ast.properties(literal);
      const expected = properties.filter(node => source.ast.is.IsGetAccessorDeclaration(node) ||
        source.ast.is.IsSetAccessorDeclaration(node));
      const shape = compiled.result.program.objectShapes.resolveNode(literal);
      assert.equal(shape?.members.length === 1 && expected.length === accessors.length, true);
      const member = shape.members[0];
      assert.equal(expected.every(node => member.sourceDeclarations?.includes(node) === true), true,
        "correspondence enrichment never discards an established getter or setter identity");
      assert.equal(member.accessor?.getter === true && member.accessor.setter === (order !== "getter-only"), true,
        "the unchanged exact accessor contract is retained");
    });
  }
}
