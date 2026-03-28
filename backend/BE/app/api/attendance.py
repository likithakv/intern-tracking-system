from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.db.mongodb import db

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
        await db.attendance.update_one(
            {"_id": existing["_id"]},
            {"$set": {"status": payload.status, "created_at": datetime.utcnow()}},
        )
        record_id = existing["_id"]
    else:
        inserted = await db.attendance.insert_one(
            {
                "intern_id": payload.intern_id,
                "date": payload.date,
                "status": payload.status,
                "created_at": datetime.utcnow(),
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
    return serialize_attendance(saved)
