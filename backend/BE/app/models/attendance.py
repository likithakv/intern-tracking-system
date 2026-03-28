from enum import Enum
from pydantic import BaseModel, Field
from datetime import date, datetime

class AttendanceStatus(str, Enum):
    present = "Present"
    absent = "Absent"
    leave = "Leave"

class AttendanceInDB(BaseModel):
    id: str = Field(alias="_id")
    intern_id: str
    date: str # YYYY-MM-DD format
    status: AttendanceStatus
    marked_by: str # Admin ID
    created_at: datetime
