#!/usr/bin/env python3
"""Fail-closed identifier rename for Python mechanical-edit units."""

from __future__ import annotations

import ast
import json
import os
import sys
import tokenize
from io import StringIO
from typing import Any

SKIP_DIRS = {
    ".git",
    "node_modules",
    "venv",
    ".venv",
    "dist",
    "__pycache__",
    ".tox",
}


def list_python_files(root: str) -> list[str]:
    found: list[str] = []
    for dirpath, dirs, files in os.walk(root):
        dirs[:] = [name for name in dirs if name not in SKIP_DIRS]
        for name in files:
            if name.endswith(".py") or name.endswith(".pyi"):
                found.append(os.path.join(dirpath, name))
    return found


def declaration_count(source: str, name: str) -> int:
    tree = ast.parse(source)
    count = 0
    for node in ast.walk(tree):
        if (
            isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))
            and node.name == name
        ):
            count += 1
    return count


def name_in_tokens(source: str, name: str) -> bool:
    readline = StringIO(source).readline
    for token in tokenize.generate_tokens(readline):
        if token.type == tokenize.NAME and token.string == name:
            return True
    return False


def rewrite_names(source: str, source_name: str, target_name: str) -> str:
    starts = [0]
    for index, char in enumerate(source):
        if char == "\n":
            starts.append(index + 1)
    replacements: list[tuple[int, int]] = []
    readline = StringIO(source).readline
    for token in tokenize.generate_tokens(readline):
        if token.type != tokenize.NAME or token.string != source_name:
            continue
        line, column = token.start
        start = starts[line - 1] + column
        replacements.append((start, start + len(source_name)))
    next_source = source
    for start, end in reversed(replacements):
        next_source = next_source[:start] + target_name + next_source[end:]
    return next_source


def relative_to(root: str, path: str) -> str:
    return os.path.relpath(path, root).replace(os.sep, "/")


def plan(root: str, payload: dict[str, Any]) -> dict[str, Any]:
    source_name = payload.get("from")
    target_name = payload.get("to")
    files = payload.get("files") or []
    if not source_name or not target_name or not files:
        return {"ok": False, "reason": "rename requires from, to, and files"}

    listed = [os.path.realpath(os.path.join(root, file)) for file in files]
    sources: dict[str, str] = {}
    declarations = 0
    for path in listed:
        try:
            with open(path, encoding="utf-8") as handle:
                text = handle.read()
        except OSError:
            return {"ok": False, "reason": f"missing file: {relative_to(root, path)}"}
        try:
            declarations += declaration_count(text, source_name)
        except SyntaxError:
            return {"ok": False, "reason": "python source could not be parsed"}
        if name_in_tokens(text, target_name):
            return {
                "ok": False,
                "reason": f"target identifier already exists: {target_name}",
            }
        sources[path] = text

    if declarations == 0:
        return {"ok": False, "reason": "source identifier was not found"}
    if declarations > 1:
        return {"ok": False, "reason": "source identifier is ambiguous"}

    listed_set = set(listed)
    for path in list_python_files(root):
        real = os.path.realpath(path)
        if real in listed_set:
            continue
        try:
            with open(real, encoding="utf-8") as handle:
                text = handle.read()
        except OSError:
            continue
        if name_in_tokens(text, source_name):
            return {
                "ok": False,
                "reason": "rename graph includes files that were not listed",
            }

    rewritten: dict[str, str] = {}
    for path, text in sources.items():
        next_text = rewrite_names(text, source_name, target_name)
        if next_text != text:
            rewritten[relative_to(root, path)] = next_text
    if not rewritten:
        return {"ok": False, "reason": "source identifier was not found"}
    return {"ok": True, "files": rewritten}


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: python-mechanical-edit.py <repoRoot> <input.json>", file=sys.stderr)
        return 2
    root = os.path.realpath(sys.argv[1])
    with open(sys.argv[2], encoding="utf-8") as handle:
        payload = json.load(handle)
    json.dump(plan(root, payload), sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
