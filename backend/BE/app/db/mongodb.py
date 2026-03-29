import os
import hashlib
import json
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING


MONGO_URI = (
    os.getenv("MONGO_URI")
    or os.getenv("MONGO_URL")
    or "mongodb://localhost:27017/intern_tracking_system"
)
DEMO_ADMIN_EMAIL = "admin@interntrack.com"
DEMO_ADMIN_PASSWORD = "admin123"
DEMO_ADMIN_NAME = "System Admin"
DEFAULT_INTERN_PASSWORD = "intern123"
CHANDAN_EMAIL = "chandanchandukv2005@gmail.com"
CHANDAN_PASSWORD = "chandan123"
FALLBACK_DB_PATH = Path(__file__).resolve().parents[2] / "data" / "fallback_db.json"

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


class InMemoryInsertOneResult:
    def __init__(self, inserted_id):
        self.inserted_id = inserted_id


class InMemoryInsertManyResult:
    def __init__(self, inserted_ids):
        self.inserted_ids = inserted_ids


class InMemoryUpdateResult:
    def __init__(self, matched_count):
        self.matched_count = matched_count


class InMemoryCursor:
    def __init__(self, documents):
        self.documents = list(documents)

    def sort(self, field, direction):
        reverse = direction == -1
        self.documents.sort(key=lambda item: item.get(field), reverse=reverse)
        return self

    async def to_list(self, length=100):
        return [dict(item) for item in self.documents[:length]]


class PersistentStore:
    collection_names = ("admins", "interns", "tasks", "attendance", "activity", "evaluations", "leave_requests", "audit_logs")

    def __init__(self, file_path):
        self.file_path = Path(file_path)
        self.file_path.parent.mkdir(parents=True, exist_ok=True)
        self.data = self._load()

    def _empty_state(self):
        return {name: [] for name in self.collection_names}

    def _load(self):
        if not self.file_path.exists():
            return self._empty_state()
        try:
            raw = json.loads(self.file_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return self._empty_state()

        state = self._empty_state()
        for name in self.collection_names:
            state[name] = [self._deserialize_document(doc) for doc in raw.get(name, [])]
        return state

    def save(self):
        serializable = {
            name: [self._serialize_document(doc) for doc in self.data.get(name, [])]
            for name in self.collection_names
        }
        self.file_path.write_text(json.dumps(serializable, indent=2), encoding="utf-8")

    def _serialize_value(self, value):
        if isinstance(value, ObjectId):
            return {"__type": "objectid", "value": str(value)}
        if isinstance(value, datetime):
            return {"__type": "datetime", "value": value.isoformat()}
        if isinstance(value, list):
            return [self._serialize_value(item) for item in value]
        if isinstance(value, dict):
            return {key: self._serialize_value(item) for key, item in value.items()}
        return value

    def _deserialize_value(self, value):
        if isinstance(value, dict) and value.get("__type") == "objectid":
            return ObjectId(value["value"])
        if isinstance(value, dict) and value.get("__type") == "datetime":
            return datetime.fromisoformat(value["value"])
        if isinstance(value, list):
            return [self._deserialize_value(item) for item in value]
        if isinstance(value, dict):
            return {key: self._deserialize_value(item) for key, item in value.items()}
        return value

    def _serialize_document(self, document):
        return {key: self._serialize_value(value) for key, value in document.items()}

    def _deserialize_document(self, document):
        return {key: self._deserialize_value(value) for key, value in document.items()}


class InMemoryCollection:
    def __init__(self, store, collection_name):
        self.store = store
        self.collection_name = collection_name

    @property
    def documents(self):
        return self.store.data[self.collection_name]

    async def create_index(self, *_args, **_kwargs):
        return None

    async def count_documents(self, query):
        return len([doc for doc in self.documents if self._matches(doc, query)])

    async def find_one(self, query):
        for document in self.documents:
            if self._matches(document, query):
                return dict(document)
        return None

    def find(self, query=None):
        query = query or {}
        return InMemoryCursor([doc for doc in self.documents if self._matches(doc, query)])

    async def insert_one(self, document):
        stored = dict(document)
        stored["_id"] = stored.get("_id", ObjectId())
        self.documents.append(stored)
        self.store.save()
        return InMemoryInsertOneResult(stored["_id"])

    async def insert_many(self, documents):
        inserted_ids = []
        for document in documents:
            stored = dict(document)
            stored["_id"] = stored.get("_id", ObjectId())
            self.documents.append(stored)
            inserted_ids.append(stored["_id"])
        self.store.save()
        return InMemoryInsertManyResult(inserted_ids)

    async def update_one(self, query, update):
        for document in self.documents:
            if self._matches(document, query):
                for key, value in update.get("$set", {}).items():
                    document[key] = value
                self.store.save()
                return InMemoryUpdateResult(1)
        return InMemoryUpdateResult(0)

    def _matches(self, document, query):
        for key, value in query.items():
            if document.get(key) != value:
                return False
        return True


class InMemoryDatabase:
    def __init__(self):
        self.store = PersistentStore(FALLBACK_DB_PATH)
        self.admins = InMemoryCollection(self.store, "admins")
        self.interns = InMemoryCollection(self.store, "interns")
        self.tasks = InMemoryCollection(self.store, "tasks")
        self.attendance = InMemoryCollection(self.store, "attendance")
        self.activity = InMemoryCollection(self.store, "activity")
        self.evaluations = InMemoryCollection(self.store, "evaluations")
        self.leave_requests = InMemoryCollection(self.store, "leave_requests")
        self.audit_logs = InMemoryCollection(self.store, "audit_logs")


class DatabaseProxy:
    def __init__(self, backend):
        self.backend = backend

    def use_backend(self, backend):
        self.backend = backend

    def __getattr__(self, item):
        return getattr(self.backend, item)


client = AsyncIOMotorClient(MONGO_URI, serverSelectionTimeoutMS=1500)
default_db = client.get_default_database()
mongo_backend = default_db if default_db is not None else client["intern_tracking_system"]
db = DatabaseProxy(mongo_backend)


def _seed_interns():
    today = date.today()
    return [
        {
            "name": "Aarav Sharma",
            "email": "aarav.sharma@example.com",
            "phone": "+91 9876543210",
            "college": "National Institute of Design Tech",
            "domain": "Frontend Engineering",
            "skills": ["React", "CSS", "UI Systems"],
            "mentor": "Ritika Sen",
            "status": "On Track",
            "batch": "Summer 2026",
            "emergency_contact": "Priya Sharma | +91 9811111111",
            "documents": ["Resume", "Offer Letter", "ID Proof"],
            "notes": "Strong UI sense. Ready for more ownership on dashboard polish.",
            "portal_password_hash": hash_password(DEFAULT_INTERN_PASSWORD),
            "archived": False,
            "certificate_id": f"ITS-{uuid.uuid4().hex[:10].upper()}",
            "start_date": (today - timedelta(days=40)).isoformat(),
            "end_date": (today + timedelta(days=50)).isoformat(),
            "last_active": (today - timedelta(days=1)).isoformat(),
        },
        {
            "name": "Meera Iyer",
            "email": "meera.iyer@example.com",
            "phone": "+91 9876543211",
            "college": "Chennai Institute of Engineering",
            "domain": "Backend Engineering",
            "skills": ["FastAPI", "MongoDB", "API Design"],
            "mentor": "Arjun Mehta",
            "status": "Needs Attention",
            "batch": "Summer 2026",
            "emergency_contact": "Suresh Iyer | +91 9822222222",
            "documents": ["Resume", "NDA"],
            "notes": "Needs closer deadline tracking. Backend work quality is good.",
            "portal_password_hash": hash_password(DEFAULT_INTERN_PASSWORD),
            "archived": False,
            "certificate_id": f"ITS-{uuid.uuid4().hex[:10].upper()}",
            "start_date": (today - timedelta(days=55)).isoformat(),
            "end_date": (today + timedelta(days=35)).isoformat(),
            "last_active": today.isoformat(),
        },
        {
            "name": "Kabir Patel",
            "email": "kabir.patel@example.com",
            "phone": "+91 9876543212",
            "college": "Western QA Institute",
            "domain": "QA Automation",
            "skills": ["Testing", "Automation", "Documentation"],
            "mentor": "Nisha Verma",
            "status": "On Track",
            "batch": "Summer 2026",
            "emergency_contact": "Maya Patel | +91 9833333333",
            "documents": ["Resume", "Offer Letter"],
            "notes": "Reliable on documentation and test coverage.",
            "portal_password_hash": hash_password(DEFAULT_INTERN_PASSWORD),
            "archived": False,
            "certificate_id": f"ITS-{uuid.uuid4().hex[:10].upper()}",
            "start_date": (today - timedelta(days=28)).isoformat(),
            "end_date": (today + timedelta(days=62)).isoformat(),
            "last_active": (today - timedelta(days=2)).isoformat(),
        },
        {
            "name": "Ananya Roy",
            "email": "ananya.roy@example.com",
            "phone": "+91 9876543213",
            "college": "Data Science Academy",
            "domain": "Data Analytics",
            "skills": ["Python", "Analytics", "Reporting"],
            "mentor": "Pooja Nair",
            "status": "Certificate Ready",
            "batch": "Winter 2025",
            "emergency_contact": "Soma Roy | +91 9844444444",
            "documents": ["Resume", "Completion Review"],
            "notes": "Consistent performer. Good candidate for final recognition.",
            "portal_password_hash": hash_password(DEFAULT_INTERN_PASSWORD),
            "archived": False,
            "certificate_id": f"ITS-{uuid.uuid4().hex[:10].upper()}",
            "start_date": (today - timedelta(days=70)).isoformat(),
            "end_date": (today - timedelta(days=1)).isoformat(),
            "last_active": today.isoformat(),
        },
    ]


def _seed_tasks(intern_ids):
    today = date.today()
    return [
        {
            "title": "Build dashboard shell",
            "description": "Create responsive layout, navigation, and stat cards.",
            "assigned_to": intern_ids[0],
            "priority": "High",
            "status": "Completed",
            "progress": 100,
            "start_date": (today - timedelta(days=12)).isoformat(),
            "deadline": (today - timedelta(days=2)).isoformat(),
            "deliverable": "React dashboard UI",
            "created_at": datetime.utcnow() - timedelta(days=12),
        },
        {
            "title": "Attendance API integration",
            "description": "Connect attendance widgets with backend endpoint data.",
            "assigned_to": intern_ids[0],
            "priority": "Medium",
            "status": "In Progress",
            "progress": 72,
            "start_date": (today - timedelta(days=5)).isoformat(),
            "deadline": (today + timedelta(days=3)).isoformat(),
            "deliverable": "Attendance analytics module",
            "created_at": datetime.utcnow() - timedelta(days=5),
        },
        {
            "title": "Design MongoDB schema",
            "description": "Define intern, task, attendance, and certification documents.",
            "assigned_to": intern_ids[1],
            "priority": "High",
            "status": "Completed",
            "progress": 100,
            "start_date": (today - timedelta(days=18)).isoformat(),
            "deadline": (today - timedelta(days=8)).isoformat(),
            "deliverable": "Database schema notes",
            "created_at": datetime.utcnow() - timedelta(days=18),
        },
        {
            "title": "Implement task alerts",
            "description": "Highlight overdue and pending tasks on the admin dashboard.",
            "assigned_to": intern_ids[1],
            "priority": "High",
            "status": "Pending",
            "progress": 10,
            "start_date": (today - timedelta(days=1)).isoformat(),
            "deadline": (today + timedelta(days=4)).isoformat(),
            "deliverable": "Alert logic and UI states",
            "created_at": datetime.utcnow() - timedelta(days=1),
        },
        {
            "title": "Write regression checklist",
            "description": "Prepare test checklist for attendance and task flows.",
            "assigned_to": intern_ids[2],
            "priority": "Medium",
            "status": "In Progress",
            "progress": 58,
            "start_date": (today - timedelta(days=7)).isoformat(),
            "deadline": (today + timedelta(days=6)).isoformat(),
            "deliverable": "QA checklist",
            "created_at": datetime.utcnow() - timedelta(days=7),
        },
        {
            "title": "Prepare final presentation",
            "description": "Summarize project outcomes, metrics, and certification notes.",
            "assigned_to": intern_ids[3],
            "priority": "Low",
            "status": "Completed",
            "progress": 100,
            "start_date": (today - timedelta(days=9)).isoformat(),
            "deadline": (today + timedelta(days=2)).isoformat(),
            "deliverable": "Presentation deck",
            "created_at": datetime.utcnow() - timedelta(days=9),
        },
    ]


def _seed_attendance(intern_ids):
    today = date.today()
    patterns = {
        intern_ids[0]: ["Present", "Present", "Present", "Absent", "Present", "Present", "Present", "Present", "Present", "Present", "Present", "Present", "Absent", "Present"],
        intern_ids[1]: ["Present", "Absent", "Present", "Leave", "Absent", "Present", "Present", "Absent", "Present", "Present", "Leave", "Absent", "Present", "Present"],
        intern_ids[2]: ["Present", "Present", "Present", "Present", "Present", "Present", "Absent", "Present", "Present", "Present", "Present", "Leave", "Present", "Present"],
        intern_ids[3]: ["Present", "Present", "Present", "Present", "Present", "Present", "Present", "Present", "Leave", "Present", "Present", "Present", "Present", "Present"],
    }
    records = []
    for intern_id, statuses in patterns.items():
        for index, status in enumerate(statuses):
            records.append(
                {
                    "intern_id": intern_id,
                    "date": (today - timedelta(days=(len(statuses) - index - 1))).isoformat(),
                    "status": status,
                    "created_at": datetime.utcnow() - timedelta(days=(len(statuses) - index - 1)),
                }
            )
    return records


def _seed_activity(intern_ids):
    return [
        {
            "kind": "task",
            "message": "Aarav Sharma completed Build dashboard shell.",
            "intern_id": intern_ids[0],
            "created_at": datetime.utcnow() - timedelta(hours=3),
        },
        {
            "kind": "attendance",
            "message": "Meera Iyer recorded absent attendance today.",
            "intern_id": intern_ids[1],
            "created_at": datetime.utcnow() - timedelta(hours=5),
        },
        {
            "kind": "certificate",
            "message": "Ananya Roy is ready for certification review.",
            "intern_id": intern_ids[3],
            "created_at": datetime.utcnow() - timedelta(days=1),
        },
        {
            "kind": "task",
            "message": "Kabir Patel updated Write regression checklist to 58%.",
            "intern_id": intern_ids[2],
            "created_at": datetime.utcnow() - timedelta(days=1, hours=2),
        },
    ]


def _seed_admin():
    return {
        "name": DEMO_ADMIN_NAME,
        "email": DEMO_ADMIN_EMAIL,
        "password_hash": hash_password(DEMO_ADMIN_PASSWORD),
        "phone": "+91 9000000000",
        "designation": "System Administrator",
        "organization": "Intern Tracker Labs",
        "access_level": "Super Admin",
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


def _seed_evaluations(intern_ids):
    today = date.today()
    return [
        {
            "intern_id": intern_ids[0],
            "communication": 8,
            "technical_skill": 9,
            "teamwork": 8,
            "ownership": 8,
            "comments": "Strong progress and clear communication.",
            "created_at": datetime.utcnow() - timedelta(days=4),
            "evaluation_date": (today - timedelta(days=4)).isoformat(),
        },
        {
            "intern_id": intern_ids[2],
            "communication": 7,
            "technical_skill": 7,
            "teamwork": 8,
            "ownership": 7,
            "comments": "Reliable delivery, should share blockers earlier.",
            "created_at": datetime.utcnow() - timedelta(days=2),
            "evaluation_date": (today - timedelta(days=2)).isoformat(),
        },
    ]


async def ensure_seed_data():
    try:
        await client.admin.command("ping")
    except Exception:
        db.use_backend(InMemoryDatabase())

    await db.interns.create_index([("email", ASCENDING)], unique=True)
    await db.admins.create_index([("email", ASCENDING)], unique=True)
    await db.tasks.create_index([("assigned_to", ASCENDING)])
    await db.tasks.create_index([("deadline", ASCENDING)])
    await db.attendance.create_index([("intern_id", ASCENDING), ("date", ASCENDING)], unique=True)
    await db.evaluations.create_index([("intern_id", ASCENDING)])
    await db.leave_requests.create_index([("intern_id", ASCENDING), ("start_date", ASCENDING)])
    await db.audit_logs.create_index([("created_at", ASCENDING)])

    demo_admin = await db.admins.find_one({"email": DEMO_ADMIN_EMAIL})
    if not demo_admin:
        await db.admins.insert_one(_seed_admin())
    else:
        expected_hash = hash_password(DEMO_ADMIN_PASSWORD)
        demo_admin_updates = {}
        if demo_admin.get("name") != DEMO_ADMIN_NAME:
            demo_admin_updates["name"] = DEMO_ADMIN_NAME
        if demo_admin.get("password_hash") != expected_hash:
            demo_admin_updates["password_hash"] = expected_hash
        for key, value in _seed_admin().items():
            if key in {"name", "password_hash", "created_at"}:
                continue
            if key not in demo_admin:
                demo_admin_updates[key] = value
        if demo_admin_updates:
            await db.admins.update_one({"_id": demo_admin["_id"]}, {"$set": demo_admin_updates})

    if await db.interns.count_documents({}) > 0:
        existing_interns = await db.interns.find().to_list(length=500)
        for intern in existing_interns:
            update_fields = {}
            if intern.get("email", "").lower() == CHANDAN_EMAIL:
                update_fields["portal_password_hash"] = hash_password(CHANDAN_PASSWORD)
            elif not intern.get("portal_password_hash"):
                update_fields["portal_password_hash"] = hash_password(DEFAULT_INTERN_PASSWORD)
            if "archived" not in intern:
                update_fields["archived"] = False
            if not intern.get("certificate_id"):
                update_fields["certificate_id"] = f"ITS-{uuid.uuid4().hex[:10].upper()}"
            if update_fields:
                await db.interns.update_one(
                    {"_id": intern["_id"]},
                    {"$set": update_fields},
                )
        if await db.evaluations.count_documents({}) == 0 and existing_interns:
            await db.evaluations.insert_many(_seed_evaluations([str(item["_id"]) for item in existing_interns[:4]]))
        return

    intern_docs = _seed_interns()
    inserted = await db.interns.insert_many(intern_docs)
    intern_ids = [str(item_id) for item_id in inserted.inserted_ids]

    await db.tasks.insert_many(_seed_tasks(intern_ids))
    await db.attendance.insert_many(_seed_attendance(intern_ids))
    await db.activity.insert_many(_seed_activity(intern_ids))
    await db.evaluations.insert_many(_seed_evaluations(intern_ids))
