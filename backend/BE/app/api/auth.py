from datetime import datetime

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr, Field

from app.db.mongodb import db, hash_password

router = APIRouter(prefix="/auth", tags=["Auth"])


class AdminRegister(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class AdminLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


def serialize_admin(admin):
    return {
        "id": str(admin["_id"]),
        "name": admin["name"],
        "email": admin["email"],
    }


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register_admin(payload: AdminRegister):
    existing = await db.admins.find_one({"email": payload.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Admin email already registered.")

    admin_doc = {
        "name": payload.name.strip(),
        "email": payload.email.lower(),
        "password_hash": hash_password(payload.password),
        "created_at": datetime.utcnow(),
    }
    result = await db.admins.insert_one(admin_doc)
    created = await db.admins.find_one({"_id": result.inserted_id})
    return {"message": "Admin registered successfully.", "admin": serialize_admin(created)}


@router.post("/login")
async def login_admin(payload: AdminLogin):
    admin = await db.admins.find_one({"email": payload.email.lower()})
    if not admin or hash_password(payload.password) != admin["password_hash"]:
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    return {
        "message": "Login successful.",
        "admin": serialize_admin(admin),
    }
