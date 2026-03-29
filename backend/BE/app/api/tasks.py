from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.db.mongodb import db
from app.services.notifications import get_project_templates, maybe_notify_for_task, notify_task_assignment

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
    project_template: str | None = None


class TaskUpdate(BaseModel):
    status: str | None = None
    progress: int | None = Field(default=None, ge=0, le=100)


class InternTaskUpdate(BaseModel):
    intern_id: str
    progress: int = Field(ge=0, le=100)
    status: str
    update_note: str = Field(min_length=5, max_length=500)


def serialize_task(task):
    item = dict(task)
    item["id"] = str(item.pop("_id"))
    return item


@router.get("/templates")
async def list_task_templates():
    return get_project_templates()


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
    task_doc["notifications"] = {}
    task_doc["latest_update_note"] = ""
    task_doc["latest_update_at"] = None
    task_doc["latest_updated_by"] = ""
    task_doc["update_history"] = []
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
    await notify_task_assignment(intern, created)
    notifications, changed = await maybe_notify_for_task(created, intern)
    if changed:
        await db.tasks.update_one({"_id": result.inserted_id}, {"$set": {"notifications": notifications}})
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
    intern = await db.interns.find_one({"_id": ObjectId(updated["assigned_to"])})
    if intern:
        notifications, changed = await maybe_notify_for_task(updated, intern)
        if changed:
            await db.tasks.update_one({"_id": ObjectId(task_id)}, {"$set": {"notifications": notifications}})
            updated = await db.tasks.find_one({"_id": ObjectId(task_id)})
    return serialize_task(updated)


@router.patch("/{task_id}/intern-update")
async def intern_update_task(task_id: str, payload: InternTaskUpdate):
    if not ObjectId.is_valid(task_id):
        raise HTTPException(status_code=400, detail="Invalid task id.")
    if not ObjectId.is_valid(payload.intern_id):
        raise HTTPException(status_code=400, detail="Invalid intern id.")

    task = await db.tasks.find_one({"_id": ObjectId(task_id)})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")

    if task["assigned_to"] != payload.intern_id:
        raise HTTPException(status_code=403, detail="This task is not assigned to the intern.")

    intern = await db.interns.find_one({"_id": ObjectId(payload.intern_id)})
    if not intern:
        raise HTTPException(status_code=404, detail="Intern not found.")

    update_data = {
        "progress": payload.progress,
        "status": payload.status,
        "latest_update_note": payload.update_note.strip(),
        "latest_update_at": datetime.utcnow(),
        "latest_updated_by": intern["name"],
    }
    task_update_history = list(task.get("update_history", []))
    task_update_history.insert(
        0,
        {
            "intern_id": payload.intern_id,
            "intern_name": intern["name"],
            "progress": payload.progress,
            "status": payload.status,
            "note": payload.update_note.strip(),
            "timestamp": datetime.utcnow().isoformat(),
        },
    )
    update_data["update_history"] = task_update_history[:12]
    await db.tasks.update_one({"_id": ObjectId(task_id)}, {"$set": update_data})
    updated = await db.tasks.find_one({"_id": ObjectId(task_id)})

    await db.activity.insert_one(
        {
            "kind": "task",
            "intern_id": payload.intern_id,
            "message": (
                f"{intern['name']} updated task '{updated['title']}' "
                f"to {payload.progress}% ({payload.status}). Note: {payload.update_note.strip()}"
            ),
            "created_at": datetime.utcnow(),
        }
    )

    notifications, changed = await maybe_notify_for_task(updated, intern)
    if changed:
        await db.tasks.update_one({"_id": ObjectId(task_id)}, {"$set": {"notifications": notifications}})
        updated = await db.tasks.find_one({"_id": ObjectId(task_id)})

    return serialize_task(updated)
