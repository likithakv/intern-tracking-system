from datetime import date, datetime, timedelta

from bson import ObjectId
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr, Field

from app.db.mongodb import DEFAULT_INTERN_PASSWORD, db, hash_password
from app.services.notifications import send_email, smtp_is_configured

router = APIRouter(prefix="/interns", tags=["Interns"])


class DocumentRecord(BaseModel):
    label: str = Field(min_length=2, max_length=80)
    file_name: str = Field(min_length=1, max_length=200)
    content_type: str = Field(min_length=3, max_length=120)
    data_url: str = Field(min_length=10, max_length=2000000)
    uploaded_at: str | None = None


class InternCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    phone: str | None = Field(default="", max_length=40)
    college: str | None = Field(default="", max_length=120)
    domain: str = Field(min_length=2, max_length=80)
    skills: list[str] | None = []
    badges: list[str] | None = []
    mentor: str = Field(min_length=2, max_length=80)
    status: str = "On Track"
    batch: str | None = Field(default="Current Cycle", max_length=80)
    emergency_contact: str | None = Field(default="", max_length=140)
    documents: list[str] | None = []
    document_records: dict[str, DocumentRecord] | None = None
    notes: str | None = Field(default="", max_length=1200)
    profile_photo: str | None = Field(default="", max_length=2000000)
    start_date: str
    end_date: str


class InternUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=40)
    college: str | None = Field(default=None, max_length=120)
    domain: str | None = Field(default=None, min_length=2, max_length=80)
    skills: list[str] | None = None
    badges: list[str] | None = None
    mentor: str | None = Field(default=None, min_length=2, max_length=80)
    status: str | None = None
    batch: str | None = Field(default=None, max_length=80)
    emergency_contact: str | None = Field(default=None, max_length=140)
    documents: list[str] | None = None
    document_records: dict[str, DocumentRecord] | None = None
    notes: str | None = Field(default=None, max_length=1200)
    profile_photo: str | None = Field(default=None, max_length=2000000)
    start_date: str | None = None
    end_date: str | None = None


class AdminMessagePayload(BaseModel):
    subject: str = Field(min_length=3, max_length=140)
    message: str = Field(min_length=10, max_length=4000)
    sender_name: str = Field(min_length=2, max_length=80)
    sender_email: EmailStr


class BroadcastMessagePayload(BaseModel):
    subject: str = Field(min_length=3, max_length=140)
    message: str = Field(min_length=10, max_length=4000)
    sender_name: str = Field(min_length=2, max_length=80)
    sender_email: EmailStr
    intern_ids: list[str] | None = None


def serialize_intern(intern):
    item = dict(intern)
    item["id"] = str(item.pop("_id"))
    return item


@router.get("/")
async def list_interns():
    interns = await db.interns.find().sort("name", 1).to_list(length=200)
    return [serialize_intern(intern) for intern in interns]


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_intern(payload: InternCreate):
    existing = await db.interns.find_one({"email": payload.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="An intern with this email already exists.")

    today = date.today().isoformat()
    intern_doc = {
        "name": payload.name.strip(),
        "email": payload.email.lower(),
        "phone": payload.phone or "",
        "college": payload.college or "",
        "domain": payload.domain.strip(),
        "skills": payload.skills or [],
        "badges": payload.badges or [],
        "mentor": payload.mentor.strip(),
        "status": payload.status,
        "batch": payload.batch or "Current Cycle",
        "emergency_contact": payload.emergency_contact or "",
        "documents": payload.documents or [],
        "document_records": payload.document_records or {},
        "notes": payload.notes or "",
        "profile_photo": payload.profile_photo or "",
        "portal_password_hash": hash_password(DEFAULT_INTERN_PASSWORD),
        "start_date": payload.start_date,
        "end_date": payload.end_date,
        "last_active": today,
    }
    result = await db.interns.insert_one(intern_doc)

    await db.activity.insert_one(
        {
            "kind": "intern",
            "intern_id": str(result.inserted_id),
            "message": f"{payload.name.strip()} was added to the internship roster.",
            "created_at": datetime.utcnow(),
        }
    )
    await db.tasks.insert_one(
        {
            "title": "Complete onboarding checklist",
            "description": "Set up tools, review guidelines, and submit a first-week plan.",
            "assigned_to": str(result.inserted_id),
            "priority": "Medium",
            "status": "Pending",
            "progress": 0,
            "start_date": today,
            "deadline": (date.today() + timedelta(days=5)).isoformat(),
            "deliverable": "Onboarding completion note",
            "created_at": datetime.utcnow(),
        }
    )

    created = await db.interns.find_one({"_id": result.inserted_id})
    return serialize_intern(created)


@router.get("/{intern_id}")
async def get_intern(intern_id: str):
    if not ObjectId.is_valid(intern_id):
        raise HTTPException(status_code=400, detail="Invalid intern id.")

    intern = await db.interns.find_one({"_id": ObjectId(intern_id)})
    if not intern:
        raise HTTPException(status_code=404, detail="Intern not found.")

    return serialize_intern(intern)


@router.patch("/{intern_id}")
async def update_intern(intern_id: str, payload: InternUpdate):
    if not ObjectId.is_valid(intern_id):
        raise HTTPException(status_code=400, detail="Invalid intern id.")

    existing = await db.interns.find_one({"_id": ObjectId(intern_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Intern not found.")

    update_data = {key: value for key, value in payload.model_dump().items() if value is not None}
    if "email" in update_data:
        duplicate = await db.interns.find_one({"email": update_data["email"].lower()})
        if duplicate and str(duplicate["_id"]) != intern_id:
            raise HTTPException(status_code=400, detail="An intern with this email already exists.")
        update_data["email"] = update_data["email"].lower()

    if not update_data:
        raise HTTPException(status_code=400, detail="No changes provided.")

    old_end_date = existing.get("end_date")
    new_end_date = update_data.get("end_date")

    await db.interns.update_one({"_id": ObjectId(intern_id)}, {"$set": update_data})

    if new_end_date and new_end_date != old_end_date:
        active_tasks = await db.tasks.find({"assigned_to": intern_id}).to_list(length=300)
        for task in active_tasks:
            if task.get("status") != "Completed" and task.get("deadline", "") < new_end_date:
                await db.tasks.update_one(
                    {"_id": task["_id"]},
                    {"$set": {"deadline": new_end_date}},
                )
        await db.activity.insert_one(
            {
                "kind": "task",
                "intern_id": intern_id,
                "message": f"{existing['name']} internship end date changed to {new_end_date}. Active task deadlines were synced automatically.",
                "created_at": datetime.utcnow(),
            }
        )

    await db.activity.insert_one(
        {
            "kind": "intern",
            "intern_id": intern_id,
            "message": f"{existing['name']} profile details were updated.",
            "created_at": datetime.utcnow(),
        }
    )

    updated = await db.interns.find_one({"_id": ObjectId(intern_id)})
    return serialize_intern(updated)


@router.post("/{intern_id}/message")
async def send_admin_message(intern_id: str, payload: AdminMessagePayload):
    if not ObjectId.is_valid(intern_id):
        raise HTTPException(status_code=400, detail="Invalid intern id.")

    intern = await db.interns.find_one({"_id": ObjectId(intern_id)})
    if not intern:
        raise HTTPException(status_code=404, detail="Intern not found.")

    if not smtp_is_configured():
        raise HTTPException(
            status_code=400,
            detail="Email sending is not configured yet. Please set up SMTP in backend/BE/.env and restart the backend.",
        )

    body_html = f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #0f172a;">
        <h2 style="margin-bottom: 12px;">Message from Admin</h2>
        <p>Hi {intern["name"]},</p>
        <p>{payload.message.strip().replace(chr(10), '<br />')}</p>
        <hr style="margin: 20px 0; border: 0; border-top: 1px solid #e2e8f0;" />
        <p><strong>Sent by:</strong> {payload.sender_name.strip()}</p>
        <p><strong>Admin Email:</strong> {payload.sender_email.lower()}</p>
      </body>
    </html>
    """

    delivery_mode = await send_email(
        intern["email"],
        payload.subject.strip(),
        body_html,
        intern_id=intern_id,
    )

    await db.activity.insert_one(
        {
            "kind": "email",
            "intern_id": intern_id,
            "message": f"{payload.sender_name.strip()} sent a direct update to {intern['email']}: {payload.subject.strip()}",
            "created_at": datetime.utcnow(),
        }
    )

    return {
        "message": f"Email {('sent' if delivery_mode == 'smtp' else 'queued')} to {intern['email']}.",
        "deliveryMode": delivery_mode,
    }


@router.post("/broadcast")
async def send_broadcast_message(payload: BroadcastMessagePayload):
    if not smtp_is_configured():
        raise HTTPException(
            status_code=400,
            detail="Email sending is not configured yet. Please set up SMTP in backend/BE/.env and restart the backend.",
        )

    interns = await db.interns.find().to_list(length=500)
    selected_ids = set(payload.intern_ids or [])
    recipients = [intern for intern in interns if not selected_ids or str(intern["_id"]) in selected_ids]
    if not recipients:
        raise HTTPException(status_code=404, detail="No interns found for this message.")

    for intern in recipients:
        body_html = f"""
        <html>
          <body style="font-family: Arial, sans-serif; color: #0f172a;">
            <h2 style="margin-bottom: 12px;">Program update from Admin</h2>
            <p>Hi {intern["name"]},</p>
            <p>{payload.message.strip().replace(chr(10), '<br />')}</p>
            <hr style="margin: 20px 0; border: 0; border-top: 1px solid #e2e8f0;" />
            <p><strong>Sent by:</strong> {payload.sender_name.strip()}</p>
            <p><strong>Admin Email:</strong> {payload.sender_email.lower()}</p>
          </body>
        </html>
        """
        await send_email(intern["email"], payload.subject.strip(), body_html, intern_id=str(intern["_id"]))
        await db.activity.insert_one(
            {
                "kind": "announcement",
                "intern_id": str(intern["_id"]),
                "message": f"Announcement received: {payload.subject.strip()}",
                "created_at": datetime.utcnow(),
            }
        )

    await db.activity.insert_one(
        {
            "kind": "email",
            "intern_id": None,
            "message": f"{payload.sender_name.strip()} sent a broadcast message to {len(recipients)} intern(s): {payload.subject.strip()}",
            "created_at": datetime.utcnow(),
        }
    )
    return {"message": f"Broadcast sent to {len(recipients)} intern(s)."}
