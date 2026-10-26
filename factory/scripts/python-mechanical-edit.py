#!/usr/bin/env python3
"""Fail-closed identifier rename, import-only, and format-only apply for Python."""

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


def bound_name(alias: ast.alias) -> str:
    if alias.asname:
        return alias.asname
    return alias.name.split(".", 1)[0]


def format_import(node: ast.Import | ast.ImportFrom) -> str:
    if isinstance(node, ast.Import):
        parts: list[str] = []
        for alias in node.names:
            if alias.asname:
                parts.append(f"{alias.name} as {alias.asname}")
            else:
                parts.append(alias.name)
        return "import " + ", ".join(parts)
    module = node.module or ""
    dots = "." * node.level
    parts = []
    for alias in node.names:
        if alias.asname:
            parts.append(f"{alias.name} as {alias.asname}")
        else:
            parts.append(alias.name)
    return f"from {dots}{module} import {', '.join(parts)}"


def is_future_import(node: ast.AST) -> bool:
    return isinstance(node, ast.ImportFrom) and node.module == "__future__"


def has_future_annotations(tree: ast.AST) -> bool:
    for node in tree.body:
        if not isinstance(node, ast.ImportFrom) or node.module != "__future__":
            continue
        if any(alias.name == "annotations" for alias in node.names):
            return True
    return False


def comments_on_lines(source: str, start_line: int, end_line: int) -> bool:
    readline = StringIO(source).readline
    for token in tokenize.generate_tokens(readline):
        if token.type == tokenize.COMMENT and start_line <= token.start[0] <= end_line:
            return True
    return False


def used_names(tree: ast.AST) -> set[str]:
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            continue
        if isinstance(node, ast.Name):
            names.add(node.id)
    return names


def non_import_dump(source: str) -> str:
    tree = ast.parse(source)
    remaining = [
        node
        for node in tree.body
        if not isinstance(node, (ast.Import, ast.ImportFrom))
    ]
    return ast.dump(ast.Module(body=remaining, type_ignores=[]), include_attributes=False)


def plan_rename(root: str, payload: dict[str, Any]) -> dict[str, Any]:
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


SIGNIFICANT_TOKEN_TYPES = {
    tokenize.NAME,
    tokenize.NUMBER,
    tokenize.STRING,
    tokenize.OP,
    tokenize.COMMENT,
}


def python_shape(source: str) -> str:
    return ast.dump(ast.parse(source), include_attributes=False)


def significant_tokens(source: str) -> list[tuple[int, str]]:
    return [
        (token.type, token.string)
        for token in tokenize.generate_tokens(StringIO(source).readline)
        if token.type in SIGNIFICANT_TOKEN_TYPES
    ]


def format_python(source: str) -> str:
    tokens = list(tokenize.generate_tokens(StringIO(source).readline))
    next_source = tokenize.untokenize((token.type, token.string) for token in tokens)
    if python_shape(source) != python_shape(next_source):
        raise ValueError("format rewrite would change non-whitespace structure")
    if significant_tokens(source) != significant_tokens(next_source):
        raise ValueError("format rewrite would change non-whitespace structure")
    return next_source


def plan_format_only(root: str, payload: dict[str, Any]) -> dict[str, Any]:
    files = payload.get("files") or []
    if not files:
        return {"ok": False, "reason": "format-only requires files"}
    listed = [os.path.realpath(os.path.join(root, file)) for file in files]
    rewritten: dict[str, str] = {}
    for path in listed:
        try:
            with open(path, encoding="utf-8") as handle:
                text = handle.read()
        except OSError:
            return {"ok": False, "reason": f"missing file: {relative_to(root, path)}"}
        try:
            next_text = format_python(text)
        except (ValueError, SyntaxError, tokenize.TokenError):
            return {"ok": False, "reason": "python format rewrite was not proven"}
        if next_text != text:
            rewritten[relative_to(root, path)] = next_text
    return {"ok": True, "files": rewritten}


def plan_import_only(root: str, payload: dict[str, Any]) -> dict[str, Any]:
    files = payload.get("files") or []
    if not files:
        return {"ok": False, "reason": "import-only requires files"}
    listed = [os.path.realpath(os.path.join(root, file)) for file in files]
    rewritten: dict[str, str] = {}
    for path in listed:
        try:
            with open(path, encoding="utf-8") as handle:
                text = handle.read()
        except OSError:
            return {"ok": False, "reason": f"missing file: {relative_to(root, path)}"}
        try:
            next_text = rewrite_unused_imports(text)
        except ValueError as error:
            return {"ok": False, "reason": str(error)}
        except SyntaxError:
            return {"ok": False, "reason": "python source could not be parsed"}
        if next_text != text:
            rewritten[relative_to(root, path)] = next_text
    return {"ok": True, "files": rewritten}


def rewrite_unused_imports(source: str) -> str:
    tree = ast.parse(source)
    if has_future_annotations(tree):
        raise ValueError("python import-only cannot prove usage with postponed annotations")
    top_imports = [
        node
        for node in tree.body
        if isinstance(node, (ast.Import, ast.ImportFrom))
    ]
    top_ids = {id(node) for node in top_imports}
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)) and id(node) not in top_ids:
            raise ValueError("python import-only cannot prove nested imports")
    used = used_names(tree)
    replacements: list[tuple[int, int, str]] = []
    for node in top_imports:
        if node.end_lineno is None:
            raise ValueError("python import statement has no end line")
        if comments_on_lines(source, node.lineno, node.end_lineno):
            raise ValueError("python import-only cannot prove imports that carry comments")
        if any(alias.name == "*" for alias in node.names):
            raise ValueError("python import-only cannot prove star imports")
        if is_future_import(node):
            continue
        kept = [alias for alias in node.names if bound_name(alias) in used]
        if len(kept) == len(node.names):
            continue
        replacement = ""
        if kept:
            node.names = kept
            replacement = format_import(node)
        replacements.append((node.lineno, node.end_lineno, replacement))
    if not replacements:
        return source
    lines = source.splitlines(keepends=True)
    if lines and not source.endswith("\n") and not source.endswith("\r"):
        # splitlines(keepends=True) still yields the last line without a newline
        pass
    for start_line, end_line, replacement in reversed(replacements):
        start = start_line - 1
        end = end_line
        suffix = ""
        if replacement:
            original = "".join(lines[start:end])
            suffix = "\n" if original.endswith("\n") or original.endswith("\r\n") else ""
            lines[start:end] = [replacement + suffix]
        else:
            del lines[start:end]
    next_source = "".join(lines)
    if non_import_dump(source) != non_import_dump(next_source):
        raise ValueError("import rewrite would change code that is not an import")
    return next_source


def plan(root: str, payload: dict[str, Any]) -> dict[str, Any]:
    operation = payload.get("operation") or "rename"
    if operation == "rename":
        return plan_rename(root, payload)
    if operation == "import-only":
        return plan_import_only(root, payload)
    if operation == "format-only":
        return plan_format_only(root, payload)
    return {"ok": False, "reason": "no proven python script for this operation"}


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
