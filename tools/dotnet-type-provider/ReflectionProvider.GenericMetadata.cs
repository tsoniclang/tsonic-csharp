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

    int[]? UnmanagedTypeParameterIndexes(Type type)
    {
        if (!type.IsValueType)
        {
            return null;
        }
        var rootParameters = type.GetGenericArguments()
            .Where(parameter => parameter.IsGenericParameter)
            .Select((parameter, index) => (parameter, index))
            .ToDictionary(item => item.parameter, item => item.index);
        var required = new HashSet<int>();
        return CollectUnmanagedRequirements(
                type,
                rootParameters,
                required,
                new HashSet<Type>())
            ? required.OrderBy(index => index).ToArray()
            : null;
    }

    static bool CollectUnmanagedRequirements(
        Type type,
        IReadOnlyDictionary<Type, int> rootParameters,
        ISet<int> required,
        ISet<Type> active)
    {
        type = UnwrapByRef(type);
        if (type.IsGenericParameter)
        {
            if (rootParameters.TryGetValue(type, out var index))
            {
                required.Add(index);
                return true;
            }
            return IsUnmanagedConstraint(type);
        }
        if (
            type.IsPointer ||
            type.IsFunctionPointer ||
            type.IsEnum ||
            type.IsPrimitive
        )
        {
            return true;
        }
        if (!type.IsValueType || !active.Add(type))
        {
            return false;
        }
        try
        {
            return type
                .GetFields(BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic)
                .All(field => CollectUnmanagedRequirements(
                    field.FieldType,
                    rootParameters,
                    required,
                    active));
        }
        finally
        {
            active.Remove(type);
        }
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
