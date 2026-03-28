from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse, Response

from app.db.mongodb import db

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


def _attendance_rate(records):
    if not records:
        return 0
    present_days = sum(1 for record in records if record["status"] == "Present")
    return round((present_days / len(records)) * 100)


def _certificate_ready(intern, tasks, attendance_rate, today):
    if not tasks:
        return False
    all_tasks_completed = all(task["status"] == "Completed" for task in tasks)
    internship_completed = intern["end_date"] <= today
    return attendance_rate >= 85 and all_tasks_completed and internship_completed


def _build_certificate_html(intern, attendance_rate, completed_tasks, total_tasks):
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Internship Certificate</title>
  <style>
    body {{
      margin: 0;
      font-family: Georgia, 'Times New Roman', serif;
      background: #f5efe2;
      color: #1f2937;
    }}
    .certificate {{
      width: 960px;
      margin: 24px auto;
      background: #fffdf7;
      border: 18px solid #c08a28;
      padding: 56px 64px;
      box-sizing: border-box;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.1);
    }}
    .badge {{
      text-transform: uppercase;
      letter-spacing: 0.28em;
      color: #a16207;
      font-size: 13px;
      text-align: center;
    }}
    h1 {{
      text-align: center;
      font-size: 46px;
      margin: 18px 0 10px;
    }}
    h2 {{
      text-align: center;
      font-size: 34px;
      margin: 26px 0 10px;
      color: #92400e;
    }}
    p {{
      text-align: center;
      font-size: 18px;
      line-height: 1.8;
    }}
    .meta {{
      margin-top: 30px;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
      font-size: 17px;
    }}
    .meta div {{
      padding: 14px 16px;
      background: #fffbeb;
      border-radius: 14px;
    }}
    .footer {{
      margin-top: 42px;
      display: flex;
      justify-content: space-between;
      align-items: end;
    }}
    .signature {{
      width: 260px;
      border-top: 2px solid #7c2d12;
      padding-top: 10px;
      text-align: center;
      font-size: 16px;
    }}
  </style>
</head>
<body>
  <div class="certificate">
    <div class="badge">Intern Tracking System</div>
    <h1>Certificate of Completion</h1>
    <p>This certifies that</p>
    <h2>{intern["name"]}</h2>
    <p>
      has successfully completed the internship program in <strong>{intern["domain"]}</strong>
      under the guidance of <strong>{intern["mentor"]}</strong>.
    </p>
    <p>
      Attendance: <strong>{attendance_rate}%</strong> |
      Tasks Completed: <strong>{completed_tasks}/{total_tasks}</strong>
    </p>
    <div class="meta">
      <div><strong>Email:</strong> {intern["email"]}</div>
      <div><strong>Domain:</strong> {intern["domain"]}</div>
      <div><strong>Start Date:</strong> {intern["start_date"]}</div>
      <div><strong>End Date:</strong> {intern["end_date"]}</div>
    </div>
    <div class="footer">
      <div class="signature">Program Mentor</div>
      <div class="signature">Admin Coordinator</div>
    </div>
  </div>
</body>
</html>"""


@router.get("")
async def get_dashboard():
    interns = await db.interns.find().sort("name", 1).to_list(length=200)
    tasks = await db.tasks.find().sort("deadline", 1).to_list(length=400)
    attendance = await db.attendance.find().sort("date", 1).to_list(length=800)
    activity = await db.activity.find().sort("created_at", -1).to_list(length=12)

    attendance_by_intern = defaultdict(list)
    for record in attendance:
        attendance_by_intern[record["intern_id"]].append(record)

    tasks_by_intern = defaultdict(list)
    status_counts = Counter()
    pending_task_alerts = []
    overdue_count = 0
    today = date.today().isoformat()

    for task in tasks:
        tasks_by_intern[task["assigned_to"]].append(task)
        status_counts[task["status"]] += 1
        if task["status"] in {"Pending", "In Progress"}:
            pending_task_alerts.append(task)
        if task["deadline"] < today and task["status"] != "Completed":
            overdue_count += 1

    intern_rows = []
    certifications = []
    low_attendance_alerts = []
    for intern in interns:
        intern_id = str(intern["_id"])
        intern_tasks = tasks_by_intern[intern_id]
        intern_attendance = attendance_by_intern[intern_id]
        completed_tasks = sum(1 for task in intern_tasks if task["status"] == "Completed")
        attendance_rate = _attendance_rate(intern_attendance)
        certificate_ready = _certificate_ready(intern, intern_tasks, attendance_rate, today)

        intern_rows.append(
            {
                "id": intern_id,
                "name": intern["name"],
                "email": intern["email"],
                "domain": intern["domain"],
                "mentor": intern["mentor"],
                "status": "Certificate Ready" if certificate_ready else intern["status"],
                "attendanceRate": attendance_rate,
                "completedTasks": completed_tasks,
                "totalTasks": len(intern_tasks),
                "lastActive": intern.get("last_active", today),
                "startDate": intern["start_date"],
                "endDate": intern["end_date"],
            }
        )

        if attendance_rate < 75:
            low_attendance_alerts.append(
                {
                    "internId": intern_id,
                    "name": intern["name"],
                    "attendanceRate": attendance_rate,
                }
            )

        certifications.append(
            {
                "internId": intern_id,
                "name": intern["name"],
                "attendanceRate": attendance_rate,
                "completedTasks": completed_tasks,
                "totalTasks": len(intern_tasks),
                "status": "Ready" if certificate_ready else "In Review",
                "canDownload": certificate_ready,
                "downloadUrl": f"/api/dashboard/certificates/{intern_id}/download" if certificate_ready else None,
            }
        )

    heatmap_dates = sorted({record["date"] for record in attendance})
    attendance_map = defaultdict(dict)
    for record in attendance:
        attendance_map[record["intern_id"]][record["date"]] = record["status"]

    return {
        "stats": [
            {
                "label": "Total Interns",
                "value": len(intern_rows),
                "tone": "neutral",
                "description": "Active interns currently tracked in the system.",
            },
            {
                "label": "Tasks Completed",
                "value": status_counts["Completed"],
                "tone": "success",
                "description": "Finished tasks across the internship program.",
            },
            {
                "label": "Pending Tasks",
                "value": status_counts["Pending"] + status_counts["In Progress"],
                "tone": "warning",
                "description": "Tasks that still need attention before deadlines.",
            },
            {
                "label": "Overdue Tasks",
                "value": overdue_count,
                "tone": "danger",
                "description": "Tasks whose deadlines have already passed.",
            },
        ],
        "interns": intern_rows,
        "taskCompletion": [
            {"label": "Pending", "value": status_counts["Pending"]},
            {"label": "In Progress", "value": status_counts["In Progress"]},
            {"label": "Completed", "value": status_counts["Completed"]},
        ],
        "attendanceHeatmap": {
            "dates": heatmap_dates,
            "rows": [
                {
                    "internName": intern["name"],
                    "values": [
                        {
                            "date": heatmap_date,
                            "status": attendance_map[intern["id"]].get(heatmap_date, "Missing"),
                        }
                        for heatmap_date in heatmap_dates
                    ],
                }
                for intern in intern_rows
            ],
        },
        "recentActivity": [
            {
                "id": str(item["_id"]),
                "kind": item["kind"],
                "message": item["message"],
                "timestamp": item["created_at"].isoformat(),
            }
            for item in activity
        ],
        "alerts": {
            "lowAttendance": low_attendance_alerts,
            "pendingTasks": [
                {
                    "id": str(task["_id"]),
                    "title": task["title"],
                    "status": task["status"],
                    "deadline": task["deadline"],
                }
                for task in pending_task_alerts[:6]
            ],
        },
        "certifications": certifications,
    }


@router.get("/certificates/{intern_id}/download")
async def download_certificate(intern_id: str):
    interns = await db.interns.find().to_list(length=500)
    tasks = await db.tasks.find().to_list(length=500)
    attendance = await db.attendance.find().to_list(length=1000)
    today = date.today().isoformat()

    intern = next((item for item in interns if str(item["_id"]) == intern_id), None)
    if not intern:
        raise HTTPException(status_code=404, detail="Intern not found.")

    intern_tasks = [task for task in tasks if task["assigned_to"] == intern_id]
    attendance_records = [record for record in attendance if record["intern_id"] == intern_id]
    completed_tasks = sum(1 for task in intern_tasks if task["status"] == "Completed")
    attendance_rate = _attendance_rate(attendance_records)

    if not _certificate_ready(intern, intern_tasks, attendance_rate, today):
        raise HTTPException(status_code=400, detail="Certificate is not ready for this intern yet.")

    html_content = _build_certificate_html(intern, attendance_rate, completed_tasks, len(intern_tasks))
    filename = f'{intern["name"].replace(" ", "_").lower()}_certificate.html'
    return Response(
        content=html_content,
        media_type="text/html",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
