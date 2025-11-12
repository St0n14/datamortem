from datetime import datetime
import requests
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..auth.dependencies import (
    get_current_admin_user,
    get_current_superadmin_user,
    get_current_user,
)
from ..auth.permissions import ensure_evidence_access_by_uid
from ..db import get_db
from ..models import CustomScript, TaskRun, User, UserScript
from ..schemas.script_schemas import (
    ScriptAssignRequest,
    ScriptCreate,
    ScriptResponse,
    ScriptRunRequest,
    ScriptSummary,
    ScriptUpdate,
)
from ..tasks.run_custom_script import run_custom_script


class GitHubImportRequest(BaseModel):
    """Request to import scripts from GitHub"""
    repo_url: str  # e.g., https://github.com/user/repo
    branch: str = "main"
    scripts_path: str = "scripts"  # Path in the repo where scripts are located


router = APIRouter(prefix="/api/scripts", tags=["scripts"])


@router.get("", response_model=list[ScriptResponse])
def list_scripts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_superadmin_user),
):
    return db.query(CustomScript).order_by(CustomScript.created_at_utc.desc()).all()


@router.post("", response_model=ScriptResponse, status_code=status.HTTP_201_CREATED)
def create_script(
    payload: ScriptCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_superadmin_user),
):
    script = CustomScript(
        name=payload.name.strip(),
        description=payload.description,
        language=payload.language,
        python_version=payload.python_version.strip() if payload.python_version else "3.11",
        requirements=payload.requirements.strip() if payload.requirements else None,
        source_code=payload.source_code,
        created_by_id=current_user.id,
    )
    db.add(script)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A script with this name already exists.",
        )
    db.refresh(script)
    return script


def _get_script(script_id: int, db: Session) -> CustomScript | None:
    return db.query(CustomScript).filter(CustomScript.id == script_id).first()


@router.get("/marketplace", response_model=list[ScriptSummary])
def marketplace_scripts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all approved scripts available in the marketplace."""
    # Check if marketplace is enabled
    from .feature_flags import is_feature_enabled
    if not is_feature_enabled("marketplace", db):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Le marketplace est actuellement désactivé."
        )
    
    scripts = (
        db.query(CustomScript)
        .filter(CustomScript.is_approved.is_(True))
        .order_by(CustomScript.name.asc())
        .all()
    )
    return scripts


@router.get("/my-scripts", response_model=list[ScriptResponse])
def my_installed_scripts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all scripts installed by the current user."""
    # Debug: vérifier les UserScript pour cet utilisateur
    user_script_assignments = (
        db.query(UserScript)
        .filter(UserScript.user_id == current_user.id)
        .all()
    )
    print(f"[DEBUG] User {current_user.id} ({current_user.email}) has {len(user_script_assignments)} script assignments")
    
    user_scripts = (
        db.query(CustomScript)
        .join(UserScript, UserScript.script_id == CustomScript.id)
        .filter(UserScript.user_id == current_user.id)
        .order_by(CustomScript.name.asc())
        .all()
    )
    print(f"[DEBUG] Returning {len(user_scripts)} scripts for user {current_user.id}")
    return user_scripts


@router.post("/import-github")
def import_from_github(
    payload: GitHubImportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_superadmin_user),
):
    """
    Import Python scripts from a GitHub repository.

    Fetches all .py files from the specified path in the repository
    and creates them as scripts (not approved by default).
    """
    try:
        # Parse GitHub URL to extract owner and repo
        # Expected format: https://github.com/owner/repo
        url_parts = payload.repo_url.rstrip('/').split('/')
        if len(url_parts) < 2:
            raise HTTPException(status_code=400, detail="Invalid GitHub URL format")

        owner = url_parts[-2]
        repo = url_parts[-1]

        # GitHub API endpoint to list files in directory
        api_url = f"https://api.github.com/repos/{owner}/{repo}/contents/{payload.scripts_path}?ref={payload.branch}"

        response = requests.get(api_url, timeout=10)
        if response.status_code != 200:
            raise HTTPException(
                status_code=400,
                detail=f"Unable to fetch from GitHub: {response.status_code} - {response.text}"
            )

        files = response.json()
        imported_count = 0
        skipped_count = 0
        errors = []

        for file in files:
            # Only import .py files
            if not file.get('name', '').endswith('.py'):
                continue

            # Fetch file content
            download_url = file.get('download_url')
            if not download_url:
                continue

            content_response = requests.get(download_url, timeout=10)
            if content_response.status_code != 200:
                errors.append(f"Failed to download {file['name']}")
                continue

            script_name = file['name'].replace('.py', '')
            source_code = content_response.text

            # Check if script already exists
            existing = db.query(CustomScript).filter(CustomScript.name == script_name).first()
            if existing:
                skipped_count += 1
                continue

            # Create script
            try:
                script = CustomScript(
                    name=script_name,
                    description=f"Imported from {owner}/{repo}/{payload.scripts_path}",
                    language="python",
                    source_code=source_code,
                    created_by_id=current_user.id,
                    is_approved=False,  # Not approved by default
                )
                db.add(script)
                db.commit()
                imported_count += 1
            except Exception as e:
                db.rollback()
                errors.append(f"Error importing {script_name}: {str(e)}")

        return {
            "status": "success",
            "imported": imported_count,
            "skipped": skipped_count,
            "errors": errors if errors else None
        }

    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=400, detail=f"GitHub API error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Import error: {str(e)}")


@router.get("/{script_id}", response_model=ScriptResponse)
def get_script(
    script_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_superadmin_user),
):
    script = _get_script(script_id, db)
    if not script:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Script not found")

    return script


@router.put("/{script_id}", response_model=ScriptResponse)
def update_script(
    script_id: int,
    payload: ScriptUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_superadmin_user),
):
    """Update script fields (source code, description, python_version, requirements) (superadmin only)."""
    script = _get_script(script_id, db)
    if not script:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Script not found")
    
    # Update only provided fields
    if payload.source_code is not None:
        script.source_code = payload.source_code
    if payload.description is not None:
        script.description = payload.description
    if payload.python_version is not None:
        script.python_version = payload.python_version.strip()
    if payload.requirements is not None:
        script.requirements = payload.requirements.strip() if payload.requirements.strip() else None
    
    db.commit()
    db.refresh(script)
    return script


@router.post("/{script_id}/run")
def run_script(
    script_id: int,
    payload: ScriptRunRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    script = db.query(CustomScript).filter_by(id=script_id).first()
    if not script:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Script not found")

    evidence = ensure_evidence_access_by_uid(payload.evidence_uid, current_user, db)

    if script.language != "python":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Execution for language '{script.language}' is not yet supported.",
        )

    task_run = TaskRun(
        task_name=f"script:{script.name}",
        evidence_uid=evidence.evidence_uid,
        status="queued",
        module_id=None,
        script_id=script.id,
        progress_message="queued",
    )
    db.add(task_run)
    db.commit()
    db.refresh(task_run)

    try:
        async_result = run_custom_script.delay(
            script_id=script.id,
            evidence_uid=evidence.evidence_uid,
            task_run_id=task_run.id,
        )
        task_run.celery_task_id = getattr(async_result, "id", None)
        db.commit()
    except Exception as exc:
        task_run.status = "error"
        task_run.error_message = str(exc)
        task_run.ended_at_utc = datetime.utcnow()
        db.commit()

    return {
        "task_run_id": task_run.id,
        "status": task_run.status,
        "evidence_uid": task_run.evidence_uid,
        "script_id": task_run.script_id,
        "celery_task_id": task_run.celery_task_id,
    }


@router.post("/{script_id}/approve")
def approve_script(
    script_id: int,
    approved: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_superadmin_user),
):
    script = _get_script(script_id, db)
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")
    script.is_approved = approved
    script.published_at = datetime.utcnow() if approved else None
    db.commit()
    return {"id": script.id, "is_approved": script.is_approved}


@router.post("/{script_id}/install")
def install_script(
    script_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Allow any user to install an approved script to their profile."""
    print(f"[DEBUG] User {current_user.id} ({current_user.email}) attempting to install script {script_id}")
    script = _get_script(script_id, db)
    if not script:
        print(f"[DEBUG] Script {script_id} not found")
        raise HTTPException(status_code=404, detail="Script not available or not approved")
    if not script.is_approved:
        print(f"[DEBUG] Script {script_id} is not approved (is_approved={script.is_approved})")
        raise HTTPException(status_code=404, detail="Script not available or not approved")

    existing = (
        db.query(UserScript)
        .filter(UserScript.user_id == current_user.id, UserScript.script_id == script_id)
        .first()
    )
    if existing:
        print(f"[DEBUG] Script {script_id} already installed for user {current_user.id}")
        return {"status": "already_installed", "script_id": script_id}

    assignment = UserScript(user_id=current_user.id, script_id=script_id)
    db.add(assignment)
    db.commit()
    print(f"[DEBUG] Successfully installed script {script_id} for user {current_user.id}")

    return {"status": "installed", "script_id": script_id}


@router.post("/{script_id}/assign")
def assign_script(
    script_id: int,
    req: ScriptAssignRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_superadmin_user),
):
    """Admin endpoint to assign a script to any user."""
    script = _get_script(script_id, db)
    if not script or not script.is_approved:
        raise HTTPException(status_code=404, detail="Script not available")

    user = db.query(User).filter_by(id=req.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    existing = (
        db.query(UserScript)
        .filter(UserScript.user_id == req.user_id, UserScript.script_id == script_id)
        .first()
    )
    if existing:
        return {"status": "already_assigned"}

    assignment = UserScript(user_id=req.user_id, script_id=script_id)
    db.add(assignment)
    db.commit()

    return {"status": "assigned", "user_id": req.user_id, "script_id": script_id}


@router.delete("/{script_id}/uninstall-all")
def uninstall_from_all_users(
    script_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_superadmin_user),
):
    """Admin endpoint to remove a script from all users' profiles."""
    script = _get_script(script_id, db)
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")

    # Delete all UserScript entries for this script
    deleted_count = (
        db.query(UserScript)
        .filter(UserScript.script_id == script_id)
        .delete()
    )
    db.commit()

    return {
        "status": "success",
        "script_id": script_id,
        "uninstalled_from": deleted_count,
    }
