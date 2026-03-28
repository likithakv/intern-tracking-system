from pydantic import BaseModel, EmailStr
from typing import Optional
from app.models.user import RoleEnum

class InternCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    department: Optional[str] = None

class InternUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    department: Optional[str] = None

class InternResponse(BaseModel):
    id: str
    name: str
    email: EmailStr
    role: RoleEnum
    department: Optional[str] = None
