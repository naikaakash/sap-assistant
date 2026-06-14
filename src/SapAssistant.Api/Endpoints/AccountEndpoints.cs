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

        app.MapGet("/signin", ([FromQuery] string? returnUrl, HttpContext http, ILoggerFactory loggerFactory) =>
        {
            var logger = loggerFactory.CreateLogger("SapAuth.Signin");
            var safeReturnUrl = SafeReturnUrl(returnUrl, frontendBaseUrl);

            var incomingCookies = string.Join(",", http.Request.Cookies.Keys);
            logger.LogInformation(
                "/signin entered. IsAuthenticated={Auth} ReturnUrl={Ret} IncomingCookies=[{Cookies}]",
                http.User.Identity?.IsAuthenticated == true,
                safeReturnUrl,
                incomingCookies);

            // If the user already has a valid session, do NOT issue a fresh OIDC
            // challenge. Every challenge sets a new Correlation+Nonce cookie pair;
            // repeated re-entry piles up stale cookies and can push a domain past
            // its browser cookie quota, silently dropping the cookies the new
            // flow needs. Just send the user to their destination.
            if (http.User.Identity?.IsAuthenticated == true)
            {
                logger.LogInformation("/signin short-circuit: already authenticated, redirecting to {Ret}", safeReturnUrl);
                return Results.Redirect(safeReturnUrl);
            }

            logger.LogInformation("/signin issuing OIDC challenge with RedirectUri={Ret}", safeReturnUrl);
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

        // Only register the dev-mode root redirect when the SPA lives on a
        // different origin (Aspire dev: FrontendBaseUrl=http://localhost:5173).
        // If FrontendBaseUrl is "/" or a relative path, the SPA is served from
        // wwwroot/ on this same origin and the static-file middleware handles
        // `/` -> index.html. Redirecting `/` -> `/` here would cause
        // ERR_TOO_MANY_REDIRECTS.
        if ((env.IsDevelopment() || env.EnvironmentName == "Testing")
            && Uri.TryCreate(frontendBaseUrl, UriKind.Absolute, out _))
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
