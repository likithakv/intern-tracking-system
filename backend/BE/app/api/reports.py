from collections import Counter, defaultdict
import csv
import io
from datetime import date
from pathlib import Path

from pydantic import BaseModel, EmailStr
from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse, Response, StreamingResponse

from app.db.mongodb import db
from app.services.notifications import (
    get_notification_audit,
    get_notification_summary,
    get_project_templates,
    process_pending_task_notifications,
    send_email,
    smtp_is_configured,
)

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


class TestEmailPayload(BaseModel):
    email: EmailStr


def _attendance_rate(records):
    if not records:
        return 0
    present_days = sum(1 for record in records if record["status"] == "Present")
    return round((present_days / len(records)) * 100)


def _certificate_ready(intern, tasks, attendance_rate, today):
    if not tasks:
        return False
    all_tasks_completed = all(task["status"] == "Completed" for task in tasks)
    return attendance_rate >= 85 and all_tasks_completed


def _performance_score(attendance_rate, completed_tasks, total_tasks):
    task_completion_rate = round((completed_tasks / total_tasks) * 100) if total_tasks else 0
    score = round((attendance_rate * 0.45) + (task_completion_rate * 0.55))
    return min(score, 100), task_completion_rate


def _performance_band(score):
    if score >= 85:
        return "Excellent"
    if score >= 70:
        return "Strong"
    if score >= 55:
        return "Watch"
    return "Critical"


def _badge_catalog():
    return [
        {"id": "elite-achiever", "label": "Elite Achiever", "description": "Awarded for outstanding overall internship performance."},
        {"id": "rising-star", "label": "Rising Star", "description": "Recognizes interns showing strong growth and upward performance."},
        {"id": "consistency-star", "label": "Consistency Star", "description": "Given for high attendance and steady execution."},
        {"id": "completion-champion", "label": "Completion Champion", "description": "Awarded for completing assigned tasks with strong follow-through."},
        {"id": "excellence-in-execution", "label": "Excellence in Execution", "description": "Recognizes interns who balance quality, score, and completion."},
        {"id": "progress-builder", "label": "Progress Builder", "description": "Guaranteed baseline badge that recognizes active participation and continued progress."},
    ]


def _earned_badges(attendance_rate, performance_score, task_completion_rate, total_tasks):
    badges = []
    if performance_score >= 85:
        badges.append("Elite Achiever")
    elif performance_score >= 70:
        badges.append("Rising Star")
    if attendance_rate >= 90:
        badges.append("Consistency Star")
    if total_tasks and task_completion_rate >= 100:
        badges.append("Completion Champion")
    if performance_score >= 80 and attendance_rate >= 85 and task_completion_rate >= 85:
        badges.append("Excellence in Execution")
    if not badges:
        badges.append("Progress Builder")
    return badges[:3]


def _serialize_intern_portal(intern, tasks, attendance_records, activity, today):
    completed_tasks = sum(1 for task in tasks if task["status"] == "Completed")
    attendance_rate = _attendance_rate(attendance_records)
    performance_score, task_completion_rate = _performance_score(attendance_rate, completed_tasks, len(tasks))
    certificate_ready = _certificate_ready(intern, tasks, attendance_rate, today)
    earned_badges = _earned_badges(attendance_rate, performance_score, task_completion_rate, len(tasks))

    return {
        "profile": {
            "id": str(intern["_id"]),
            "name": intern["name"],
            "email": intern["email"],
            "phone": intern.get("phone", ""),
            "profile_photo": intern.get("profile_photo", ""),
            "college": intern.get("college", ""),
            "domain": intern.get("domain", ""),
            "skills": intern.get("skills", []),
            "badges": earned_badges,
            "mentor": intern.get("mentor", ""),
            "batch": intern.get("batch", "Current Cycle"),
            "status": "Certificate Ready" if certificate_ready else intern.get("status", "On Track"),
            "startDate": intern["start_date"],
            "endDate": intern["end_date"],
        },
        "stats": [
            {"label": "Attendance", "value": attendance_rate, "suffix": "%"},
            {"label": "Tasks Completed", "value": completed_tasks, "suffix": ""},
            {"label": "Pending Tasks", "value": len([task for task in tasks if task["status"] != "Completed"]), "suffix": ""},
            {"label": "Performance Score", "value": performance_score, "suffix": "/100"},
        ],
        "tasks": [
            {
                "id": str(task["_id"]),
                "title": task["title"],
                "description": task["description"],
                "priority": task["priority"],
                "status": task["status"],
                "progress": task.get("progress", 0),
                "start_date": task["start_date"],
                "deadline": task["deadline"],
                "deliverable": task.get("deliverable", "Project update"),
            }
            for task in sorted(tasks, key=lambda item: item["deadline"])
        ],
        "attendance": {
            "rate": attendance_rate,
            "records": [
                {
                    "id": str(record["_id"]),
                    "date": record["date"],
                    "status": record["status"],
                }
                for record in sorted(attendance_records, key=lambda item: item["date"], reverse=True)[:20]
            ],
        },
        "performance": {
            "score": performance_score,
            "band": _performance_band(performance_score),
            "taskCompletionRate": task_completion_rate,
        },
        "badgeSummary": {
            "earned": earned_badges,
            "basis": "Badges are awarded automatically from overall performance, attendance, and task completion.",
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
        "inbox": [
            {
                "id": str(item["_id"]),
                "kind": item["kind"],
                "message": item["message"],
                "timestamp": item["created_at"].isoformat(),
            }
            for item in activity
            if item["kind"] in {"email", "announcement"}
        ],
        "certificate": {
            "status": "Ready" if certificate_ready else "In Review",
            "canDownload": certificate_ready,
            "downloadUrl": f"/api/dashboard/certificates/{str(intern['_id'])}/download" if certificate_ready else None,
            "criteria": [
                {"label": "Attendance at least 85%", "met": attendance_rate >= 85},
                {"label": "All tasks completed", "met": bool(tasks) and completed_tasks == len(tasks)},
                {"label": "Final project submitted", "met": bool(tasks) and completed_tasks == len(tasks)},
            ],
        },
    }


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
    await process_pending_task_notifications()
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
    pending_approval_count = 0
    badge_totals = Counter()
    for intern in interns:
        intern_id = str(intern["_id"])
        intern_tasks = tasks_by_intern[intern_id]
        intern_attendance = attendance_by_intern[intern_id]
        completed_tasks = sum(1 for task in intern_tasks if task["status"] == "Completed")
        attendance_rate = _attendance_rate(intern_attendance)
        certificate_ready = _certificate_ready(intern, intern_tasks, attendance_rate, today)
        performance_score, task_completion_rate = _performance_score(attendance_rate, completed_tasks, len(intern_tasks))
        earned_badges = _earned_badges(attendance_rate, performance_score, task_completion_rate, len(intern_tasks))
        for badge in earned_badges:
            badge_totals[badge] += 1

        intern_rows.append(
            {
                "id": intern_id,
                "name": intern["name"],
                "email": intern["email"],
                "phone": intern.get("phone", ""),
                "college": intern.get("college", ""),
                "domain": intern["domain"],
                "skills": intern.get("skills", []),
                "badges": intern.get("badges", []),
                "mentor": intern["mentor"],
                "status": "Certificate Ready" if certificate_ready else intern["status"],
                "batch": intern.get("batch", "Current Cycle"),
                "emergency_contact": intern.get("emergency_contact", ""),
                "documents": intern.get("documents", []),
                "notes": intern.get("notes", ""),
                "attendanceRate": attendance_rate,
                "completedTasks": completed_tasks,
                "totalTasks": len(intern_tasks),
                "lastActive": intern.get("last_active", today),
                "startDate": intern["start_date"],
                "endDate": intern["end_date"],
                "performanceScore": performance_score,
                "taskCompletionRate": task_completion_rate,
                "earnedBadges": earned_badges,
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
        if intern["status"] in {"Needs Attention", "Onboarding"}:
            pending_approval_count += 1

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
                "earnedBadges": earned_badges,
                "criteria": [
                    {"label": "Attendance at least 85%", "met": attendance_rate >= 85},
                    {"label": "All tasks completed", "met": bool(intern_tasks) and completed_tasks == len(intern_tasks)},
                    {"label": "Final project submitted", "met": bool(intern_tasks) and completed_tasks == len(intern_tasks)},
                ],
            }
        )

    today_date = date.fromisoformat(today)
    upcoming_evaluation_count = sum(
        1
        for intern in intern_rows
        if 0 <= (date.fromisoformat(intern["endDate"]) - today_date).days <= 14
    )
    due_today_count = sum(1 for task in tasks if task["deadline"] == today and task["status"] != "Completed")
    upcoming_deadline_count = sum(
        1
        for task in tasks
        if 0 <= (date.fromisoformat(task["deadline"]) - today_date).days <= 7 and task["status"] != "Completed"
    )

    heatmap_dates = sorted({record["date"] for record in attendance})
    attendance_map = defaultdict(dict)
    for record in attendance:
        attendance_map[record["intern_id"]][record["date"]] = record["status"]

    domain_counter = Counter(intern["domain"] for intern in intern_rows)
    mentor_groups = defaultdict(list)
    batch_counter = Counter(intern.get("batch", "Current Cycle") for intern in intern_rows)
    for intern in intern_rows:
        mentor_groups[intern["mentor"]].append(intern)

    mentor_analytics = []
    for mentor, members in mentor_groups.items():
        mentor_analytics.append(
            {
                "mentor": mentor,
                "internCount": len(members),
                "avgAttendance": round(sum(item["attendanceRate"] for item in members) / len(members)),
                "avgPerformance": round(sum(item["performanceScore"] for item in members) / len(members)),
            }
        )

    timeline = [
        {
            "id": str(task["_id"]),
            "title": task["title"],
            "deadline": task["deadline"],
            "status": task["status"],
            "assignedTo": next((intern["name"] for intern in intern_rows if intern["id"] == task["assigned_to"]), "Unassigned"),
        }
        for task in tasks[:8]
    ]

    calendar_events = [
        {
            "id": f"internship-{intern['id']}",
            "label": f"{intern['name']} review window",
            "date": intern["endDate"],
            "type": "evaluation",
        }
        for intern in intern_rows
    ] + [
        {
            "id": str(task["_id"]),
            "label": task["title"],
            "date": task["deadline"],
            "type": "deadline",
        }
        for task in tasks[:12]
    ]

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
        "widgets": {
            "activeInterns": len(intern_rows),
            "pendingApprovals": pending_approval_count,
            "upcomingEvaluations": upcoming_evaluation_count,
            "projectDeadlineStatus": {
                "dueToday": due_today_count,
                "upcoming": upcoming_deadline_count,
                "overdue": overdue_count,
            },
        },
        "interns": intern_rows,
        "taskCompletion": [
            {"label": "Pending", "value": status_counts["Pending"]},
            {"label": "In Progress", "value": status_counts["In Progress"]},
            {"label": "Completed", "value": status_counts["Completed"]},
        ],
        "performanceAnalysis": [
            {
                "internId": intern["id"],
                "name": intern["name"],
                "score": intern["performanceScore"],
                "attendanceRate": intern["attendanceRate"],
                "taskCompletionRate": intern["taskCompletionRate"],
                "band": _performance_band(intern["performanceScore"]),
            }
            for intern in sorted(intern_rows, key=lambda item: item["performanceScore"], reverse=True)
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
        "certificateSummary": {
            "readyCount": sum(1 for item in certifications if item["canDownload"]),
            "inReviewCount": sum(1 for item in certifications if not item["canDownload"]),
            "eligibleSoonCount": sum(
                1
                for item in certifications
                if not item["canDownload"] and item["attendanceRate"] >= 80 and item["completedTasks"] >= max(item["totalTasks"] - 1, 0)
            ),
        },
        "badgeCatalog": _badge_catalog(),
        "badgeInsights": [
            {"label": label, "count": count}
            for label, count in badge_totals.most_common()
        ],
        "projectTemplates": get_project_templates(),
        "notificationSummary": get_notification_summary(),
        "notificationAudit": await get_notification_audit(),
        "domainDistribution": [{"label": key, "value": value} for key, value in domain_counter.items()],
        "mentorAnalytics": mentor_analytics,
        "deadlineTimeline": timeline,
        "calendarEvents": sorted(calendar_events, key=lambda item: item["date"])[:12],
        "batchOptions": list(batch_counter.keys()),
        "quickActions": [
            {"id": "add-intern", "label": "Add Intern", "section": "interns"},
            {"id": "assign-project", "label": "Assign Project", "section": "projects"},
            {"id": "mark-attendance", "label": "Mark Attendance", "section": "evaluations"},
            {"id": "send-update", "label": "Send Update", "section": "settings"},
        ],
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


@router.post("/test-email")
async def send_test_email(payload: TestEmailPayload):
    if not smtp_is_configured():
        raise HTTPException(
            status_code=400,
            detail="SMTP is not configured. Add SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, and SMTP_FROM_EMAIL in backend/BE/.env, then restart the backend.",
        )

    delivery_mode = await send_email(
        payload.email,
        "Intern Tracking System test email",
        """
        <html>
          <body style="font-family: Arial, sans-serif; color: #0f172a;">
            <h2 style="margin-bottom: 12px;">Test email delivered</h2>
            <p>This confirms that the Intern Tracking System SMTP setup is working.</p>
            <p>You can now use automatic attendance and task notifications with real delivery.</p>
          </body>
        </html>
        """,
    )
    return {"status": "ok", "deliveryMode": delivery_mode, "message": f"Test email sent to {payload.email}."}


@router.get("/report.csv")
async def download_dashboard_report():
    interns = await db.interns.find().sort("name", 1).to_list(length=500)
    tasks = await db.tasks.find().to_list(length=500)
    attendance = await db.attendance.find().to_list(length=1000)

    attendance_by_intern = defaultdict(list)
    tasks_by_intern = defaultdict(list)
    for record in attendance:
        attendance_by_intern[record["intern_id"]].append(record)
    for task in tasks:
        tasks_by_intern[task["assigned_to"]].append(task)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Name", "Email", "Domain", "Mentor", "Batch", "Attendance Rate", "Completed Tasks", "Total Tasks", "Status"])
    for intern in interns:
        intern_id = str(intern["_id"])
        intern_tasks = tasks_by_intern[intern_id]
        attendance_rate = _attendance_rate(attendance_by_intern[intern_id])
        completed_tasks = sum(1 for task in intern_tasks if task["status"] == "Completed")
        writer.writerow([
            intern["name"],
            intern["email"],
            intern.get("domain", ""),
            intern.get("mentor", ""),
            intern.get("batch", ""),
            attendance_rate,
            completed_tasks,
            len(intern_tasks),
            intern.get("status", ""),
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="intern_dashboard_report.csv"'},
    )


@router.get("/intern/{intern_id}")
async def get_intern_dashboard(intern_id: str):
    interns = await db.interns.find().to_list(length=500)
    intern = next((item for item in interns if str(item["_id"]) == intern_id), None)
    if not intern:
        raise HTTPException(status_code=404, detail="Intern not found.")

    tasks = await db.tasks.find({"assigned_to": intern_id}).to_list(length=200)
    attendance_records = await db.attendance.find({"intern_id": intern_id}).to_list(length=400)
    activity = await db.activity.find({"intern_id": intern_id}).sort("created_at", -1).to_list(length=10)
    today = date.today().isoformat()
    return _serialize_intern_portal(intern, tasks, attendance_records, activity, today)
