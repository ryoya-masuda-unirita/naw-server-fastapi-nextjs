from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_cors_settings
from app.routers import (
    assistant_categories,
    assistants,
    auth,
    feedback,
    groups,
    health,
    library_tags,
    messages,
    prompt_templates,
    rooms,
    shares,
    tenant_endpoints,
)
from app.routers.users import admin_router, user_router

app = FastAPI(title="naw-server FastAPI", version="0.1.0")

cors_settings = get_cors_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_settings.cors_allowed_origins,
    allow_origin_regex=cors_settings.cors_allowed_origin_regex,
    # Cookie等の資格情報を伴うリクエスト（frontend/frontend-angular とも
    # credentials: 'include' / withCredentials: true を使用）を許可するため True にする。
    allow_credentials=True,
    # 移植元（Spring Boot）の CorsConfiguration も addAllowedMethod("*") /
    # addAllowedHeader("*") で全許可しており、新しいルーターやカスタムヘッダー
    # （例: X-Tenant-ID）が増えるたびに個別追加が必要にならないよう合わせる。
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(auth.api_router)
app.include_router(admin_router)
app.include_router(user_router)
app.include_router(groups.group_router)
app.include_router(groups.admin_group_router)
app.include_router(groups.admin_all_groups_router)
app.include_router(assistants.router)
app.include_router(assistants.admin_router)
app.include_router(rooms.router)
app.include_router(messages.router)
app.include_router(shares.router)
app.include_router(prompt_templates.prompt_template_router)
app.include_router(prompt_templates.admin_prompt_template_router)
app.include_router(tenant_endpoints.router)
app.include_router(assistant_categories.router)
app.include_router(library_tags.library_tag_router)
app.include_router(library_tags.admin_library_tag_router)
app.include_router(feedback.router)
