import asyncio
import json
import os
import smtplib
from datetime import date, datetime
from email.message import EmailMessage
from pathlib import Path

from bson import ObjectId

from app.db.mongodb import db


SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "").strip()
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "").strip()
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", "").strip() or SMTP_USERNAME
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").lower() != "false"
EMAIL_OUTBOX_PATH = Path(__file__).resolve().parents[2] / "data" / "email_outbox.json"
NOTIFICATION_POLL_SECONDS = int(os.getenv("NOTIFICATION_POLL_SECONDS", "900"))

PROJECT_TEMPLATES = [
    {
        "id": "frontend-portal",
        "title": "Build intern portal dashboard",
        "description": "Create a responsive admin and intern dashboard with charts, filters, and role-aware navigation.",
        "deliverable": "Functional React dashboard module",
        "priority": "High",
        "domain": "Frontend Engineering",
        "estimatedDays": 7,
    },
    {
        "id": "backend-api",
        "title": "Design attendance and task API",
        "description": "Build REST endpoints for attendance tracking, task updates, alerts, and reporting workflows.",
        "deliverable": "FastAPI backend endpoints with validation",
        "priority": "High",
        "domain": "Backend Engineering",
        "estimatedDays": 8,
    },
    {
        "id": "qa-suite",
        "title": "Prepare QA regression suite",
        "description": "Document test cases and automate smoke coverage for attendance, task management, and certificates.",
        "deliverable": "Regression checklist and automated tests",
        "priority": "Medium",
        "domain": "QA Automation",
        "estimatedDays": 6,
    },
    {
        "id": "data-reporting",
        "title": "Build performance analytics report",
        "description": "Analyze attendance and completion metrics, then summarize intern performance trends in a dashboard report.",
        "deliverable": "Analytics report and chart-ready dataset",
        "priority": "Medium",
        "domain": "Data Analytics",
        "estimatedDays": 5,
    },
    {
        "id": "documentation-pack",
        "title": "Create internship documentation pack",
        "description": "Prepare onboarding notes, workflow diagrams, and mentor handoff documentation for the internship cycle.",
        "deliverable": "Project documentation bundle",
        "priority": "Low",
        "domain": "Documentation",
        "estimatedDays": 4,
    },
]


def get_project_templates():
    return PROJECT_TEMPLATES


def smtp_is_configured():
    return bool(SMTP_HOST and SMTP_PORT and SMTP_USERNAME and SMTP_PASSWORD and SMTP_FROM_EMAIL)


def _load_outbox():
    if not EMAIL_OUTBOX_PATH.exists():
        return []
    try:
        return json.loads(EMAIL_OUTBOX_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []


def get_notification_summary():
    outbox_entries = _load_outbox()
    return {
        "smtpConfigured": smtp_is_configured(),
        "deliveryMode": "smtp" if smtp_is_configured() else "outbox",
        "queuedEmails": len(outbox_entries),
        "pollSeconds": NOTIFICATION_POLL_SECONDS,
        "configurationMessage": (
            "SMTP is configured and ready to send real emails."
            if smtp_is_configured()
            else "SMTP credentials are missing. Emails are being saved to the outbox instead of being delivered."
        ),
    }


async def get_notification_audit(limit=8):
    outbox_entries = _load_outbox()
    recent_activity = await db.activity.find({"kind": "email"}).sort("created_at", -1).to_list(length=limit)

    return {
        "queuedItems": [
            {
                "id": f"queued-{index}",
                "to": entry["to"],
                "subject": entry["subject"],
                "status": "Queued",
                "timestamp": entry.get("queued_at"),
                "error": entry.get("smtp_error"),
            }
            for index, entry in enumerate(reversed(outbox_entries[-limit:]), start=1)
        ],
        "recentActivity": [
            {
                "id": str(item["_id"]),
                "message": item["message"],
                "timestamp": item["created_at"].isoformat(),
                "status": "Sent" if "Email sent" in item["message"] else "Queued",
            }
            for item in recent_activity
        ],
    }


def _save_outbox(entries):
    EMAIL_OUTBOX_PATH.parent.mkdir(parents=True, exist_ok=True)
    EMAIL_OUTBOX_PATH.write_text(json.dumps(entries, indent=2), encoding="utf-8")


async def send_email(to_email, subject, body_html, intern_id=None):
    delivery_mode = "outbox"
    error_message = None

    if smtp_is_configured():
        try:
            message = EmailMessage()
            message["Subject"] = subject
            message["From"] = SMTP_FROM_EMAIL
            message["To"] = to_email
            message.set_content("Your email client does not support HTML messages.")
            message.add_alternative(body_html, subtype="html")

            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as smtp:
                if SMTP_USE_TLS:
                    smtp.starttls()
                if SMTP_USERNAME and SMTP_PASSWORD:
                    smtp.login(SMTP_USERNAME, SMTP_PASSWORD)
                smtp.send_message(message)
            delivery_mode = "smtp"
        except Exception as exc:
            error_message = str(exc)

    if delivery_mode != "smtp":
        entries = _load_outbox()
        entries.append(
            {
                "to": to_email,
                "subject": subject,
                "body_html": body_html,
                "intern_id": intern_id,
                "delivery_mode": "outbox",
                "queued_at": datetime.utcnow().isoformat(),
                "smtp_error": error_message,
            }
        )
        _save_outbox(entries)

    await db.activity.insert_one(
        {
            "kind": "email",
            "intern_id": intern_id,
            "message": f"Email {'sent' if delivery_mode == 'smtp' else 'queued'} to {to_email}: {subject}",
            "created_at": datetime.utcnow(),
        }
    )

    return delivery_mode


def _parse_iso_date(value):
    return date.fromisoformat(value)


def _expected_progress(task, today):
    start_date = _parse_iso_date(task["start_date"])
    deadline = _parse_iso_date(task["deadline"])
    if deadline <= start_date:
        return 100 if today >= deadline else 0

    total_days = max((deadline - start_date).days, 1)
    elapsed_days = min(max((today - start_date).days, 0), total_days)
    return round((elapsed_days / total_days) * 100)


def task_is_behind(task, today):
    if task["status"] == "Completed":
        return False
    expected = _expected_progress(task, today)
    return expected >= 35 and task.get("progress", 0) + 15 < expected


def _task_email_body(intern_name, task, context_line):
    return f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #0f172a;">
        <h2 style="margin-bottom: 12px;">Intern Tracking System Update</h2>
        <p>Hi {intern_name},</p>
        <p>{context_line}</p>
        <ul>
          <li><strong>Task:</strong> {task['title']}</li>
          <li><strong>Status:</strong> {task['status']}</li>
          <li><strong>Progress:</strong> {task.get('progress', 0)}%</li>
          <li><strong>Start Date:</strong> {task['start_date']}</li>
          <li><strong>Deadline:</strong> {task['deadline']}</li>
        </ul>
        <p>Please review your assigned work and update your mentor/admin if you need support.</p>
      </body>
    </html>
    """


def _attendance_email_body(intern_name, attendance_date):
    return f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #0f172a;">
        <h2 style="margin-bottom: 12px;">Attendance Alert</h2>
        <p>Hi {intern_name},</p>
        <p>Your attendance has been marked as <strong>Absent</strong> for <strong>{attendance_date}</strong>.</p>
        <p>If this needs correction, please contact your mentor or admin as soon as possible.</p>
      </body>
    </html>
    """


async def notify_task_assignment(intern, task):
    subject = f"New task assigned: {task['title']}"
    context_line = "A new task has been assigned to you. Please review the task details below."
    await send_email(
        intern["email"],
        subject,
        _task_email_body(intern["name"], task, context_line),
        intern_id=str(intern["_id"]),
    )


async def notify_absent_attendance(intern, attendance_date):
    await send_email(
        intern["email"],
        f"Attendance marked absent for {attendance_date}",
        _attendance_email_body(intern["name"], attendance_date),
        intern_id=str(intern["_id"]),
    )


async def maybe_notify_for_task(task, intern, today=None):
    today = today or date.today()
    notifications = dict(task.get("notifications", {}))
    today_iso = today.isoformat()
    should_update = False

    if task["status"] == "Completed":
        return notifications, False

    deadline = _parse_iso_date(task["deadline"])
    if deadline < today and notifications.get("overdue_sent_on") != today_iso:
        await send_email(
            intern["email"],
            f"Task overdue: {task['title']}",
            _task_email_body(
                intern["name"],
                task,
                "This task has crossed its deadline and still needs your attention.",
            ),
            intern_id=str(intern["_id"]),
        )
        notifications["overdue_sent_on"] = today_iso
        should_update = True
    elif deadline == today and notifications.get("deadline_sent_on") != today_iso:
        await send_email(
            intern["email"],
            f"Task due today: {task['title']}",
            _task_email_body(
                intern["name"],
                task,
                "This is a reminder that your task deadline is today.",
            ),
            intern_id=str(intern["_id"]),
        )
        notifications["deadline_sent_on"] = today_iso
        should_update = True

    if task_is_behind(task, today) and notifications.get("behind_sent_on") != today_iso:
        await send_email(
            intern["email"],
            f"Task progress is behind schedule: {task['title']}",
            _task_email_body(
                intern["name"],
                task,
                "Your task progress is currently behind the expected timeline.",
            ),
            intern_id=str(intern["_id"]),
        )
        notifications["behind_sent_on"] = today_iso
        should_update = True

    return notifications, should_update


async def process_pending_task_notifications():
    interns = await db.interns.find().to_list(length=500)
    intern_lookup = {str(item["_id"]): item for item in interns}
    tasks = await db.tasks.find().to_list(length=500)
    today = date.today()

    for task in tasks:
        intern = intern_lookup.get(task["assigned_to"])
        if not intern:
            continue
        notifications, changed = await maybe_notify_for_task(task, intern, today=today)
        if changed:
            await db.tasks.update_one({"_id": task["_id"]}, {"$set": {"notifications": notifications}})


async def notification_worker():
    while True:
        try:
            await process_pending_task_notifications()
        except Exception:
            pass
        await asyncio.sleep(NOTIFICATION_POLL_SECONDS)
