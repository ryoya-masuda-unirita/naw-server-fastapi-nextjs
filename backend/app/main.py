from fastapi import FastAPI

from app.routers import health, auth
from app.routers.users import admin_router, user_router

app = FastAPI(title="naw-server FastAPI", version="0.1.0")

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(auth.api_router)
app.include_router(admin_router)
app.include_router(user_router)
