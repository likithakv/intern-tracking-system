from datetime import datetime

from bson import ObjectId
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


class InternLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class InternPasswordChange(BaseModel):
    current_password: str = Field(min_length=6, max_length=128)
    new_password: str = Field(min_length=6, max_length=128)


class AdminProfileUpdate(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    role: str = Field(min_length=2, max_length=80)
    phone: str = Field(min_length=5, max_length=40)
    designation: str = Field(min_length=2, max_length=80)
    organization: str = Field(min_length=2, max_length=120)
    access_level: str = Field(min_length=2, max_length=80)
    availability: str = Field(min_length=2, max_length=40)
    profile_photo: str | None = ""
    notification_preferences: dict | None = None


class AdminPasswordChange(BaseModel):
    current_password: str = Field(min_length=6, max_length=128)
    new_password: str = Field(min_length=6, max_length=128)


def serialize_admin(admin):
    return {
        "id": str(admin["_id"]),
        "name": admin["name"],
        "email": admin["email"],
        "role_type": "admin",
        "role": admin.get("designation", "System Administrator"),
        "phone": admin.get("phone", ""),
        "designation": admin.get("designation", "System Administrator"),
        "organization": admin.get("organization", "Intern Tracker Labs"),
        "access_level": admin.get("access_level", "Super Admin"),
        "availability": admin.get("availability", "Online"),
        "profile_photo": admin.get("profile_photo", ""),
        "notification_preferences": admin.get("notification_preferences", {}),
        "last_login": admin.get("last_login").isoformat() if admin.get("last_login") else None,
        "login_activity": admin.get("login_activity", []),
    }


def serialize_intern_session(intern):
    return {
        "id": str(intern["_id"]),
        "name": intern["name"],
        "email": intern["email"],
        "role_type": "intern",
        "domain": intern.get("domain", ""),
        "mentor": intern.get("mentor", ""),
        "batch": intern.get("batch", "Current Cycle"),
        "status": intern.get("status", "On Track"),
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
        "phone": "",
        "designation": "System Administrator",
        "organization": "Intern Tracker Labs",
        "access_level": "Admin",
        "availability": "Online",
        "profile_photo": "",
        "notification_preferences": {
            "attendance_alerts": True,
            "task_alerts": True,
            "mail_updates": True,
            "weekly_summary": True,
            "email_frequency": "Immediate",
        },
        "last_login": datetime.utcnow(),
        "login_activity": [],
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

    login_entry = {"timestamp": datetime.utcnow().isoformat(), "email": admin["email"]}
    login_activity = list(admin.get("login_activity", []))
    login_activity.insert(0, login_entry)
    await db.admins.update_one(
        {"_id": admin["_id"]},
        {"$set": {"last_login": datetime.utcnow(), "login_activity": login_activity[:8]}},
    )
    admin = await db.admins.find_one({"_id": admin["_id"]})

    return {
        "message": "Login successful.",
        "admin": serialize_admin(admin),
    }


@router.post("/intern-login")
async def login_intern(payload: InternLogin):
    intern = await db.interns.find_one({"email": payload.email.lower()})
    if not intern or hash_password(payload.password) != intern.get("portal_password_hash", ""):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    if intern.get("archived"):
        raise HTTPException(status_code=403, detail="This intern account has been archived. Contact the administrator.")

    await db.interns.update_one(
        {"_id": intern["_id"]},
        {"$set": {"last_active": datetime.utcnow().date().isoformat()}},
    )
    intern = await db.interns.find_one({"_id": intern["_id"]})
    return {
        "message": "Login successful.",
        "intern": serialize_intern_session(intern),
    }


@router.patch("/intern-password/{intern_id}")
async def change_intern_password(intern_id: str, payload: InternPasswordChange):
    if not ObjectId.is_valid(intern_id):
        raise HTTPException(status_code=400, detail="Invalid intern id.")

    intern = await db.interns.find_one({"_id": ObjectId(intern_id)})
    if not intern:
        raise HTTPException(status_code=404, detail="Intern not found.")

    if hash_password(payload.current_password) != intern.get("portal_password_hash", ""):
        raise HTTPException(status_code=401, detail="Current password is incorrect.")

    await db.interns.update_one(
        {"_id": ObjectId(intern_id)},
        {"$set": {"portal_password_hash": hash_password(payload.new_password)}},
    )
    return {"message": "Password updated successfully."}


@router.patch("/profile/{admin_id}")
async def update_admin_profile(admin_id: str, payload: AdminProfileUpdate):
    if not ObjectId.is_valid(admin_id):
        raise HTTPException(status_code=400, detail="Invalid admin id.")

    admin = await db.admins.find_one({"_id": ObjectId(admin_id)})
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found.")

    duplicate = await db.admins.find_one({"email": payload.email.lower()})
    if duplicate and str(duplicate["_id"]) != admin_id:
        raise HTTPException(status_code=400, detail="Admin email already registered.")

    update_doc = payload.model_dump()
    update_doc["email"] = update_doc["email"].lower()
    update_doc["designation"] = update_doc["designation"].strip()
    update_doc["role"] = payload.role.strip()
    await db.admins.update_one({"_id": ObjectId(admin_id)}, {"$set": update_doc})
    updated = await db.admins.find_one({"_id": ObjectId(admin_id)})
    return {"message": "Admin profile updated successfully.", "admin": serialize_admin(updated)}


@router.patch("/password/{admin_id}")
async def change_admin_password(admin_id: str, payload: AdminPasswordChange):
    if not ObjectId.is_valid(admin_id):
        raise HTTPException(status_code=400, detail="Invalid admin id.")

    admin = await db.admins.find_one({"_id": ObjectId(admin_id)})
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found.")

    if hash_password(payload.current_password) != admin["password_hash"]:
        raise HTTPException(status_code=401, detail="Current password is incorrect.")

    await db.admins.update_one(
        {"_id": ObjectId(admin_id)},
        {"$set": {"password_hash": hash_password(payload.new_password)}},
    )
    return {"message": "Admin password updated successfully."}
