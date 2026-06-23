"""
Diff engine using Python's difflib.

Computes unified diffs by comparing 'before' and 'after' file snapshots
stored in SQLite. No git dependency required.
"""

import difflib

import database


def compute_unified_diff(before: str, after: str, file_path: str) -> str:
    """
    Compute a unified diff between two strings.

    Args:
        before: The original file content.
        after: The modified file content.
        file_path: Path to display in the diff header.

    Returns:
        Unified diff string.
    """
    before_lines = before.splitlines(keepends=True)
    after_lines = after.splitlines(keepends=True)
    diff = difflib.unified_diff(
        before_lines,
        after_lines,
        fromfile=f"a/{file_path}",
        tofile=f"b/{file_path}",
    )
    return "".join(diff)


async def compute_session_diff(session_id: str) -> str:
    """
    Compute unified diff for all changed files in a session.

    Fetches before/after snapshots from the database and generates
    a concatenated unified diff for all changed files.
    """
    changed_files = await database.get_changed_files(session_id)
    if not changed_files:
        return ""

    diffs = []
    for cf in changed_files:
        file_path = cf["file_path"]
        action = cf["action"]

        before = await database.get_file_snapshot(session_id, file_path, "before")
        after = await database.get_file_snapshot(session_id, file_path, "after")

        # Handle different change types
        if action == "created" or before is None:
            # New file: everything is an addition
            before = ""
            if after is None:
                after = ""
        elif action == "deleted" or after is None:
            # Deleted file: everything is a removal
            if after is None:
                after = ""
        else:
            # Modified file: compare before and after
            if before is None:
                before = ""
            if after is None:
                after = ""

        diff = compute_unified_diff(before, after, file_path)
        if diff:
            diffs.append(diff)

    return "\n".join(diffs)


async def compute_file_diff(session_id: str, file_path: str) -> str:
    """
    Compute unified diff for a single file in a session.
    """
    before = await database.get_file_snapshot(session_id, file_path, "before")
    after = await database.get_file_snapshot(session_id, file_path, "after")

    before = before or ""
    after = after or ""

    return compute_unified_diff(before, after, file_path)
