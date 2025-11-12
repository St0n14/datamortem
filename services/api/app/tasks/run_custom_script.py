"""
Celery task to execute custom scripts in isolated Docker containers.
Supports multiple languages: Python, Rust, Go, etc.
"""
from __future__ import annotations

import json
import os
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Optional

from ..celery_app import celery_app
from ..config import settings
from ..db import SessionLocal
from ..models import CustomScript, Evidence, TaskRun


# Language-specific configuration
LANGUAGE_CONFIG = {
    "python": {
        "image": "requiem-sandbox-python",
        "dockerfile": "Dockerfile.python",
        "source_filename": "script.py",
        "default_entry_point": "python script.py",
        "build_required": False,
    },
    "rust": {
        "image": "requiem-sandbox-rust",
        "dockerfile": "Dockerfile.rust",
        "source_filename": "src/main.rs",
        "default_entry_point": "./target/release/script",
        "default_build_command": "cargo build --release",
        "build_required": True,
    },
    "go": {
        "image": "requiem-sandbox-go",
        "dockerfile": "Dockerfile.go",
        "source_filename": "main.go",
        "default_entry_point": "./script",
        "default_build_command": "go build -o script main.go",
        "build_required": True,
    },
}


def _ensure_sandbox_image_exists(language: str, language_version: str) -> str:
    """
    Ensure the sandbox Docker image exists, build if necessary.
    Returns the full image tag.
    """
    config = LANGUAGE_CONFIG.get(language.lower())
    if not config:
        raise ValueError(f"Unsupported language: {language}")

    image_name = config["image"]
    image_tag = f"{image_name}:{language_version}"

    # Check if image exists
    result = subprocess.run(
        ["docker", "images", "-q", image_tag],
        capture_output=True,
        text=True,
    )

    if not result.stdout.strip():
        # Image doesn't exist, build it
        dockerfile_path = Path(__file__).parent.parent.parent.parent / "sandbox-runners" / config["dockerfile"]

        if not dockerfile_path.exists():
            raise FileNotFoundError(f"Dockerfile not found: {dockerfile_path}")

        print(f"Building sandbox image: {image_tag}")
        subprocess.run(
            [
                "docker", "build",
                "-f", str(dockerfile_path),
                "-t", image_tag,
                "--build-arg", f"PYTHON_VERSION={language_version}" if language == "python" else f"VERSION={language_version}",
                str(dockerfile_path.parent),
            ],
            check=True,
        )

    return image_tag


def _prepare_workspace(script: CustomScript, output_dir: str) -> Path:
    """
    Prepare the workspace directory with script files.
    Returns the workspace path.
    """
    workspace = Path(output_dir) / "workspace"
    workspace.mkdir(parents=True, exist_ok=True)

    config = LANGUAGE_CONFIG[script.language.lower()]
    source_file = workspace / config["source_filename"]

    # Create parent directories if needed (e.g., src/ for Rust)
    source_file.parent.mkdir(parents=True, exist_ok=True)

    # Write main source code
    source_file.write_text(script.source_code, encoding="utf-8")

    # Handle additional files (multi-file projects)
    if script.additional_files:
        try:
            additional = json.loads(script.additional_files)
            for filename, content in additional.items():
                file_path = workspace / filename
                file_path.parent.mkdir(parents=True, exist_ok=True)
                file_path.write_text(content, encoding="utf-8")
        except json.JSONDecodeError as e:
            print(f"Warning: Could not parse additional_files: {e}")

    # Language-specific setup
    if script.language.lower() == "rust":
        # Create Cargo.toml
        cargo_toml = workspace / "Cargo.toml"
        cargo_content = f"""[package]
name = "script"
version = "0.1.0"
edition = "2021"

[dependencies]
{script.requirements or ""}
"""
        cargo_toml.write_text(cargo_content, encoding="utf-8")

    elif script.language.lower() == "go":
        # Create go.mod if dependencies specified
        if script.requirements:
            go_mod = workspace / "go.mod"
            go_mod.write_text(f"module script\n\ngo {script.language_version}\n\n{script.requirements}", encoding="utf-8")

    elif script.language.lower() == "python":
        # Create requirements.txt
        if script.requirements:
            req_file = workspace / "requirements.txt"
            req_file.write_text(script.requirements.strip() + "\n", encoding="utf-8")

    return workspace


def _run_build_in_container(
    image_tag: str,
    workspace: Path,
    build_command: str,
    memory_limit_mb: int,
    timeout_seconds: int,
) -> subprocess.CompletedProcess:
    """
    Run the build command in the Docker container.
    """
    docker_cmd = [
        "docker", "run",
        "--rm",
        "--network", "none",  # No network access during build
        "--memory", f"{memory_limit_mb}m",
        "--memory-swap", f"{memory_limit_mb}m",
        "--cpus", "2.0",  # Build can use more CPUs
        "-v", f"{workspace.absolute()}:/workspace:rw",
        "-w", "/workspace",
        "--user", "sandbox",
        image_tag,
        "sh", "-c", build_command,
    ]

    result = subprocess.run(
        docker_cmd,
        capture_output=True,
        text=True,
        timeout=timeout_seconds,
    )

    return result


def _run_script_in_container(
    image_tag: str,
    workspace: Path,
    entry_point: str,
    env_vars: dict,
    evidence_path: Optional[str],
    output_dir: str,
    memory_limit_mb: int,
    cpu_limit: Optional[str],
    timeout_seconds: int,
) -> subprocess.CompletedProcess:
    """
    Run the script in the Docker container with security restrictions.
    """
    docker_cmd = [
        "docker", "run",
        "--rm",
        "--network", "none",  # No network access
        "--read-only",  # Filesystem is read-only
        "--tmpfs", "/tmp:rw,noexec,nosuid,size=100m",  # Writable /tmp
        "--memory", f"{memory_limit_mb}m",
        "--memory-swap", f"{memory_limit_mb}m",  # No swap
        "--pids-limit", "100",  # Max 100 processes
        "--ulimit", "nofile=1024:1024",  # Max 1024 file descriptors
        "--security-opt", "no-new-privileges",  # Can't gain privileges
        "--cap-drop", "ALL",  # Drop all Linux capabilities
    ]

    # CPU limit
    if cpu_limit:
        docker_cmd.extend(["--cpus", cpu_limit])
    else:
        docker_cmd.extend(["--cpus", "1.0"])  # Default 1 CPU core

    # Mount workspace (read-only)
    docker_cmd.extend(["-v", f"{workspace.absolute()}:/workspace:ro"])

    # Mount output directory (read-write)
    docker_cmd.extend(["-v", f"{output_dir}:/output:rw"])

    # Mount evidence if provided (read-only)
    if evidence_path and os.path.exists(evidence_path):
        docker_cmd.extend(["-v", f"{evidence_path}:/evidence:ro"])
        env_vars["EVIDENCE_PATH"] = "/evidence"

    # Add environment variables
    for key, value in env_vars.items():
        docker_cmd.extend(["-e", f"{key}={value}"])

    # Set working directory and user
    docker_cmd.extend([
        "-w", "/workspace",
        "--user", "sandbox",
        image_tag,
    ])

    # Add entry point command
    docker_cmd.extend(["sh", "-c", entry_point])

    result = subprocess.run(
        docker_cmd,
        capture_output=True,
        text=True,
        timeout=timeout_seconds,
    )

    return result


@celery_app.task(bind=True, name="run_custom_script")
def run_custom_script(self, script_id: int, evidence_uid: str, task_run_id: int):
    """
    Execute a custom script in an isolated Docker container.
    Supports Python, Rust, Go, and other languages.
    """
    db = SessionLocal()
    try:
        run: TaskRun | None = db.query(TaskRun).filter_by(id=task_run_id).one_or_none()
        script: CustomScript | None = db.query(CustomScript).filter_by(id=script_id).one_or_none()
        evidence: Evidence | None = db.query(Evidence).filter_by(evidence_uid=evidence_uid).one_or_none()

        if not run or not script or not evidence:
            if run:
                run.status = "error"
                run.error_message = "Script or evidence not found"
                run.ended_at_utc = datetime.utcnow()
                db.commit()
            return

        case = evidence.case
        if not case:
            run.status = "error"
            run.error_message = "Case not found for evidence"
            run.ended_at_utc = datetime.utcnow()
            db.commit()
            return

        # Validate language support
        if script.language.lower() not in LANGUAGE_CONFIG:
            run.status = "error"
            run.error_message = f"Language {script.language} not supported. Supported: {', '.join(LANGUAGE_CONFIG.keys())}"
            run.ended_at_utc = datetime.utcnow()
            db.commit()
            return

        # Setup output directory
        safe_name = script.name.replace("/", "_").replace(" ", "_")
        output_dir = os.path.join(
            settings.dm_lake_root,
            case.case_id,
            evidence_uid,
            "scripts",
            f"{safe_name}_{script.id}",
        )
        os.makedirs(output_dir, exist_ok=True)

        run.status = "running"
        run.started_at_utc = datetime.utcnow()
        run.progress_message = "preparing docker environment"
        db.commit()

        try:
            # Ensure Docker image exists
            run.progress_message = f"building {script.language} sandbox image"
            db.commit()

            image_tag = _ensure_sandbox_image_exists(script.language, script.language_version)

            # Prepare workspace
            run.progress_message = "preparing workspace"
            db.commit()

            workspace = _prepare_workspace(script, output_dir)

            config = LANGUAGE_CONFIG[script.language.lower()]

            # Build step (if required)
            if config.get("build_required", False):
                run.progress_message = f"building {script.language} script"
                db.commit()

                build_command = script.build_command or config.get("default_build_command")
                if not build_command:
                    raise ValueError(f"Build command required for {script.language} but not specified")

                build_result = _run_build_in_container(
                    image_tag=image_tag,
                    workspace=workspace,
                    build_command=build_command,
                    memory_limit_mb=script.memory_limit_mb,
                    timeout_seconds=min(script.timeout_seconds, 600),  # Max 10 min for build
                )

                if build_result.returncode != 0:
                    run.status = "error"
                    run.ended_at_utc = datetime.utcnow()
                    run.error_message = f"Build failed:\n{build_result.stderr}"
                    run.progress_message = "build failed"
                    db.commit()
                    return

            # Execute script
            run.progress_message = "executing script in sandbox"
            db.commit()

            entry_point = script.entry_point or config["default_entry_point"]

            env_vars = {
                "CASE_ID": case.case_id,
                "EVIDENCE_UID": evidence_uid,
                "OUTPUT_DIR": "/output",
            }

            exec_result = _run_script_in_container(
                image_tag=image_tag,
                workspace=workspace,
                entry_point=entry_point,
                env_vars=env_vars,
                evidence_path=evidence.local_path,
                output_dir=output_dir,
                memory_limit_mb=script.memory_limit_mb,
                cpu_limit=script.cpu_limit,
                timeout_seconds=script.timeout_seconds,
            )

            # Save output
            output_path = os.path.join(output_dir, "output.txt")
            with open(output_path, "w", encoding="utf-8") as f:
                f.write(f"=== STDOUT ===\n")
                f.write(exec_result.stdout or "(empty)")
                f.write(f"\n\n=== STDERR ===\n")
                f.write(exec_result.stderr or "(empty)")
                f.write(f"\n\n=== EXIT CODE ===\n")
                f.write(str(exec_result.returncode))

            if exec_result.returncode == 0:
                run.status = "success"
                run.ended_at_utc = datetime.utcnow()
                run.output_path = output_path
                run.progress_message = "script execution complete"
            else:
                run.status = "error"
                run.ended_at_utc = datetime.utcnow()
                run.output_path = output_path
                run.error_message = f"Script exited with code {exec_result.returncode}"
                run.progress_message = "script execution failed"

            db.commit()

        except subprocess.TimeoutExpired:
            run.status = "error"
            run.ended_at_utc = datetime.utcnow()
            run.error_message = f"Script execution timed out after {script.timeout_seconds} seconds"
            run.progress_message = "execution timed out"
            db.commit()
            raise
        except Exception as script_error:
            run.status = "error"
            run.ended_at_utc = datetime.utcnow()
            run.error_message = str(script_error)
            run.progress_message = "script execution failed"
            db.commit()
            raise
    finally:
        db.close()
