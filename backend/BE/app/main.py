from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import attendance, auth, interns, reports, tasks
from app.db.mongodb import ensure_seed_data


@asynccontextmanager
async def lifespan(_: FastAPI):
    await ensure_seed_data()
    yield


app = FastAPI(
    title="Intern Tracking System API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(interns.router, prefix="/api")
app.include_router(tasks.router, prefix="/api")
app.include_router(attendance.router, prefix="/api")
app.include_router(reports.router, prefix="/api")


@app.get("/")
async def root():
    return {
        "name": "Intern Tracking System API",
        "status": "running",
        "docs": "/docs",
    }


@app.get("/api/health")
async def health_check():
    return {"status": "ok"}
