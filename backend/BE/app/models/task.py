from enum import Enum
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class TaskStatus(str, Enum):
    pending = "Pending"
    in_progress = "In Progress"
    done = "Done"
    approved = "Approved"

class TaskInDB(BaseModel):
    id: str = Field(alias="_id")
    title: str
    description: str
    status: TaskStatus
    assigned_to: str # Intern ID
    assigned_by: str # Admin ID
    created_at: datetime
    updated_at: datetime
