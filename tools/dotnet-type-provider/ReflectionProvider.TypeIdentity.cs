using System.Reflection;

sealed partial class ReflectionProvider
{
    static bool IsRuntimeType(Type type, Type runtimeType)
    {
        if (type.IsGenericType && !type.IsGenericTypeDefinition && runtimeType.IsGenericTypeDefinition)
        {
            type = type.GetGenericTypeDefinition();
        }
        return StringComparer.Ordinal.Equals(type.FullName, runtimeType.FullName) &&
            StringComparer.Ordinal.Equals(type.Assembly.GetName().Name, runtimeType.Assembly.GetName().Name);
    }

    static bool IsAssignableToRuntimeType(Type type, Type runtimeType)
    {
        if (runtimeType.IsInterface)
        {
            return type.GetInterfaces().Any(candidate => IsRuntimeType(candidate, runtimeType));
        }
        for (var candidate = type; candidate is not null; candidate = candidate.BaseType)
        {
            if (IsRuntimeType(candidate, runtimeType))
            {
                return true;
            }
        }
        return false;
    }

    static bool HasRuntimeAttribute(MemberInfo member, Type runtimeAttributeType)
    {
        return member.GetCustomAttributesData().Any(attribute => IsRuntimeType(attribute.AttributeType, runtimeAttributeType));
    }

    static bool HasRuntimeAttribute(ParameterInfo parameter, Type runtimeAttributeType)
    {
        return parameter.GetCustomAttributesData().Any(attribute => IsRuntimeType(attribute.AttributeType, runtimeAttributeType));
    }

    static Type EnumUnderlyingType(Type enumType)
    {
        return enumType.GetField("value__", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic)?.FieldType
            ?? throw new InvalidOperationException($"Enum type '{enumType.FullName ?? enumType.Name}' has no metadata-backed underlying field.");
    }

    static string? EnumFieldName(Type enumType, Type underlyingType, object value)
    {
        var expected = SourcePrimitiveDefaultValue(underlyingType, value);
        if (expected is null)
        {
            return null;
        }
        return enumType
            .GetFields(BindingFlags.Public | BindingFlags.Static)
            .Where(field => field.IsLiteral)
            .FirstOrDefault(field =>
            {
                var rawValue = field.GetRawConstantValue();
                return rawValue is not null && Equals(SourcePrimitiveDefaultValue(underlyingType, rawValue), expected);
            })
            ?.Name;
    }
}
