from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import re
import uuid
from .tasks import analyze_repo_task, get_task_status, set_task_status

app = FastAPI(title="Structrace Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class RepoAnalysisRequest(BaseModel):
    url: str
    token: Optional[str] = None
    branch: Optional[str] = None

@app.get("/")
async def root():
    return {"message": "RepoScope Engine is running"}

# Only public github.com HTTPS clone URLs are accepted; anything else
# (file://, ssh, internal hosts, embedded credentials) never reaches git clone.
GITHUB_CLONE_URL = re.compile(r"^https://github\.com/[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}?(\.git)?/?$")
SAFE_BRANCH = re.compile(r"^[A-Za-z0-9_./-]{1,200}$")


def validate_request(request: RepoAnalysisRequest) -> None:
    if not GITHUB_CLONE_URL.match(request.url or "") or "/../" in (request.url or "") + "/":
        raise HTTPException(status_code=400, detail="Only https://github.com/<owner>/<repo> URLs can be analyzed.")
    if request.branch and (not SAFE_BRANCH.match(request.branch) or request.branch.startswith("-")):
        raise HTTPException(status_code=400, detail="Invalid branch name.")
    if request.token and not re.match(r"^[A-Za-z0-9_\-.]+$", request.token):
        raise HTTPException(status_code=400, detail="Invalid token.")


@app.post("/api/analyze")
async def trigger_analysis(request: RepoAnalysisRequest):
    validate_request(request)
    task_id = str(uuid.uuid4())
    try:
        set_task_status(task_id, {"status": "queued", "progress": 0})
        analyze_repo_task.delay(task_id, request.url, request.token, request.branch)
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail=f"Task queue unavailable (Celery/Redis may be down): {e}"
        )
    return {"task_id": task_id, "status": "queued"}

@app.get("/api/tasks/{task_id}")
async def check_task(task_id: str):
    status = get_task_status(task_id)
    if not status:
        raise HTTPException(status_code=404, detail="Task not found")
    return status
