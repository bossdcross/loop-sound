from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, Request, UploadFile, File, Form
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt
import base64

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'test_database')]

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'sound-loop-secret-key-change-in-production')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_DAYS = 7

# Create the main app
app = FastAPI(title="Sound Loop API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ==================== MODELS ====================

class UserBase(BaseModel):
    email: EmailStr
    name: str

class UserCreate(BaseModel):
    email: EmailStr
    name: str
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class User(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    is_premium: bool = False
    sound_count: int = 0
    created_at: datetime

class UserResponse(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    is_premium: bool = False
    sound_count: int = 0

class Sound(BaseModel):
    sound_id: str
    user_id: str
    name: str
    audio_data: str  # Base64 encoded audio
    duration_seconds: float
    created_at: datetime

class SoundCreate(BaseModel):
    name: str
    audio_data: str  # Base64 encoded audio
    duration_seconds: float

class SoundResponse(BaseModel):
    sound_id: str
    name: str
    duration_seconds: float
    created_at: datetime

class SoundWithData(BaseModel):
    sound_id: str
    name: str
    audio_data: str
    duration_seconds: float
    created_at: datetime

class SessionData(BaseModel):
    user_id: str
    session_token: str
    expires_at: datetime
    created_at: datetime

class AuthResponse(BaseModel):
    token: str
    user: UserResponse

# ==================== HELPERS ====================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_jwt_token(user_id: str) -> str:
    expiration = datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRATION_DAYS)
    payload = {
        'user_id': user_id,
        'exp': expiration
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_jwt_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload.get('user_id')
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

async def get_current_user(authorization: Optional[str] = Header(None)) -> User:
    """Extract and validate user from Authorization header or cookie."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header required")
    
    # Handle Bearer token
    token = authorization
    if authorization.startswith('Bearer '):
        token = authorization[7:]
    
    # First try JWT token
    user_id = decode_jwt_token(token)
    if user_id:
        user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
        if user_doc:
            return User(**user_doc)
    
    # Then try session token (for Emergent OAuth)
    session_doc = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if session_doc:
        # Check expiration
        expires_at = session_doc.get('expires_at')
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at)
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            raise HTTPException(status_code=401, detail="Session expired")
        
        user_doc = await db.users.find_one({"user_id": session_doc['user_id']}, {"_id": 0})
        if user_doc:
            return User(**user_doc)
    
    raise HTTPException(status_code=401, detail="Invalid token")

# Sound limits
FREE_SOUND_LIMIT = 5
PREMIUM_SOUND_LIMIT = 30
FREE_MAX_DURATION = 5 * 60  # 5 minutes in seconds
PREMIUM_MAX_DURATION = 30 * 60  # 30 minutes in seconds

# ==================== AUTH ENDPOINTS ====================

@api_router.post("/auth/register", response_model=AuthResponse)
async def register(user_data: UserCreate):
    """Register a new user with email/password."""
    # Check if user exists
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    
    user_doc = {
        "user_id": user_id,
        "email": user_data.email,
        "name": user_data.name,
        "password_hash": hash_password(user_data.password),
        "picture": None,
        "is_premium": False,
        "sound_count": 0,
        "created_at": now
    }
    
    await db.users.insert_one(user_doc)
    
    token = create_jwt_token(user_id)
    
    return AuthResponse(
        token=token,
        user=UserResponse(
            user_id=user_id,
            email=user_data.email,
            name=user_data.name,
            picture=None,
            is_premium=False,
            sound_count=0
        )
    )

@api_router.post("/auth/login", response_model=AuthResponse)
async def login(credentials: UserLogin):
    """Login with email/password."""
    user_doc = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    if not user_doc.get('password_hash'):
        raise HTTPException(status_code=401, detail="Please login with Google")
    
    if not verify_password(credentials.password, user_doc['password_hash']):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    token = create_jwt_token(user_doc['user_id'])
    
    return AuthResponse(
        token=token,
        user=UserResponse(
            user_id=user_doc['user_id'],
            email=user_doc['email'],
            name=user_doc['name'],
            picture=user_doc.get('picture'),
            is_premium=user_doc.get('is_premium', False),
            sound_count=user_doc.get('sound_count', 0)
        )
    )

@api_router.post("/auth/session")
async def process_session(request: Request):
    """Process Emergent OAuth session_id and create local session."""
    body = await request.json()
    session_id = body.get('session_id')
    
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")
    
    # Call Emergent Auth to get session data
    import httpx
    async with httpx.AsyncClient() as http_client:
        response = await http_client.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id}
        )
        
        if response.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session")
        
        session_data = response.json()
    
    email = session_data.get('email')
    name = session_data.get('name')
    picture = session_data.get('picture')
    session_token = session_data.get('session_token')
    
    # Find or create user
    user_doc = await db.users.find_one({"email": email}, {"_id": 0})
    
    if user_doc:
        user_id = user_doc['user_id']
        # Update user info if needed
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": name, "picture": picture}}
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        now = datetime.now(timezone.utc)
        user_doc = {
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "is_premium": False,
            "sound_count": 0,
            "created_at": now
        }
        await db.users.insert_one(user_doc)
    
    # Store session
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    session_doc = {
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at,
        "created_at": datetime.now(timezone.utc)
    }
    
    # Remove old sessions for this user
    await db.user_sessions.delete_many({"user_id": user_id})
    await db.user_sessions.insert_one(session_doc)
    
    # Get updated user
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    
    return {
        "token": session_token,
        "user": {
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "is_premium": user_doc.get('is_premium', False),
            "sound_count": user_doc.get('sound_count', 0)
        }
    }

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)):
    """Get current user info."""
    return UserResponse(
        user_id=user.user_id,
        email=user.email,
        name=user.name,
        picture=user.picture,
        is_premium=user.is_premium,
        sound_count=user.sound_count
    )

@api_router.post("/auth/logout")
async def logout(user: User = Depends(get_current_user), authorization: Optional[str] = Header(None)):
    """Logout - delete session."""
    if authorization:
        token = authorization[7:] if authorization.startswith('Bearer ') else authorization
        await db.user_sessions.delete_one({"session_token": token})
    return {"message": "Logged out successfully"}

# ==================== SOUND ENDPOINTS ====================

@api_router.get("/sounds", response_model=List[SoundResponse])
async def get_sounds(user: User = Depends(get_current_user)):
    """Get all sounds for current user."""
    sounds = await db.sounds.find({"user_id": user.user_id}, {"_id": 0, "audio_data": 0}).to_list(100)
    return [SoundResponse(**sound) for sound in sounds]

@api_router.get("/sounds/{sound_id}", response_model=SoundWithData)
async def get_sound(sound_id: str, user: User = Depends(get_current_user)):
    """Get a specific sound with audio data."""
    sound = await db.sounds.find_one({"sound_id": sound_id, "user_id": user.user_id}, {"_id": 0})
    if not sound:
        raise HTTPException(status_code=404, detail="Sound not found")
    return SoundWithData(**sound)

@api_router.post("/sounds", response_model=SoundResponse)
async def create_sound(sound_data: SoundCreate, user: User = Depends(get_current_user)):
    """Create a new sound."""
    # Check sound limit
    max_sounds = PREMIUM_SOUND_LIMIT if user.is_premium else FREE_SOUND_LIMIT
    if user.sound_count >= max_sounds:
        raise HTTPException(
            status_code=403, 
            detail=f"Sound limit reached. {'Upgrade to premium for more sounds.' if not user.is_premium else 'Maximum sounds reached.'}"
        )
    
    # Check duration limit
    max_duration = PREMIUM_MAX_DURATION if user.is_premium else FREE_MAX_DURATION
    if sound_data.duration_seconds > max_duration:
        max_minutes = max_duration // 60
        raise HTTPException(
            status_code=403,
            detail=f"Sound duration exceeds {max_minutes} minute limit. {'Upgrade to premium for 30 minute sounds.' if not user.is_premium else ''}"
        )
    
    sound_id = f"sound_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    
    sound_doc = {
        "sound_id": sound_id,
        "user_id": user.user_id,
        "name": sound_data.name,
        "audio_data": sound_data.audio_data,
        "duration_seconds": sound_data.duration_seconds,
        "created_at": now
    }
    
    await db.sounds.insert_one(sound_doc)
    
    # Update user sound count
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$inc": {"sound_count": 1}}
    )
    
    return SoundResponse(
        sound_id=sound_id,
        name=sound_data.name,
        duration_seconds=sound_data.duration_seconds,
        created_at=now
    )

@api_router.put("/sounds/{sound_id}")
async def update_sound(sound_id: str, name: str, user: User = Depends(get_current_user)):
    """Update sound name."""
    result = await db.sounds.update_one(
        {"sound_id": sound_id, "user_id": user.user_id},
        {"$set": {"name": name}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Sound not found")
    return {"message": "Sound updated"}

@api_router.delete("/sounds/{sound_id}")
async def delete_sound(sound_id: str, user: User = Depends(get_current_user)):
    """Delete a sound."""
    result = await db.sounds.delete_one({"sound_id": sound_id, "user_id": user.user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Sound not found")
    
    # Update user sound count
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$inc": {"sound_count": -1}}
    )
    
    return {"message": "Sound deleted"}

# ==================== PREMIUM ENDPOINTS ====================

@api_router.get("/subscription/status")
async def get_subscription_status(user: User = Depends(get_current_user)):
    """Get current subscription status."""
    max_sounds = PREMIUM_SOUND_LIMIT if user.is_premium else FREE_SOUND_LIMIT
    max_duration = PREMIUM_MAX_DURATION if user.is_premium else FREE_MAX_DURATION
    
    return {
        "is_premium": user.is_premium,
        "sound_count": user.sound_count,
        "max_sounds": max_sounds,
        "max_duration_seconds": max_duration,
        "sounds_remaining": max_sounds - user.sound_count
    }

@api_router.post("/subscription/mock-upgrade")
async def mock_upgrade(user: User = Depends(get_current_user)):
    """Mock premium upgrade for testing. In production, use RevenueCat webhooks."""
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": {"is_premium": True}}
    )
    return {"message": "Upgraded to premium", "is_premium": True}

@api_router.post("/subscription/mock-downgrade")
async def mock_downgrade(user: User = Depends(get_current_user)):
    """Mock premium downgrade for testing."""
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": {"is_premium": False}}
    )
    return {"message": "Downgraded to free", "is_premium": False}

# ==================== HEALTH CHECK ====================

@api_router.get("/")
async def root():
    return {"message": "Sound Loop API", "status": "healthy"}

@api_router.get("/health")
async def health():
    return {"status": "healthy"}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
