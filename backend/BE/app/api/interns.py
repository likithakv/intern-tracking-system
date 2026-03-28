from datetime import date, datetime, timedelta

from bson import ObjectId
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr, Field

from app.db.mongodb import db

router = APIRouter(prefix="/interns", tags=["Interns"])


class InternCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    domain: str = Field(min_length=2, max_length=80)
    mentor: str = Field(min_length=2, max_length=80)
    status: str = "On Track"
    start_date: str
    end_date: str


class InternUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    email: EmailStr | None = None
    domain: str | None = Field(default=None, min_length=2, max_length=80)
    mentor: str | None = Field(default=None, min_length=2, max_length=80)
    status: str | None = None
    start_date: str | None = None
    end_date: str | None = None


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
        "domain": payload.domain.strip(),
        "mentor": payload.mentor.strip(),
        "status": payload.status,
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

    await db.interns.update_one({"_id": ObjectId(intern_id)}, {"$set": update_data})
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
