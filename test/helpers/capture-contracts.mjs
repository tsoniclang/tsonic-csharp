import { sourceCallableValueParameters } from "@tsonic/target-api/source";
import { getCsharpLambdaSignature } from "../../dist/target-model/types/carriers/delegates.js";
import { getCsharpMethodValue } from "../../dist/target-model/types/method-values.js";

export function createCaptureContractFixture(source, typeFor) {
  return Object.freeze({
    get(identity) {
      const declaration = identity.declaration;
      const type = typeFor(declaration);
      const method = getCsharpMethodValue(type);
      const signature = getCsharpLambdaSignature(method?.contract ?? type);
      const parameters = sourceCallableValueParameters(source.ast, declaration, source.semantics.forNode(declaration));
      if (signature === undefined || parameters === undefined) return undefined;
      return Object.freeze({ kind: "source", sourceDeclaration: declaration,
        nativeSignature: Object.freeze({ methodTypeParameterIdentities: method?.typeParameters ?? [],
          methodAllowsRefLikeTypeArguments: method?.allowsRefLikeTypeArguments ?? [] }),
        parameters,
        nativeParameters: signature.parameters.map((type, index) => ({ sourceParameter: parameters[index],
          targetParameter: { name: source.ast.text(source.ast.name(parameters[index])), type,
            passingMode: signature.parameterPassingModes[index],
            ...(signature.optionalParameterIndexes?.includes(index) === true ? { optional: true } : {}),
            ...(signature.restParameterIndex === index ? { paramsArray: true } : {}),
          } })),
        returnType: signature.returnType,
      });
    },
    closedInputType(declaration) {
      const type = typeFor(declaration);
      return getCsharpMethodValue(type) === undefined ? type : undefined;
    },
  });
}
