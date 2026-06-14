using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Mvc;

namespace SapAssistant.Api.Endpoints;

/// <summary>
/// Test-only auth endpoints. ONLY registered when auth is disabled (Auth:Disable=true
/// or env=Testing). Used by Playwright/xUnit to fake a signed-in user without going
/// through the real Microsoft OIDC dance.
///
/// Safe by construction: the registration site (Program.cs) checks the same gate
/// before calling MapTestAuthEndpoints, so these routes do not exist at all in prod.
/// </summary>
public static class TestAuthEndpoints
{
    public sealed record TestSignInRequest(string? Email, string? Name);

    public static IEndpointRouteBuilder MapTestAuthEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/test/signin", async (HttpContext ctx, [FromBody] TestSignInRequest? body) =>
        {
            var email = body?.Email ?? "test.user@example.com";
            var name = body?.Name ?? "Test User";

            var claims = new[]
            {
                new Claim("name", name),
                new Claim("preferred_username", email),
                new Claim(ClaimTypes.NameIdentifier, $"test|{email}"),
            };
            var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
            await ctx.SignInAsync(
                CookieAuthenticationDefaults.AuthenticationScheme,
                new ClaimsPrincipal(identity));

            return Results.Ok(new { signedInAs = email, name });
        }).ExcludeFromDescription();

        app.MapPost("/api/test/signout", async (HttpContext ctx) =>
        {
            await ctx.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return Results.Ok();
        }).ExcludeFromDescription();

        return app;
    }
}
