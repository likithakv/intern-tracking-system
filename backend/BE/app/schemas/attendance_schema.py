from pydantic import BaseModel
from datetime import date, datetime
from app.models.attendance import AttendanceStatus

class AttendanceCreate(BaseModel):
    intern_id: str
    date: str # YYYY-MM-DD
    status: AttendanceStatus

class AttendanceResponse(BaseModel):
    id: str
    intern_id: str
    date: str
    status: AttendanceStatus
    marked_by: str
    created_at: datetime
