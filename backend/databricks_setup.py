import os
import json
import tempfile
import asyncio
import subprocess

async def setup_databricks_bundle(workspace_path: str, target_project: str, default_catalog: str, personal_schema: str, language: str, emit_callback):
    """
    Initialize a Databricks bundle and pre-create the catalog/schemas/volumes
    using Databricks CLI natively.
    """
    databricks_config = os.path.join(workspace_path, target_project, "databricks.yml")
    if os.path.exists(databricks_config):
        await emit_callback(f"Project '{target_project}' already contains databricks.yml. Skipping bundle init.")
        return

    await emit_callback(f"Initializing new bundle project '{target_project}' (non-interactive, minimal template)...")
    temp_config = os.path.join(workspace_path, ".temp_init_config.json")
    try:
        with open(temp_config, "w", encoding="utf-8") as f:
            json.dump({
                "project_name": target_project,
                "default_catalog": default_catalog or target_project,
                "personal_schema": personal_schema or "no",
                "language": language or "python"
            }, f)
        
        databricks_exe = r"C:\Users\Gladwin.aj\AppData\Local\Microsoft\WinGet\Packages\Databricks.DatabricksCLI_Microsoft.Winget.Source_8wekyb3d8bbwe\databricks.exe"
        proc = await asyncio.create_subprocess_shell(
            f'"{databricks_exe}" bundle init default-minimal --config-file "{temp_config}" --output-dir "{workspace_path}"',
            cwd=workspace_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            error_msg = f"Bundle init failed: {stderr.decode()}"
            await emit_callback(error_msg)
            raise RuntimeError(error_msg)
        await emit_callback("Bundle initialization completed.")

    except Exception as e:
        await emit_callback(f"Failed to initialize bundle: {e}")
        raise e
    finally:
        if os.path.exists(temp_config):
            try:
                os.unlink(temp_config)
            except Exception:
                pass
