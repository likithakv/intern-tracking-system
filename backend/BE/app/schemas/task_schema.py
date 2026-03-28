from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.models.task import TaskStatus

class TaskCreate(BaseModel):
    title: str
    description: str
    assigned_to: str # Intern ID

class TaskUpdateStatus(BaseModel):
    status: TaskStatus

class TaskResponse(BaseModel):
    id: str
    title: str
    description: str
    status: TaskStatus
    assigned_to: str
    assigned_by: str
    created_at: datetime
    updated_at: datetime
