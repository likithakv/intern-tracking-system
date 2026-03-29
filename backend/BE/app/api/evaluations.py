from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.db.mongodb import db

router = APIRouter(prefix="/evaluations", tags=["Evaluations"])


class EvaluationCreate(BaseModel):
    intern_id: str
    communication: int = Field(ge=1, le=10)
    technical_skill: int = Field(ge=1, le=10)
    teamwork: int = Field(ge=1, le=10)
    ownership: int = Field(ge=1, le=10)
    comments: str = Field(min_length=5, max_length=800)
    evaluation_date: str


def serialize_evaluation(record):
    item = dict(record)
    item["id"] = str(item.pop("_id"))
    item["overall_score"] = round(((item["communication"] + item["technical_skill"] + item["teamwork"] + item["ownership"]) / 40) * 100)
    return item


@router.get("/")
async def list_evaluations():
    items = await db.evaluations.find().sort("evaluation_date", -1).to_list(length=300)
    return [serialize_evaluation(item) for item in items]


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_evaluation(payload: EvaluationCreate):
    if not ObjectId.is_valid(payload.intern_id):
        raise HTTPException(status_code=400, detail="Invalid intern id.")

    intern = await db.interns.find_one({"_id": ObjectId(payload.intern_id)})
    if not intern:
        raise HTTPException(status_code=404, detail="Intern not found.")

    result = await db.evaluations.insert_one(
        {
            **payload.model_dump(),
            "created_at": datetime.utcnow(),
        }
    )
    await db.activity.insert_one(
        {
            "kind": "evaluation",
            "intern_id": payload.intern_id,
            "message": f"Evaluation submitted for {intern['name']}.",
            "created_at": datetime.utcnow(),
        }
    )
    await db.audit_logs.insert_one(
        {
            "entity": "evaluation",
            "entity_id": payload.intern_id,
            "action": "create",
            "message": f"Evaluation created for {intern['name']}.",
            "created_at": datetime.utcnow(),
        }
    )
    created = await db.evaluations.find_one({"_id": result.inserted_id})
    return serialize_evaluation(created)
