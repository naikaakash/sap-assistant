using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Mvc;

namespace SapAssistant.Api.Endpoints;

public static class AccountEndpoints
{
    public static IEndpointRouteBuilder MapAccountEndpoints(this IEndpointRouteBuilder app, IConfiguration cfg, IHostEnvironment env)
    {
        var frontendBaseUrl = cfg["FrontendBaseUrl"] ?? "/";

        app.MapGet("/signin", ([FromQuery] string? returnUrl) =>
        {
            var safeReturnUrl = SafeReturnUrl(returnUrl, frontendBaseUrl);
            return Results.Challenge(
                new AuthenticationProperties { RedirectUri = safeReturnUrl },
                [OpenIdConnectDefaults.AuthenticationScheme]);
        }).ExcludeFromDescription();

        app.MapGet("/signout", () =>
            Results.SignOut(
                new AuthenticationProperties { RedirectUri = frontendBaseUrl },
                [CookieAuthenticationDefaults.AuthenticationScheme, OpenIdConnectDefaults.AuthenticationScheme]))
            .ExcludeFromDescription();

        app.MapGet("/api/me", (ClaimsPrincipal user) =>
        {
            if (user.Identity?.IsAuthenticated != true)
            {
                return Results.Unauthorized();
            }
            return Results.Ok(new
            {
                isAuthenticated = true,
                name = user.FindFirstValue("name") ?? user.Identity.Name,
                email = user.FindFirstValue("preferred_username")
                        ?? user.FindFirstValue(ClaimTypes.Email),
                provider = "microsoft",
            });
        }).WithName("Me");

        // Only redirect / in dev (where the SPA lives on a different port).
        // In prod the static-file middleware + SPA fallback serves index.html.
        if (env.IsDevelopment() || env.EnvironmentName == "Testing")
        {
            app.MapGet("/", () => Results.Redirect(frontendBaseUrl)).ExcludeFromDescription();
        }

        return app;
    }

    private static string SafeReturnUrl(string? candidate, string frontendBaseUrl)
    {
        if (string.IsNullOrWhiteSpace(candidate))
        {
            return frontendBaseUrl;
        }

        if (Uri.TryCreate(candidate, UriKind.Absolute, out var abs) &&
            Uri.TryCreate(frontendBaseUrl, UriKind.Absolute, out var feBase) &&
            abs.Host == feBase.Host)
        {
            return abs.ToString();
        }

        if (Uri.TryCreate(candidate, UriKind.Relative, out _))
        {
            return frontendBaseUrl.TrimEnd('/') + "/" + candidate.TrimStart('/');
        }

        return frontendBaseUrl;
    }
}
