from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.db.mongodb import db

router = APIRouter(prefix="/tasks", tags=["Tasks"])


class TaskCreate(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    description: str = Field(min_length=5, max_length=400)
    assigned_to: str
    priority: str = "Medium"
    start_date: str
    deadline: str
    status: str = "Pending"
    progress: int = Field(default=0, ge=0, le=100)
    deliverable: str = Field(default="Project update")


class TaskUpdate(BaseModel):
    status: str | None = None
    progress: int | None = Field(default=None, ge=0, le=100)


def serialize_task(task):
    item = dict(task)
    item["id"] = str(item.pop("_id"))
    return item


@router.get("/")
async def list_tasks():
    tasks = await db.tasks.find().sort("deadline", 1).to_list(length=300)
    return [serialize_task(task) for task in tasks]


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_task(payload: TaskCreate):
    if not ObjectId.is_valid(payload.assigned_to):
        raise HTTPException(status_code=400, detail="Invalid intern id.")

    intern = await db.interns.find_one({"_id": ObjectId(payload.assigned_to)})
    if not intern:
        raise HTTPException(status_code=404, detail="Intern not found.")

    task_doc = payload.model_dump()
    task_doc["created_at"] = datetime.utcnow()
    result = await db.tasks.insert_one(task_doc)

    await db.activity.insert_one(
        {
            "kind": "task",
            "intern_id": payload.assigned_to,
            "message": f"{intern['name']} received a new task: {payload.title}.",
            "created_at": datetime.utcnow(),
        }
    )

    created = await db.tasks.find_one({"_id": result.inserted_id})
    return serialize_task(created)


@router.patch("/{task_id}")
async def update_task(task_id: str, payload: TaskUpdate):
    if not ObjectId.is_valid(task_id):
        raise HTTPException(status_code=400, detail="Invalid task id.")

    update_data = {key: value for key, value in payload.model_dump().items() if value is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No task fields supplied.")

    result = await db.tasks.update_one({"_id": ObjectId(task_id)}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Task not found.")

    updated = await db.tasks.find_one({"_id": ObjectId(task_id)})
    return serialize_task(updated)
