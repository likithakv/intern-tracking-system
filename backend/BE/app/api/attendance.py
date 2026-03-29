from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.db.mongodb import db
from app.services.notifications import notify_absent_attendance

router = APIRouter(prefix="/attendance", tags=["Attendance"])


class AttendanceCreate(BaseModel):
    intern_id: str
    date: str
    status: str


def serialize_attendance(record):
    item = dict(record)
    item["id"] = str(item.pop("_id"))
    return item


@router.get("/")
async def list_attendance():
    records = await db.attendance.find().sort("date", -1).to_list(length=500)
    return [serialize_attendance(record) for record in records]


@router.post("/", status_code=status.HTTP_201_CREATED)
async def mark_attendance(payload: AttendanceCreate):
    if not ObjectId.is_valid(payload.intern_id):
        raise HTTPException(status_code=400, detail="Invalid intern id.")

    intern = await db.interns.find_one({"_id": ObjectId(payload.intern_id)})
    if not intern:
        raise HTTPException(status_code=404, detail="Intern not found.")

    existing = await db.attendance.find_one({"intern_id": payload.intern_id, "date": payload.date})
    if existing:
        update_payload = {"status": payload.status, "created_at": datetime.utcnow()}
        if payload.status == "Absent":
            update_payload["absent_email_sent_on"] = payload.date
        await db.attendance.update_one(
            {"_id": existing["_id"]},
            {"$set": update_payload},
        )
        record_id = existing["_id"]
    else:
        inserted = await db.attendance.insert_one(
            {
                "intern_id": payload.intern_id,
                "date": payload.date,
                "status": payload.status,
                "created_at": datetime.utcnow(),
                "absent_email_sent_on": payload.date if payload.status == "Absent" else None,
            }
        )
        record_id = inserted.inserted_id

    await db.activity.insert_one(
        {
            "kind": "attendance",
            "intern_id": payload.intern_id,
            "message": f"{intern['name']} attendance was marked as {payload.status}.",
            "created_at": datetime.utcnow(),
        }
    )

    saved = await db.attendance.find_one({"_id": record_id})
    if payload.status == "Absent" and (not existing or existing.get("absent_email_sent_on") != payload.date):
        await notify_absent_attendance(intern, payload.date)
    return serialize_attendance(saved)
