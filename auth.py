"""
auth.py - Supabase JWT verification and authorization

Production-grade authentication module for Fit.AI using Supabase Auth.

Security guarantees:
- Never trusts client-provided user_id
- Verifies JWT signature on every request
- Extracts user identity from token claims
- Enforces role-based access control (RBAC)
"""
from __future__ import annotations

from dotenv import load_dotenv
load_dotenv()
import os
from typing import Optional

import jwt
from fastapi import HTTPException, Security, Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from utils import get_logger

logger = get_logger("auth")

# Configuration
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")

if not SUPABASE_JWT_SECRET:
    logger.warning("SUPABASE_JWT_SECRET not set - auth will fail in production")

security = HTTPBearer(auto_error=False)


class AuthUser(BaseModel):
    user_id: str
    email: str
    tier: str = "free"
    role: str = "authenticated"

    class Config:
        frozen = True


def verify_supabase_jwt(token: str) -> dict:
    if not SUPABASE_JWT_SECRET:
        raise HTTPException(status_code=500, detail="Server auth configuration error")
    try:
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
            options={
                "verify_signature": True,
                "verify_exp": True,
                "verify_aud": True,
            },
        )
        return payload
    except jwt.ExpiredSignatureError:
        logger.warning("Expired JWT token")
        raise HTTPException(status_code=401, detail="Token expired - please log in again")
    except jwt.InvalidAudienceError:
        logger.warning("Invalid JWT audience")
        raise HTTPException(status_code=401, detail="Invalid token audience")
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid JWT token: {e}")
        raise HTTPException(status_code=401, detail="Invalid authentication token")
    except Exception as e:
        logger.error(f"JWT verification error: {e}")
        raise HTTPException(status_code=401, detail="Authentication failed")


def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)) -> AuthUser:
    if credentials is None:
        raise HTTPException(
            status_code=401,
            detail="Missing authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = credentials.credentials
    payload = verify_supabase_jwt(token)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token: missing user ID")
    email = payload.get("email", "")
    role = payload.get("role", "authenticated")
    user_metadata = payload.get("user_metadata", {})
    tier = user_metadata.get("tier", "free")
    logger.debug(f"Authenticated user: {user_id} (tier={tier})")
    return AuthUser(user_id=user_id, email=email, tier=tier, role=role)


def get_optional_user(credentials: Optional[HTTPAuthorizationCredentials] = Security(security)) -> Optional[AuthUser]:
    if credentials is None:
        return None
    try:
        return get_current_user(credentials)
    except HTTPException:
        return None


TIER_HIERARCHY = {
    "free": 0,
    "premium": 1,
    "pro": 2,
}


def require_tier(min_tier: str):
    def check_tier(user: AuthUser = Depends(get_current_user)) -> AuthUser:
        user_tier_level = TIER_HIERARCHY.get(user.tier, -1)
        required_tier_level = TIER_HIERARCHY.get(min_tier, 999)
        if user_tier_level < required_tier_level:
            logger.warning(
                f"Access denied: user {user.user_id} (tier={user.tier}) attempted to access {min_tier}-only resource"
            )
            raise HTTPException(
                status_code=403,
                detail=f"This feature requires {min_tier} subscription. Upgrade your account to access.",
            )
        return user

    return check_tier


def require_admin(user: AuthUser = Depends(get_current_user)) -> AuthUser:
    is_admin = user.role == "service_role" or user.email.endswith("@fitai.com")
    if not is_admin:
        logger.warning(f"Admin access denied for user {user.user_id}")
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def ensure_user_owns_resource(resource_user_id: str, authenticated_user: AuthUser) -> None:
    if resource_user_id != authenticated_user.user_id:
        logger.warning(
            f"Authorization failed: user {authenticated_user.user_id} attempted to access resource owned by {resource_user_id}"
        )
        raise HTTPException(status_code=403, detail="You can only access your own resources")


def verify_service_key(api_key: str) -> bool:
    service_key = os.getenv("FITAI_SERVICE_KEY")
    if not service_key:
        return False
    return api_key == service_key


def create_test_token(user_id: str = "test-user-123", tier: str = "free") -> str:
    if not SUPABASE_JWT_SECRET:
        raise ValueError("SUPABASE_JWT_SECRET not set")
    import time

    payload = {
        "sub": user_id,
        "email": f"{user_id}@test.com",
        "aud": "authenticated",
        "role": "authenticated",
        "user_metadata": {"tier": tier},
        "exp": int(time.time()) + 3600,
        "iat": int(time.time()),
    }
    return jwt.encode(payload, SUPABASE_JWT_SECRET, algorithm="HS256")
