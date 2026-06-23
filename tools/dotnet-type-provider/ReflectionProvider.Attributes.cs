using System.Collections.Concurrent;
using System.Globalization;
using System.Reflection;
using System.Runtime.Loader;
using System.Text.Json;
using System.Text.Json.Serialization;

sealed partial class ReflectionProvider
{
    sealed class AttributeCollection
    {
        public object[] Supported { get; }
        public object[] Unsupported { get; }

        public AttributeCollection(object[] supported, object[] unsupported)
        {
            Supported = supported;
            Unsupported = unsupported;
        }
    }

    AttributeCollection AttributeFacts(IList<CustomAttributeData> attributes, string target, string ownerId)
    {
        var supported = new List<object>();
        var unsupported = new List<object>();
        for (var index = 0; index < attributes.Count; index++)
        {
            var attribute = attributes[index];
            var id = $"{ownerId}#attribute:{index}:{ConstructorId(attribute.Constructor)}";
            var attributeType = TypeRef(attribute.AttributeType);
            var constructorId = ConstructorId(attribute.Constructor);
            var arguments = AttributeArguments(attribute, out var unsupportedReason);
            if (attributeType is null || unsupportedReason is not null)
            {
                unsupported.Add(new
                {
                    id,
                    target,
                    attributeType,
                    constructorId,
                    reason = attributeType is null
                        ? "Attribute type cannot be represented as closed .NET target type facts."
                        : unsupportedReason,
                    evidence = new[] { new { message = $"Reflected from .NET custom attribute '{attribute.AttributeType.FullName ?? attribute.AttributeType.Name}'." } },
                });
                continue;
            }
            supported.Add(new
            {
                id,
                target,
                attributeType,
                constructorId,
                arguments = arguments.Length == 0 ? null : arguments,
                evidence = new[] { new { message = $"Reflected from .NET custom attribute '{attribute.AttributeType.FullName ?? attribute.AttributeType.Name}'." } },
            });
        }
        return new AttributeCollection(supported.ToArray(), unsupported.ToArray());
    }

    object[] AttributeArguments(CustomAttributeData attribute, out string? unsupportedReason)
    {
        var arguments = new List<object>();
        for (var index = 0; index < attribute.ConstructorArguments.Count; index++)
        {
            var value = AttributeValue(attribute.ConstructorArguments[index], out unsupportedReason);
            if (value is null)
            {
                unsupportedReason = $"Attribute constructor argument {index} cannot be represented as a closed target attribute value. {unsupportedReason}";
                return Array.Empty<object>();
            }
            arguments.Add(new
            {
                kind = "constructor",
                value,
            });
        }
        foreach (var namedArgument in attribute.NamedArguments.OrderBy(argument => argument.MemberName, StringComparer.Ordinal))
        {
            var value = AttributeValue(namedArgument.TypedValue, out unsupportedReason);
            if (value is null)
            {
                unsupportedReason = $"Attribute named argument '{namedArgument.MemberName}' cannot be represented as a closed target attribute value. {unsupportedReason}";
                return Array.Empty<object>();
            }
            arguments.Add(new
            {
                kind = "named",
                name = namedArgument.MemberName,
                memberKind = namedArgument.IsField ? "field" : "property",
                value,
            });
        }
        unsupportedReason = null;
        return arguments.ToArray();
    }

    object? AttributeValue(CustomAttributeTypedArgument argument, out string? unsupportedReason)
    {
        if (argument.Value is null)
        {
            unsupportedReason = null;
            return new { kind = "null" };
        }
        var argumentType = argument.ArgumentType;
        if (argumentType.IsArray)
        {
            if (argument.Value is not IReadOnlyCollection<CustomAttributeTypedArgument> elements)
            {
                unsupportedReason = $"Attribute array value for '{argumentType.FullName}' was not exposed as typed attribute arguments.";
                return null;
            }
            var values = new List<object>();
            var index = 0;
            foreach (var element in elements)
            {
                var value = AttributeValue(element, out unsupportedReason);
                if (value is null)
                {
                    unsupportedReason = $"Array element {index} cannot be represented. {unsupportedReason}";
                    return null;
                }
                values.Add(value);
                index++;
            }
            unsupportedReason = null;
            return new { kind = "array", elements = values.ToArray() };
        }
        if (argumentType == typeof(string) && argument.Value is string stringValue)
        {
            unsupportedReason = null;
            return new { kind = "string", value = stringValue };
        }
        if (argumentType == typeof(Type) && argument.Value is Type typeValue)
        {
            var typeRef = TypeRef(typeValue);
            if (typeRef is null)
            {
                unsupportedReason = $"Type attribute value '{typeValue.FullName ?? typeValue.Name}' cannot be represented as closed .NET target type facts.";
                return null;
            }
            unsupportedReason = null;
            return new { kind = "type", type = typeRef };
        }
        if (argumentType.IsEnum)
        {
            return AttributeEnumValue(argumentType, argument.Value, out unsupportedReason);
        }
        var primitiveName = SourcePrimitiveName(argumentType);
        if (primitiveName is not null)
        {
            var primitiveValue = SourcePrimitiveDefaultValue(argumentType, argument.Value);
            if (primitiveValue is null)
            {
                unsupportedReason = $"Source primitive attribute value '{argumentType.FullName}' cannot be serialized deterministically.";
                return null;
            }
            unsupportedReason = null;
            return new { kind = "source-primitive", name = primitiveName, value = primitiveValue };
        }
        unsupportedReason = $"Attribute value type '{argumentType.FullName ?? argumentType.Name}' is outside the supported .NET attribute value set.";
        return null;
    }

    object? AttributeEnumValue(Type enumType, object value, out string? unsupportedReason)
    {
        var enumTypeRef = TypeRef(enumType);
        if (enumTypeRef is null)
        {
            unsupportedReason = $"Enum attribute value type '{enumType.FullName ?? enumType.Name}' cannot be represented as closed .NET target type facts.";
            return null;
        }
        var underlyingType = Enum.GetUnderlyingType(enumType);
        var underlyingValue = Convert.ChangeType(value, underlyingType, CultureInfo.InvariantCulture);
        if (underlyingValue is null)
        {
            unsupportedReason = $"Enum attribute value '{enumType.FullName ?? enumType.Name}' has no deterministic underlying value.";
            return null;
        }
        var enumValue = Enum.ToObject(enumType, underlyingValue);
        unsupportedReason = null;
        return new
        {
            kind = "enum",
            type = enumTypeRef,
            value = Convert.ToString(underlyingValue, CultureInfo.InvariantCulture),
            fieldName = Enum.GetName(enumType, enumValue),
        };
    }
}
