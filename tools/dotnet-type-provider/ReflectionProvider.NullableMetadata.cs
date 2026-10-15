using System.Reflection;

sealed partial class ReflectionProvider
{
    sealed record NullableMetadata(
        byte Annotation,
        NullableMetadata? ElementType,
        IReadOnlyList<NullableMetadata> GenericTypeArguments)
    {
        public bool AllowsSourceUndefined => Annotation == 2;

        public static NullableMetadata ForParameter(ParameterInfo parameter)
        {
            return Create(
                UnwrapByRef(parameter.ParameterType),
                parameter.GetCustomAttributesData(),
                NullableContextAnnotation(parameter.Member));
        }

        public static NullableMetadata ForProperty(PropertyInfo property)
        {
            return Create(
                property.PropertyType,
                property.GetCustomAttributesData(),
                NullableContextAnnotation(property));
        }

        public static NullableMetadata ForField(FieldInfo field)
        {
            return Create(
                field.FieldType,
                field.GetCustomAttributesData(),
                NullableContextAnnotation(field));
        }

        public static NullableMetadata ForEvent(EventInfo eventInfo)
        {
            return Create(
                eventInfo.EventHandlerType ?? throw new InvalidOperationException($"Event '{eventInfo.Name}' has no event handler type."),
                eventInfo.GetCustomAttributesData(),
                NullableContextAnnotation(eventInfo));
        }

        static NullableMetadata Create(
            Type type,
            IList<CustomAttributeData> attributes,
            byte contextAnnotation)
        {
            var annotations = NullableAnnotations(attributes);
            var reader = new NullableAnnotationReader(annotations, contextAnnotation);
            return Create(type, reader);
        }

        static NullableMetadata Create(Type type, NullableAnnotationReader reader)
        {
            var annotation = reader.Next();
            var elementType = type.HasElementType && type.GetElementType() is Type element
                ? Create(element, reader)
                : null;
            var genericTypeArguments = type.IsGenericType
                ? type.GetGenericArguments().Select(argument => Create(argument, reader)).ToArray()
                : Array.Empty<NullableMetadata>();
            return new NullableMetadata(annotation, elementType, genericTypeArguments);
        }

        static byte[]? NullableAnnotations(IList<CustomAttributeData> attributes)
        {
            var declarations = attributes
                .Where(attribute => attribute.AttributeType.FullName == "System.Runtime.CompilerServices.NullableAttribute")
                .ToArray();
            if (declarations.Length == 0)
            {
                return null;
            }
            if (declarations.Length != 1)
            {
                throw new InvalidOperationException("A reflected declaration contains multiple NullableAttribute annotations.");
            }
            var declaration = declarations[0];
            if (declaration.ConstructorArguments.Count != 1)
            {
                throw new InvalidOperationException("NullableAttribute must have exactly one constructor argument.");
            }
            var value = declaration.ConstructorArguments[0].Value;
            if (value is byte annotation)
            {
                ValidateNullableAnnotation(annotation);
                return [annotation];
            }
            if (value is IEnumerable<CustomAttributeTypedArgument> values)
            {
                var annotations = values.Select(argument => argument.Value is byte item
                    ? item
                    : throw new InvalidOperationException("NullableAttribute array entries must be bytes.")).ToArray();
                if (annotations.Length == 0)
                {
                    throw new InvalidOperationException("NullableAttribute array must not be empty.");
                }
                foreach (var item in annotations)
                {
                    ValidateNullableAnnotation(item);
                }
                return annotations;
            }
            throw new InvalidOperationException("NullableAttribute constructor argument must be a byte or byte array.");
        }

        static byte NullableContextAnnotation(MemberInfo member)
        {
            for (MemberInfo? current = member; current is not null; current = current.DeclaringType)
            {
                var annotation = DeclaredNullableContextAnnotation(current.GetCustomAttributesData());
                if (annotation is not null)
                {
                    return annotation.Value;
                }
            }
            var moduleAnnotation = DeclaredNullableContextAnnotation(member.Module.GetCustomAttributesData());
            if (moduleAnnotation is not null)
            {
                return moduleAnnotation.Value;
            }
            return DeclaredNullableContextAnnotation(member.Module.Assembly.GetCustomAttributesData()) ?? 0;
        }

        static byte? DeclaredNullableContextAnnotation(IList<CustomAttributeData> attributes)
        {
            var declarations = attributes
                .Where(attribute => attribute.AttributeType.FullName == "System.Runtime.CompilerServices.NullableContextAttribute")
                .ToArray();
            if (declarations.Length == 0)
            {
                return null;
            }
            if (declarations.Length != 1 ||
                declarations[0].ConstructorArguments.Count != 1 ||
                declarations[0].ConstructorArguments[0].Value is not byte annotation)
            {
                throw new InvalidOperationException("NullableContextAttribute must contain exactly one byte annotation.");
            }
            ValidateNullableAnnotation(annotation);
            return annotation;
        }

        static void ValidateNullableAnnotation(byte annotation)
        {
            if (annotation > 2)
            {
                throw new InvalidOperationException($"Unsupported nullable metadata annotation '{annotation}'.");
            }
        }
    }

    sealed class NullableAnnotationReader
    {
        readonly byte[]? annotations;
        readonly byte contextAnnotation;
        int index;

        public NullableAnnotationReader(byte[]? annotations, byte contextAnnotation)
        {
            this.annotations = annotations;
            this.contextAnnotation = contextAnnotation;
        }

        public byte Next()
        {
            if (annotations is null)
            {
                return contextAnnotation;
            }
            if (annotations.Length == 1)
            {
                return annotations[0];
            }
            return index < annotations.Length ? annotations[index++] : contextAnnotation;
        }
    }
}
