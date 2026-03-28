from pydantic import BaseModel, EmailStr
from typing import Optional
from app.models.user import RoleEnum

class UserRegister(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: RoleEnum = RoleEnum.intern
    department: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None
    role: Optional[RoleEnum] = None

class UserResponse(BaseModel):
    id: str
    name: str
    email: EmailStr
    role: RoleEnum
    department: Optional[str] = None
