using System.Collections.Concurrent;
using System.Reflection;
using System.Runtime.Loader;
using System.Text.Json;
using System.Text.Json.Serialization;

sealed partial class ReflectionProvider
{
    object[] TypeParameters(Type type)
    {
        return !type.IsGenericTypeDefinition
            ? Array.Empty<object>()
            : type.GetGenericArguments().Where(parameter => parameter.IsGenericParameter).Select(parameter => TypeParameter(parameter)).ToArray();
    }

    object[] MethodTypeParameters(MethodInfo method, GenericParameterContext? genericParameters = null)
    {
        genericParameters ??= GenericParameterContext.Empty;
        return !method.IsGenericMethodDefinition
            ? Array.Empty<object>()
            : method.GetGenericArguments()
                .Where(parameter => parameter.IsGenericParameter && !genericParameters.IsOmitted(parameter))
                .Select(parameter => TypeParameter(parameter, genericParameters))
                .ToArray();
    }

    object[] ImplementedContracts(Type type)
    {
        return type.GetInterfaces()
            .OrderBy(MetadataName, StringComparer.Ordinal)
            .Select(contract => TypeRef(contract))
            .Where(contract => contract is not null)
            .Select(contract => new { kind = "implements", contract })
            .ToArray();
    }

    object[] UnsupportedImplementedContracts(Type type)
    {
        return type.GetInterfaces()
            .OrderBy(MetadataName, StringComparer.Ordinal)
            .Where(contract => TypeRef(contract) is null)
            .Select(contract => new
            {
                targetId = TargetId(contract),
                metadataName = MetadataName(contract),
                reason = $"Implemented contract type '{TypeMetadataName(contract)}' cannot be represented as closed .NET target type facts. {TypeRefFailureReason(contract)}",
            })
            .ToArray();
    }

    object TypeParameter(Type parameter, GenericParameterContext? genericParameters = null)
    {
        genericParameters ??= GenericParameterContext.Empty;
        var constraints = new List<object>();
        var attributes = parameter.GenericParameterAttributes;
        if ((attributes & GenericParameterAttributes.ReferenceTypeConstraint) != 0)
        {
            constraints.Add(new { kind = "reference-type" });
        }
        if ((attributes & GenericParameterAttributes.NotNullableValueTypeConstraint) != 0)
        {
            constraints.Add(new { kind = IsUnmanagedConstraint(parameter) ? "unmanaged" : "value-type" });
        }
        if ((attributes & (GenericParameterAttributes.ReferenceTypeConstraint | GenericParameterAttributes.NotNullableValueTypeConstraint)) == 0 && IsNotNullConstraint(parameter))
        {
            constraints.Add(new { kind = "not-null" });
        }
        if ((attributes & GenericParameterAttributes.DefaultConstructorConstraint) != 0 && !IsUnmanagedConstraint(parameter))
        {
            constraints.Add(new { kind = "constructible" });
        }
        var unsupportedConstraints = new List<object>();
        foreach (var constraint in parameter.GetGenericParameterConstraints())
        {
            if (IsRuntimeType(constraint, typeof(ValueType)))
            {
                continue;
            }
            var contract = TypeRef(constraint, genericParameters: genericParameters);
            if (contract is not null)
            {
                constraints.Add(new { kind = "implements", contract });
                continue;
            }
            unsupportedConstraints.Add(new
            {
                targetId = TargetId(constraint),
                metadataName = MetadataName(constraint),
                reason = $"Generic constraint type '{TypeMetadataName(constraint)}' cannot be represented as closed .NET target type facts. {TypeRefFailureReason(constraint)}",
            });
        }
        return new
        {
            name = genericParameters.SourceName(parameter),
            constraints = constraints.Count == 0 ? null : constraints,
            unsupportedConstraints = unsupportedConstraints.Count == 0 ? null : unsupportedConstraints,
            variance = Variance(parameter),
        };
    }

    static bool IsUnmanagedConstraint(Type parameter)
    {
        return parameter.GetCustomAttributesData().Any(attribute =>
            attribute.AttributeType.FullName == "System.Runtime.CompilerServices.IsUnmanagedAttribute");
    }

    static bool IsNotNullConstraint(Type parameter)
    {
        return parameter.GetCustomAttributesData().Any(attribute =>
            attribute.AttributeType.FullName == "System.Runtime.CompilerServices.NullableAttribute" &&
            attribute.ConstructorArguments.Count == 1 &&
            attribute.ConstructorArguments[0].Value is byte flag &&
            flag == 1);
    }

    static string? Variance(Type parameter)
    {
        var variance = parameter.GenericParameterAttributes & GenericParameterAttributes.VarianceMask;
        return variance switch
        {
            GenericParameterAttributes.Covariant => "out",
            GenericParameterAttributes.Contravariant => "in",
            _ => null,
        };
    }

}
