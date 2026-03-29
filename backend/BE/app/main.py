import asyncio
from contextlib import asynccontextmanager, suppress
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from app.api import attendance, auth, evaluations, interns, reports, tasks
from app.db.mongodb import ensure_seed_data
from app.services.notifications import notification_worker, process_pending_task_notifications


@asynccontextmanager
async def lifespan(_: FastAPI):
    await ensure_seed_data()
    await process_pending_task_notifications()
    worker = asyncio.create_task(notification_worker())
    try:
        yield
    finally:
        worker.cancel()
        with suppress(asyncio.CancelledError):
            await worker


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
app.include_router(evaluations.router, prefix="/api")
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
