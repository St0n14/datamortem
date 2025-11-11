"""
Security headers middleware for FastAPI.
Adds security headers to all responses.
"""
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Middleware to add security headers to all responses.
    """
    
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        
        # Security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "no-referrer-when-downgrade"
        
        # Remove server header (security through obscurity)
        if "server" in response.headers:
            del response.headers["server"]
        
        # Strict Transport Security (only if HTTPS)
        # Note: Should be set by reverse proxy (Traefik/Nginx) in production
        # if request.url.scheme == "https":
        #     response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
        
        return response

