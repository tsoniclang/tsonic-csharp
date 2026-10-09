using System.Linq.Expressions;

namespace ExpressionFixtures;

public static class ExpressionHost
{
    private static int recorded;

    public static void Record(int value) => recorded = value;

    public static int Observe(Expression<Action<int>> selector, int value)
    {
        if (selector.Body is not MethodCallExpression) throw new InvalidOperationException("original quoted void call");
        selector.Compile()(value);
        return recorded;
    }

    public static int Add(Expression<Func<int, int>> selector, int value)
    {
        if (selector.Body is not BinaryExpression { NodeType: ExpressionType.Add } body ||
            body.Left != selector.Parameters[0]) throw new InvalidOperationException("original quoted addition body");
        return selector.Compile()(value);
    }

    public static Expression<Func<int, bool>> Predicate(Expression<Func<int, bool>> predicate)
    {
        if (predicate.Body is not BinaryExpression { NodeType: ExpressionType.GreaterThan })
            throw new InvalidOperationException("original quoted predicate body");
        return predicate;
    }

    public static bool Test(Expression<Func<int, bool>> predicate, int value) => predicate.Compile()(value);

    public static T Identity<T>(Expression<Func<T, T>> selector, T value)
    {
        if (selector.Body != selector.Parameters[0]) throw new InvalidOperationException("original generic parameter body");
        return selector.Compile()(value);
    }

    public static bool IsAbsent(Expression<Func<int, int>>? selector) => selector is null;

    public static void Async(Expression<Func<int, Task<int>>> selector) { }

    public static void AsyncAction(Expression<Action<int>> selector) { }

    public static bool HasDirectCapture(Expression<Func<int, bool>> predicate) =>
        predicate.Body is BinaryExpression { Right: MemberExpression { Expression: ConstantExpression } };
}
