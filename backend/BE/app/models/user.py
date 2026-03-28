from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from enum import Enum

class RoleEnum(str, Enum):
    admin = "admin"
    intern = "intern"

class UserInDB(BaseModel):
    id: str = Field(alias="_id")
    name: str
    email: EmailStr
    hashed_password: str
    role: RoleEnum
    department: Optional[str] = None
