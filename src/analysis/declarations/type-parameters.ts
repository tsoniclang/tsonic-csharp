import type { AstReader, Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant, type TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/program/source-evidence.js";
import { csharpSourceTypeParameter } from "../../source/extension/type-parameters.js";
import { createCsharpTypeParameterEmissionProducer } from "../program/records/types/type-parameters.js";

export function analyzeCsharpTypeParameterEmission(input: { readonly ast: AstReader; readonly nodes: readonly Node[];
  readonly evidence: CsharpSourceEvidenceIndex; readonly admitted: (node: Node) => boolean }) {
  const producer = createCsharpTypeParameterEmissionProducer();
  const issues: TargetDiagnostic[] = [];
  for (const node of new Set(input.nodes)) {
    if (!input.ast.is.IsTypeParameterDeclaration(node)) continue;
    const owner = input.ast.parent(node);
    if (owner === undefined || !input.admitted(owner) || typeLevelOwner(input.ast, owner)) continue;
    const declaration = input.ast.as.AsTypeParameterDeclaration(node);
    const parameter = csharpSourceTypeParameter(node, input.ast);
    const name = input.ast.name(node);
    if (declaration === undefined || parameter === undefined || name === undefined)
      failTargetAnalysisInvariant("tsonic-csharp", "An admitted generic parameter requires its exact checked identity.", node);
    const resolution = input.evidence.typeParameterConstraints.get(node);
    if (resolution === undefined)
      failTargetAnalysisInvariant("tsonic-csharp", "An admitted generic parameter requires its finalized native constraint classification.", node);
    if (declaration.Expression !== undefined) {
      issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: node,
        message: "Expression-based generic type parameters are outside the current C# planning surface." });
      continue;
    }
    if (resolution.kind === "unsupported") {
      issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: declaration.Constraint ?? node, message: resolution.reason });
      continue;
    }
    producer.publish(node, { identity: parameter.identity, name, constraints: resolution.constraints });
  }
  return Object.freeze({ records: producer.seal(), issues: Object.freeze(issues) });
}

const typeLevelOwnerKinds = new Set(["KindTypeAliasDeclaration", "KindMappedType", "KindInferType", "KindFunctionType",
  "KindConstructorType"]);
const signatureKinds = new Set(["KindCallSignature", "KindConstructSignature", "KindMethodSignature"]);

/** A type parameter declared on a type-level construct has no native C# generic declaration (C# has no generic alias,
 * mapped or conditional types, and a type-literal signature is erased into its carrier), so it needs no native
 * constraint. Interface members keep theirs: interfaces are emitted. */
function typeLevelOwner(ast: AstReader, owner: Node): boolean {
  const kind = ast.kindName(owner);
  if (typeLevelOwnerKinds.has(kind)) return true;
  return signatureKinds.has(kind) && ast.parent(owner) !== undefined && ast.kindName(ast.parent(owner)!) === "KindTypeLiteral";
}
