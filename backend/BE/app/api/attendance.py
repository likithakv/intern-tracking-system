from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.db.mongodb import db
from app.services.notifications import notify_attendance_marked

router = APIRouter(prefix="/attendance", tags=["Attendance"])


class AttendanceCreate(BaseModel):
    intern_id: str
    date: str
    status: str


class LeaveRequestCreate(BaseModel):
    intern_id: str
    start_date: str
    end_date: str
    reason: str


class LeaveRequestReview(BaseModel):
    status: str


def serialize_attendance(record):
    item = dict(record)
    item["id"] = str(item.pop("_id"))
    return item


def serialize_leave_request(record):
    item = dict(record)
    item["id"] = str(item.pop("_id"))
    return item


@router.get("/")
async def list_attendance():
    records = await db.attendance.find().sort("date", -1).to_list(length=500)
    return [serialize_attendance(record) for record in records]


@router.get("/leave-requests")
async def list_leave_requests():
    records = await db.leave_requests.find().sort("start_date", -1).to_list(length=200)
    return [serialize_leave_request(record) for record in records]


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
    await db.audit_logs.insert_one(
        {
            "entity": "attendance",
            "entity_id": payload.intern_id,
            "action": "mark",
            "message": f"Attendance marked as {payload.status} for {intern['name']} on {payload.date}.",
            "created_at": datetime.utcnow(),
        }
    )

    saved = await db.attendance.find_one({"_id": record_id})
    previous_status = existing.get("status") if existing else None
    if (not existing) or previous_status != payload.status:
        await notify_attendance_marked(intern, payload.date, payload.status)
    return serialize_attendance(saved)


@router.post("/leave-requests", status_code=status.HTTP_201_CREATED)
async def create_leave_request(payload: LeaveRequestCreate):
    if not ObjectId.is_valid(payload.intern_id):
        raise HTTPException(status_code=400, detail="Invalid intern id.")

    intern = await db.interns.find_one({"_id": ObjectId(payload.intern_id)})
    if not intern:
        raise HTTPException(status_code=404, detail="Intern not found.")

    inserted = await db.leave_requests.insert_one(
        {
            "intern_id": payload.intern_id,
            "start_date": payload.start_date,
            "end_date": payload.end_date,
            "reason": payload.reason.strip(),
            "status": "Pending",
            "created_at": datetime.utcnow(),
        }
    )
    await db.activity.insert_one(
        {
            "kind": "attendance",
            "intern_id": payload.intern_id,
            "message": f"{intern['name']} requested leave from {payload.start_date} to {payload.end_date}.",
            "created_at": datetime.utcnow(),
        }
    )
    await db.audit_logs.insert_one(
        {
            "entity": "leave_request",
            "entity_id": payload.intern_id,
            "action": "create",
            "message": f"Leave request created for {intern['name']} from {payload.start_date} to {payload.end_date}.",
            "created_at": datetime.utcnow(),
        }
    )
    record = await db.leave_requests.find_one({"_id": inserted.inserted_id})
    return serialize_leave_request(record)


@router.patch("/leave-requests/{request_id}")
async def review_leave_request(request_id: str, payload: LeaveRequestReview):
    if not ObjectId.is_valid(request_id):
        raise HTTPException(status_code=400, detail="Invalid leave request id.")

    existing = await db.leave_requests.find_one({"_id": ObjectId(request_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Leave request not found.")

    await db.leave_requests.update_one(
        {"_id": ObjectId(request_id)},
        {"$set": {"status": payload.status, "reviewed_at": datetime.utcnow().isoformat()}},
    )
    if payload.status == "Approved":
        await db.attendance.insert_one(
            {
                "intern_id": existing["intern_id"],
                "date": existing["start_date"],
                "status": "Leave",
                "created_at": datetime.utcnow(),
                "absent_email_sent_on": None,
            }
        )
    intern = await db.interns.find_one({"_id": ObjectId(existing["intern_id"])})
    if intern:
        await db.activity.insert_one(
            {
                "kind": "attendance",
                "intern_id": existing["intern_id"],
                "message": f"Your leave request from {existing['start_date']} to {existing['end_date']} was {payload.status.lower()} by admin.",
                "created_at": datetime.utcnow(),
            }
        )
    await db.audit_logs.insert_one(
        {
            "entity": "leave_request",
            "entity_id": existing["intern_id"],
            "action": payload.status.lower(),
            "message": f"Leave request {payload.status.lower()} for intern {existing['intern_id']}.",
            "created_at": datetime.utcnow(),
        }
    )
    updated = await db.leave_requests.find_one({"_id": ObjectId(request_id)})
    return serialize_leave_request(updated)
