from pydantic import BaseModel
from typing import Dict, Any

class AdminDashboardReport(BaseModel):
    total_interns: int
    tasks_overview: Dict[str, int] # e.g. {"Pending": 2, "Done": 5}
    attendance_summary: Dict[str, int] # e.g. {"Present": 10, "Absent": 2}

class InternDashboardReport(BaseModel):
    assigned_tasks: int
    completed_tasks: int
    attendance_percentage: float
