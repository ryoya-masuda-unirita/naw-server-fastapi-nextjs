from fastapi import FastAPI

from app.routers import health, auth

app = FastAPI(title="naw-server FastAPI", version="0.1.0")

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(auth.api_router)
