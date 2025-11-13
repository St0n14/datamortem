"""
Celery task to execute custom scripts in isolated Docker containers.
Supports multiple languages: Python, Rust, Go, etc.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional, Callable

import docker
from docker.errors import ImageNotFound, BuildError, ContainerError, APIError

from ..celery_app import celery_app
from ..config import settings
from ..db import SessionLocal
from ..models import CustomScript, Evidence, TaskRun
from .index_results import index_results_task


# Docker client instance (lazy initialization)
_docker_client: Optional[docker.DockerClient] = None


def _get_docker_client() -> docker.DockerClient:
    """Get or create Docker client instance with increased timeouts."""
    global _docker_client
    if _docker_client is None:
        # Create client with environment settings
        base_url = os.getenv('DOCKER_HOST', 'unix:///var/run/docker.sock')

        # For DinD over TCP, we need to increase both API timeout and HTTP timeout
        # The timeout parameter in docker.from_env() only sets the HTTP read timeout
        # We need to set it high enough for long-running scripts
        _docker_client = docker.DockerClient(
            base_url=base_url,
            timeout=900,  # 15 minutes timeout for HTTP operations
            tls=False,
        )

        # Log connection info for debugging
        print(f"[DinD] Docker client connected to: {base_url} (timeout=900s)")

        # Verify connection
        try:
            info = _docker_client.info()
            print(f"[DinD] Docker daemon version: {info.get('ServerVersion', 'unknown')}")
            print(f"[DinD] Storage driver: {info.get('Driver', 'unknown')}")
        except Exception as e:
            print(f"[DinD] Warning: Could not verify Docker connection: {e}")
    return _docker_client


def _get_lake_mount_path() -> str:
    """
    Get the /lake mount path for DinD.
    With DinD, /lake is bind-mounted from the host into the DinD daemon,
    so we can directly mount it into sandbox containers using bind mounts.
    """
    # In DinD setup, /lake is mounted as a volume in the dind container
    # We can mount it directly using bind mounts from /lake
    return "/lake"


@dataclass
class ContainerResult:
    """Result of container execution, similar to subprocess.CompletedProcess."""
    returncode: int
    stdout: str
    stderr: str


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

    client = _get_docker_client()

    # Check if image exists
    try:
        client.images.get(image_tag)
        print(f"Sandbox image {image_tag} already exists")
    except ImageNotFound:
        # Image doesn't exist, build it
        dockerfile_path = Path(__file__).parent.parent.parent.parent / "sandbox-runners" / config["dockerfile"]

        if not dockerfile_path.exists():
            raise FileNotFoundError(f"Dockerfile not found: {dockerfile_path}")

        print(f"Building sandbox image: {image_tag}")
        
        build_args = {}
        if language == "python":
            build_args["PYTHON_VERSION"] = language_version
        else:
            build_args["VERSION"] = language_version

        try:
            image, build_logs = client.images.build(
                path=str(dockerfile_path.parent),
                dockerfile=config["dockerfile"],
                tag=image_tag,
                buildargs=build_args,
                rm=True,  # Remove intermediate containers
            )
            print(f"Successfully built image: {image_tag}")
        except BuildError as e:
            error_msg = "\n".join([log.get("stream", "") for log in e.build_log if log.get("stream")])
            raise RuntimeError(f"Failed to build Docker image {image_tag}: {error_msg}") from e

    return image_tag


def _prepare_workspace(script: CustomScript, output_dir: str) -> Path:
    """
    Prepare the workspace directory with script files.
    Returns the workspace path.
    """
    workspace = Path(output_dir) / "workspace"
    workspace.mkdir(parents=True, exist_ok=True)

    # Make workspace writable for sandbox user
    try:
        os.chmod(str(workspace), 0o777)
    except Exception as e:
        print(f"Warning: Could not set permissions on workspace: {e}")

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
    check_cancelled: Optional[Callable[[], bool]] = None,
) -> ContainerResult:
    """
    Run the build command in the Docker container.
    """
    client = _get_docker_client()

    # Calculate relative path from /lake
    workspace_str = str(workspace)
    if workspace_str.startswith(settings.dm_lake_root):
        workspace_rel = workspace_str[len(settings.dm_lake_root):].lstrip("/")
    else:
        workspace_rel = workspace_str.lstrip("/")

    container = None
    try:
        # Mount /lake using bind mount (available in DinD)
        lake_mount_path = _get_lake_mount_path()
        workspace_path = f"/lake/{workspace_rel}"

        # Use cd in command - /lake will be bind-mounted
        build_cmd = f"cd {workspace_path} && {build_command}"

        # Use containers.run() with bind mounts (works with DinD)
        container = client.containers.run(
            image_tag,
            command=["sh", "-c", build_cmd],
            remove=False,
            detach=True,
            network_disabled=True,  # No network access during build
            mem_limit=f"{memory_limit_mb}m",
            memswap_limit=f"{memory_limit_mb}m",
            nano_cpus=2_000_000_000,  # 2.0 CPUs (in nanoseconds)
            mounts=[
                docker.types.Mount(
                    target="/lake",
                    source=lake_mount_path,
                    type="bind",
                    read_only=False
                )
            ],
            user="sandbox",
        )

        # Wait for container to finish with timeout, checking for cancellation periodically
        try:
            import time
            # Poll container status instead of using wait() to avoid HTTP timeout issues
            check_interval = 2  # Check every 2 seconds
            elapsed = 0

            while elapsed < timeout_seconds:
                # Check if task was cancelled
                if check_cancelled and check_cancelled():
                    print(f"Task cancelled, stopping build container...")
                    container.stop(timeout=5)
                    raise InterruptedError("Task was cancelled by user")

                # Reload container state
                try:
                    container.reload()
                    status = container.status

                    # Check if container has finished
                    if status in ("exited", "dead"):
                        break

                    # Container still running, wait a bit
                    time.sleep(check_interval)
                    elapsed += check_interval

                except Exception as reload_error:
                    # If reload fails, container might be gone - try to continue
                    print(f"Warning: container.reload() failed: {reload_error}")
                    break

            # Check if we timed out
            if elapsed >= timeout_seconds and container.status == "running":
                raise TimeoutError(f"Container execution timed out after {timeout_seconds} seconds")

            # Get exit code and logs
            container.reload()
            exit_code = container.attrs.get("State", {}).get("ExitCode", 1)

            stdout = container.logs(stdout=True, stderr=False).decode("utf-8", errors="replace")
            stderr = container.logs(stdout=False, stderr=True).decode("utf-8", errors="replace")
        except InterruptedError:
            # Task was cancelled, re-raise to be handled by caller
            raise
        except Exception as wait_error:
            # If timeout or other error, try to get logs and stop container
            try:
                stdout = container.logs(stdout=True, stderr=False).decode("utf-8", errors="replace") if container else ""
                stderr = container.logs(stdout=False, stderr=True).decode("utf-8", errors="replace") if container else ""
                if not stderr:
                    stderr = str(wait_error)
            except Exception:
                stderr = str(wait_error)
                stdout = ""
            finally:
                if container:
                    try:
                        container.stop(timeout=5)
                    except Exception:
                        pass
                    try:
                        container.remove()
                    except Exception:
                        pass
            # Re-raise timeout errors
            if "timeout" in str(wait_error).lower():
                raise TimeoutError(f"Container execution timed out after {timeout_seconds} seconds") from wait_error
            raise

        return ContainerResult(
            returncode=exit_code if isinstance(exit_code, int) else exit_code.get("StatusCode", 1),
            stdout=stdout,
            stderr=stderr,
        )
    except docker.errors.ContainerError as e:
        return ContainerResult(
            returncode=e.exit_status,
            stdout=e.stdout.decode("utf-8", errors="replace") if e.stdout else "",
            stderr=e.stderr.decode("utf-8", errors="replace") if e.stderr else str(e),
        )
    except (TimeoutError, docker.errors.APIError, InterruptedError) as e:
        # Re-raise timeout errors and cancellation to be handled by caller
        raise
    except Exception as e:
        return ContainerResult(
            returncode=1,
            stdout="",
            stderr=str(e),
        )
    finally:
        # Ensure container is cleaned up
        if container:
            try:
                container.remove(force=True)
            except Exception:
                pass


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
    check_cancelled: Optional[Callable[[], bool]] = None,
) -> ContainerResult:
    """
    Run the script in the Docker container with security restrictions.
    """
    client = _get_docker_client()

    # Calculate relative paths from /lake
    workspace_str = str(workspace)
    if workspace_str.startswith(settings.dm_lake_root):
        workspace_rel = workspace_str[len(settings.dm_lake_root):].lstrip("/")
    else:
        workspace_rel = workspace_str.lstrip("/")

    output_dir_str = str(output_dir)
    if output_dir_str.startswith(settings.dm_lake_root):
        output_dir_rel = output_dir_str[len(settings.dm_lake_root):].lstrip("/")
    else:
        output_dir_rel = output_dir_str.lstrip("/")

    # Prepare mounts - use bind mount to /lake (available in DinD)
    lake_mount_path = _get_lake_mount_path()
    print(f"Using bind mount: {lake_mount_path} for /lake")

    # Set paths relative to /lake
    workspace_path = f"/lake/{workspace_rel}"
    output_path = f"/lake/{output_dir_rel}"

    # Update OUTPUT_DIR environment variable to use the correct path
    env_vars["OUTPUT_DIR"] = output_path

    # Prepare mounts list with bind mount
    mounts_list = [
        docker.types.Mount(
            target="/lake",
            source=lake_mount_path,
            type="bind",
            read_only=False
        )
    ]

    # Mount evidence if provided (read-only)
    evidence_mount_path = None
    if evidence_path and os.path.exists(evidence_path):
        evidence_str = str(evidence_path)
        if evidence_str.startswith(settings.dm_lake_root):
            evidence_rel = evidence_str[len(settings.dm_lake_root):].lstrip("/")
            evidence_mount_path = f"/lake/{evidence_rel}"
        else:
            # If evidence is outside /lake, we need to mount it separately
            # This shouldn't happen in normal operation, but handle it
            mounts_list.append(
                docker.types.Mount(
                    target="/evidence",
                    source=evidence_path,
                    type="bind",
                    read_only=True
                )
            )
            evidence_mount_path = "/evidence"
        env_vars["EVIDENCE_PATH"] = evidence_mount_path

    # Convert CPU limit to nanoseconds
    if cpu_limit:
        cpu_nanos = int(float(cpu_limit) * 1_000_000_000)
    else:
        cpu_nanos = 1_000_000_000  # Default 1 CPU core

    container = None
    try:
        # Use cd in command - the volume will be mounted at /lake
        entry_cmd = f"cd {workspace_path} && {entry_point}"
        
        # Use containers.run() with mounts API - this should work correctly
        container = client.containers.run(
            image_tag,
            command=["sh", "-c", entry_cmd],
            remove=False,
            detach=True,
            network_disabled=True,  # No network access
            # Note: read_only=True conflicts with writable volume mounts
            # Security is enforced via cap_drop, security_opt, and user restrictions
            tmpfs={"/tmp": "rw,noexec,nosuid,size=100m"},  # Writable /tmp
            mem_limit=f"{memory_limit_mb}m",
            memswap_limit=f"{memory_limit_mb}m",  # No swap
            pids_limit=100,  # Max 100 processes
            ulimits=[
                docker.types.Ulimit(name="nofile", soft=1024, hard=1024),  # Max 1024 file descriptors
            ],
            security_opt=["no-new-privileges"],  # Can't gain privileges
            cap_drop=["ALL"],  # Drop all Linux capabilities
            nano_cpus=cpu_nanos,
            mounts=mounts_list,
            user="sandbox",
            environment=env_vars,
        )

        # Wait for container to finish with timeout, checking for cancellation periodically
        try:
            import time
            # Poll container status instead of using wait() to avoid HTTP timeout issues
            check_interval = 2  # Check every 2 seconds
            elapsed = 0

            while elapsed < timeout_seconds:
                # Check if task was cancelled
                if check_cancelled and check_cancelled():
                    print(f"Task cancelled, stopping script container...")
                    container.stop(timeout=5)
                    raise InterruptedError("Task was cancelled by user")

                # Reload container state
                try:
                    container.reload()
                    status = container.status

                    # Check if container has finished
                    if status in ("exited", "dead"):
                        break

                    # Container still running, wait a bit
                    time.sleep(check_interval)
                    elapsed += check_interval

                except Exception as reload_error:
                    # If reload fails, container might be gone - try to continue
                    print(f"Warning: container.reload() failed: {reload_error}")
                    break

            # Check if we timed out
            if elapsed >= timeout_seconds and container.status == "running":
                raise TimeoutError(f"Container execution timed out after {timeout_seconds} seconds")

            # Get exit code and logs
            container.reload()
            exit_code = container.attrs.get("State", {}).get("ExitCode", 1)

            stdout = container.logs(stdout=True, stderr=False).decode("utf-8", errors="replace")
            stderr = container.logs(stdout=False, stderr=True).decode("utf-8", errors="replace")
        except InterruptedError:
            # Task was cancelled, re-raise to be handled by caller
            raise
        except Exception as wait_error:
            # If timeout or other error, try to get logs and stop container
            try:
                stdout = container.logs(stdout=True, stderr=False).decode("utf-8", errors="replace") if container else ""
                stderr = container.logs(stdout=False, stderr=True).decode("utf-8", errors="replace") if container else ""
                if not stderr:
                    stderr = str(wait_error)
            except Exception:
                stderr = str(wait_error)
                stdout = ""
            finally:
                if container:
                    try:
                        container.stop(timeout=5)
                    except Exception:
                        pass
                    try:
                        container.remove()
                    except Exception:
                        pass
            # Re-raise timeout errors
            if "timeout" in str(wait_error).lower():
                raise TimeoutError(f"Container execution timed out after {timeout_seconds} seconds") from wait_error
            raise

        return ContainerResult(
            returncode=exit_code if isinstance(exit_code, int) else exit_code.get("StatusCode", 1),
            stdout=stdout,
            stderr=stderr,
        )
    except docker.errors.ContainerError as e:
        return ContainerResult(
            returncode=e.exit_status,
            stdout=e.stdout.decode("utf-8", errors="replace") if e.stdout else "",
            stderr=e.stderr.decode("utf-8", errors="replace") if e.stderr else str(e),
        )
    except (TimeoutError, docker.errors.APIError, InterruptedError) as e:
        # Re-raise timeout errors and cancellation to be handled by caller
        raise
    except Exception as e:
        return ContainerResult(
            returncode=1,
            stdout="",
            stderr=str(e),
        )
    finally:
        # Ensure container is cleaned up
        if container:
            try:
                container.remove(force=True)
            except Exception:
                pass


def _auto_index_script_results(output_dir: str, script: CustomScript, run: TaskRun) -> None:
    """
    Automatically trigger indexation if the script produced indexable files.

    Searches for .jsonl, .csv, or .parquet files in the output directory
    and triggers indexation tasks for each one found.

    Skips files larger than 500MB to avoid OOM issues.
    After successful indexation, deletes the source files to save disk space.
    """
    indexable_extensions = {".jsonl", ".csv", ".parquet"}
    indexed_count = 0
    skipped_count = 0
    max_file_size = 500 * 1024 * 1024  # 500MB in bytes

    try:
        output_path = Path(output_dir)
        files_to_index = []

        # Collect all indexable files
        for file_path in output_path.rglob("*"):
            if file_path.is_file() and file_path.suffix.lower() in indexable_extensions:
                # Skip the output.txt file
                if file_path.name == "output.txt":
                    continue

                files_to_index.append(file_path)

        # Sort files to have consistent ordering
        files_to_index.sort()

        print(f"[Auto-Index] Found {len(files_to_index)} file(s) to index")

        # Index each file
        for file_path in files_to_index:
            file_size = file_path.stat().st_size
            file_size_mb = file_size / (1024 * 1024)

            if file_size > max_file_size:
                print(f"[Auto-Index] Skipping large file: {file_path.name} ({file_size_mb:.1f}MB)")
                print(f"  File too large for auto-indexation (limit: 500MB)")
                print(f"  Consider splitting the file or use manual indexation")
                skipped_count += 1
                continue

            parser_name = f"custom_script.{script.name}"

            print(f"[Auto-Index] Indexing {file_path.name} ({file_size_mb:.1f}MB)")

            # Trigger indexation task synchronously to ensure completion before cleanup
            try:
                from .index_results import index_results_task

                # Call synchronously (not .delay()) to wait for completion
                result = index_results_task(
                    task_run_id=run.id,
                    file_path=str(file_path),
                    parser_name=parser_name
                )

                if result.get("status") == "success":
                    stats = result.get("stats", {})
                    print(f"  ✓ Indexed {stats.get('indexed', 0)} documents")
                    indexed_count += 1

                    # Delete the file after successful indexation to save space
                    try:
                        file_path.unlink()
                        print(f"  ✓ Cleaned up {file_path.name}")
                    except Exception as cleanup_error:
                        print(f"  Warning: Could not delete {file_path.name}: {cleanup_error}")
                else:
                    print(f"  ✗ Indexation failed: {result.get('error', 'unknown error')}")

            except Exception as index_error:
                print(f"[Auto-Index] Failed to index {file_path.name}: {index_error}")

        # Summary
        if indexed_count > 0:
            print(f"[Auto-Index] Successfully indexed and cleaned {indexed_count} file(s)")
        if skipped_count > 0:
            print(f"[Auto-Index] Skipped {skipped_count} large file(s) (>500MB)")
        if indexed_count == 0 and skipped_count == 0:
            print(f"[Auto-Index] No indexable files found in {output_dir}")

    except Exception as e:
        # Don't fail the main task if auto-indexation fails
        print(f"[Auto-Index] Error during auto-indexation: {e}")


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

        # Make output directory writable for sandbox user (UID 1000)
        # This allows the sandbox container to write results
        try:
            os.chmod(output_dir, 0o777)  # rwxrwxrwx - writable by all
        except Exception as e:
            print(f"Warning: Could not set permissions on {output_dir}: {e}")

        run.status = "running"
        run.started_at_utc = datetime.utcnow()
        run.progress_message = "preparing docker environment"
        db.commit()

        # Function to check if task was cancelled
        def check_cancelled() -> bool:
            """Check if the task was cancelled by checking the database."""
            db_check = SessionLocal()
            try:
                run_check = db_check.query(TaskRun).filter_by(id=task_run_id).one_or_none()
                if run_check and run_check.status == "killed":
                    return True
                return False
            finally:
                db_check.close()

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
                    check_cancelled=check_cancelled,
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
                # OUTPUT_DIR will be set by _run_script_in_container with the correct path
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
                check_cancelled=check_cancelled,
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
                db.commit()

                # Auto-index results if indexable files exist
                _auto_index_script_results(output_dir, script, run)
            else:
                run.status = "error"
                run.ended_at_utc = datetime.utcnow()
                run.output_path = output_path
                run.error_message = f"Script exited with code {exec_result.returncode}"
                run.progress_message = "script execution failed"
                db.commit()

        except InterruptedError:
            # Task was cancelled
            run.status = "killed"
            run.ended_at_utc = datetime.utcnow()
            run.error_message = "Task was cancelled by user"
            run.progress_message = "cancelled"
            db.commit()
            return
        except TimeoutError:
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
