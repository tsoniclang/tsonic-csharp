import { createHash } from "node:crypto";
import type { AstReader, Node } from "@tsonic/tsts";
import { sourceLexicalCaptures } from "@tsonic/target-api/source";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact } from "../../../../target-model/types/model.js";
import type { CsharpObjectShapePolicyHost } from "./model.js";
import type { CsharpTypeResolutionState } from "../../resolution/model.js";
import { nextState } from "../../resolution/state.js";

export function csharpObjectShapeMethodDeclaration(
  shape: CsharpObjectShapeFact,
  member: CsharpObjectShapeMemberFact,
  ast: AstReader,
): Node | undefined {
  const literal = shape.methodImplementation?.declaration;
  if (literal === undefined) return undefined;
  const declarations = (member.sourceDeclarations ?? []).filter(declaration =>
    ast.is.IsMethodDeclaration(declaration) && ast.parent(declaration) === literal && ast.body(declaration) !== undefined);
  return declarations.length === 1 ? declarations[0] : undefined;
}

export function selectCsharpObjectMethodImplementation(
  members: readonly CsharpObjectShapeMemberFact[],
  host: CsharpObjectShapePolicyHost,
  state: CsharpTypeResolutionState,
  selectedLiteral?: Node,
): CsharpObjectShapeFact["methodImplementation"] | undefined {
  const methods = members.flatMap(member => (member.typeParameters?.length ?? 0) === 0 && member.optional !== true ? []
    : (member.sourceDeclarations ?? []).filter(declaration => host.ast.is.IsMethodDeclaration(declaration) &&
      host.ast.body(declaration) !== undefined && host.ast.is.IsObjectLiteralExpression(host.ast.parent(declaration)!) &&
      (selectedLiteral === undefined || host.ast.parent(declaration) === selectedLiteral)));
  if (methods.length === 0) return undefined;
  const literal = host.ast.parent(methods[0]!);
  if (literal === undefined || methods.some(method => host.ast.parent(method) !== literal)) return undefined;
  const selected = sourceLexicalCaptures(literal, methods, host.ast, host.navigation);
  const names = new Set(members.map(member => member.targetName));
  const captures = selected.captures.filter(capture => host.callOnlyAlias(capture.declaration) === undefined).map((capture, index) => {
    const reference = capture.references[0];
    const type = host.typeResolver.resolveNode(capture.declaration, host.ast.getSourceFile(capture.declaration), nextState(state));
    if (reference === undefined || type === undefined) return undefined;
    let fieldName = `__tsonic_capture${index}`;
    while (names.has(fieldName)) fieldName += "_";
    names.add(fieldName);
    return Object.freeze({ declaration: capture.declaration, reference, fieldName, type,
      mutable: host.navigation.declarationUseSummary(capture.declaration).bindingWritten,
    });
  });
  if (captures.some(capture => capture === undefined)) return undefined;
  const file = host.ast.getSourceFile(literal);
  const identity = createHash("sha256").update(JSON.stringify([
    host.ast.getFileName(file), host.ast.pos(literal), host.ast.end(literal),
  ])).digest("hex");
  return Object.freeze({ declaration: literal, identity,
    captures: Object.freeze(captures as NonNullable<typeof captures[number]>[]),
  });
}
