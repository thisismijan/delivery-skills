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


def source_offset(source: str, lineno: int, col: int) -> int:
    starts = [0]
    for index, char in enumerate(source):
        if char == "\n":
            starts.append(index + 1)
    return starts[lineno - 1] + col


def node_span(source: str, node: ast.AST) -> tuple[int, int] | None:
    lineno = getattr(node, "lineno", None)
    col = getattr(node, "col_offset", None)
    end_lineno = getattr(node, "end_lineno", None)
    end_col = getattr(node, "end_col_offset", None)
    if lineno is None or col is None or end_lineno is None or end_col is None:
        return None
    return source_offset(source, lineno, col), source_offset(source, end_lineno, end_col)


def function_args(node: ast.FunctionDef | ast.AsyncFunctionDef | ast.Lambda) -> list[ast.arg]:
    args = [
        *node.args.posonlyargs,
        *node.args.args,
        *node.args.kwonlyargs,
    ]
    if node.args.vararg:
        args.append(node.args.vararg)
    if node.args.kwarg:
        args.append(node.args.kwarg)
    return args


def call_name(node: ast.Call) -> str | None:
    func = node.func
    if isinstance(func, ast.Name):
        return func.id
    return None


class Binding:
    def __init__(self, kind: str, node: ast.AST, enclosing: ast.AST | None) -> None:
        self.kind = kind
        self.node = node
        self.enclosing = enclosing


def collect_bindings(tree: ast.AST, name: str) -> list[Binding]:
    found: list[Binding] = []
    stack: list[ast.AST] = []

    def visit(node: ast.AST) -> None:
        enclosing = stack[-1] if stack else None
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)):
            if not isinstance(node, ast.Lambda) and node.name == name:
                found.append(Binding("function", node, None))
            for arg in function_args(node):
                if arg.arg == name:
                    found.append(Binding("arg", arg, node))
            stack.append(node)
            for child in ast.iter_child_nodes(node):
                visit(child)
            stack.pop()
            return
        if isinstance(node, ast.ClassDef) and node.name == name:
            found.append(Binding("class", node, None))
        if isinstance(node, ast.Name) and node.id == name and isinstance(node.ctx, ast.Store):
            found.append(Binding("local", node, enclosing))
        if isinstance(node, ast.alias):
            bound = bound_name(node)
            if bound == name:
                found.append(Binding("import", node, enclosing))
        for child in ast.iter_child_nodes(node):
            visit(child)

    visit(tree)
    return found


def has_exec_or_eval(tree: ast.AST) -> bool:
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and call_name(node) in {"exec", "eval"}:
            return True
    return False


def has_attribute_named(tree: ast.AST, name: str) -> bool:
    for node in ast.walk(tree):
        if isinstance(node, ast.Attribute) and node.attr == name:
            return True
    return False


def replace_spans(source: str, spans: list[tuple[int, int]], target: str) -> str:
    next_source = source
    for start, end in sorted(spans, reverse=True):
        next_source = next_source[:start] + target + next_source[end:]
    return next_source


def scoped_rename(source: str, binding: Binding, source_name: str, target_name: str) -> str:
    enclosing = binding.enclosing
    if enclosing is None:
        tree = ast.parse(source)
        enclosing = tree
    if has_exec_or_eval(enclosing):
        raise ValueError("python local rename cannot prove exec or eval")
    if has_attribute_named(enclosing, source_name):
        raise ValueError("python local rename cannot prove attribute uses")
    spans: list[tuple[int, int]] = []
    for node in ast.walk(enclosing):
        if isinstance(node, ast.Name) and node.id == source_name:
            span = node_span(source, node)
            if span is None:
                raise ValueError("python local rename cannot prove this binding")
            spans.append(span)
        if isinstance(node, ast.arg) and node.arg == source_name:
            span = node_span(source, node)
            if span is None:
                raise ValueError("python local rename cannot prove this binding")
            spans.append(span)
    if not spans:
        raise ValueError("source identifier was not found")
    return replace_spans(source, spans, target_name)


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


PYTHON_BUILTINS = frozenset(
    {
        "ArithmeticError",
        "AssertionError",
        "AttributeError",
        "BaseException",
        "Exception",
        "False",
        "GeneratorExit",
        "ImportError",
        "IndexError",
        "KeyError",
        "KeyboardInterrupt",
        "LookupError",
        "NameError",
        "None",
        "OSError",
        "RuntimeError",
        "StopIteration",
        "True",
        "TypeError",
        "ValueError",
        "abs",
        "all",
        "any",
        "bool",
        "bytes",
        "callable",
        "chr",
        "classmethod",
        "dict",
        "dir",
        "divmod",
        "enumerate",
        "filter",
        "float",
        "format",
        "frozenset",
        "getattr",
        "globals",
        "hasattr",
        "hash",
        "help",
        "hex",
        "id",
        "input",
        "int",
        "isinstance",
        "issubclass",
        "iter",
        "len",
        "list",
        "locals",
        "map",
        "max",
        "min",
        "next",
        "object",
        "oct",
        "open",
        "ord",
        "pow",
        "print",
        "property",
        "range",
        "repr",
        "reversed",
        "round",
        "set",
        "setattr",
        "slice",
        "sorted",
        "staticmethod",
        "str",
        "sum",
        "super",
        "tuple",
        "type",
        "vars",
        "zip",
        "__name__",
        "__file__",
        "__package__",
        "__doc__",
        "__annotations__",
    }
)


def bound_in_file(tree: ast.AST) -> set[str]:
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            names.add(node.name)
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
            names.add(node.id)
        if isinstance(node, ast.arg):
            names.add(node.arg)
        if isinstance(node, ast.alias):
            names.add(bound_name(node))
        if isinstance(node, ast.ExceptHandler) and node.name:
            names.add(node.name)
    return names


def load_names(tree: ast.AST) -> set[str]:
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load):
            names.add(node.id)
    return names


def top_level_exports(tree: ast.AST) -> list[str]:
    names: list[str] = []
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            names.append(node.name)
        elif isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    names.append(target.id)
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            names.append(node.target.id)
    return names


def module_name(root: str, path: str) -> str | None:
    rel = relative_to(root, path)
    if rel.endswith(".py"):
        rel = rel[:-3]
    elif rel.endswith(".pyi"):
        rel = rel[:-4]
    else:
        return None
    if rel.endswith("/__init__"):
        rel = rel[: -len("/__init__")]
    if not rel:
        return None
    parts = rel.split("/")
    if any(not part.isidentifier() for part in parts):
        return None
    return ".".join(parts)


def index_python_exports(root: str) -> dict[str, list[tuple[str, str]]]:
    found: dict[str, list[tuple[str, str]]] = {}
    for path in list_python_files(root):
        real = os.path.realpath(path)
        module = module_name(root, real)
        if module is None:
            continue
        try:
            with open(real, encoding="utf-8") as handle:
                tree = ast.parse(handle.read())
        except (OSError, SyntaxError):
            continue
        for name in top_level_exports(tree):
            found.setdefault(name, []).append((real, module))
    return found


def insert_import_line(source: str, line: str) -> str:
    tree = ast.parse(source)
    last = 0
    for node in tree.body:
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            if node.end_lineno is None:
                continue
            last = node.end_lineno
        elif last:
            break
    insertion = line if line.endswith("\n") else f"{line}\n"
    if last == 0:
        if source and not source.startswith("\n") and not insertion.endswith("\n"):
            insertion = f"{insertion}\n"
        return insertion + source
    lines = source.splitlines(keepends=True)
    return "".join(lines[:last]) + insertion + "".join(lines[last:])


def add_unique_missing_imports(
    root: str,
    path: str,
    source: str,
    exports: dict[str, list[tuple[str, str]]],
) -> str:
    tree = ast.parse(source)
    missing = sorted(
        name
        for name in load_names(tree)
        if name not in bound_in_file(tree) and name not in PYTHON_BUILTINS
    )
    next_source = source
    for name in missing:
        candidates = [
            (real, module)
            for real, module in exports.get(name, [])
            if real != path
        ]
        unique: list[tuple[str, str]] = []
        seen: set[str] = set()
        for real, module in candidates:
            key = f"{real}::{module}"
            if key in seen:
                continue
            seen.add(key)
            unique.append((real, module))
        if len(unique) != 1 or unique[0] is None:
            continue
        _, module = unique[0]
        line = f"from {module} import {name}"
        trial = insert_import_line(next_source, line)
        if non_import_dump(next_source) != non_import_dump(trial):
            continue
        next_source = trial
    return next_source


def non_import_dump(source: str) -> str:
    tree = ast.parse(source)
    remaining = [
        node
        for node in tree.body
        if not isinstance(node, (ast.Import, ast.ImportFrom))
    ]
    return ast.dump(ast.Module(body=remaining, type_ignores=[]), include_attributes=False)


def unlisted_uses_name(root: str, listed: list[str], name: str) -> bool:
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
        if name_in_tokens(text, name):
            return True
    return False


def plan_local_rename(
    root: str,
    sources: dict[str, str],
    source_name: str,
    target_name: str,
) -> dict[str, Any]:
    chosen: Binding | None = None
    chosen_path: str | None = None
    scopes: set[tuple[str, int]] = set()
    for path, text in sources.items():
        try:
            tree = ast.parse(text)
        except SyntaxError:
            return {"ok": False, "reason": "python source could not be parsed"}
        for binding in collect_bindings(tree, source_name):
            if binding.kind in {"function", "class"}:
                continue
            if binding.kind == "import":
                return {
                    "ok": False,
                    "reason": "python local rename cannot prove import aliases",
                }
            scope_id = id(binding.enclosing) if binding.enclosing is not None else id(tree)
            scopes.add((path, scope_id))
            if chosen is None:
                chosen = binding
                chosen_path = path
    if chosen is None or chosen_path is None:
        return {"ok": False, "reason": "source identifier was not found"}
    if len(scopes) != 1:
        return {"ok": False, "reason": "source identifier is ambiguous"}
    enclosing = chosen.enclosing
    listed_set = set(sources)
    for path, text in sources.items():
        if path == chosen_path:
            continue
        if name_in_tokens(text, source_name):
            return {
                "ok": False,
                "reason": "rename graph includes files that were not listed",
            }
    if enclosing is not None:
        span = node_span(sources[chosen_path], enclosing)
        if span is None:
            return {"ok": False, "reason": "python local rename cannot prove this binding"}
        start, end = span
        rest = sources[chosen_path][:start] + sources[chosen_path][end:]
        if name_in_tokens(rest, source_name):
            return {"ok": False, "reason": "source identifier is ambiguous"}
    if unlisted_uses_name(root, list(listed_set), source_name):
        return {
            "ok": False,
            "reason": "rename graph includes files that were not listed",
        }
    try:
        next_text = scoped_rename(
            sources[chosen_path],
            chosen,
            source_name,
            target_name,
        )
    except ValueError as error:
        return {"ok": False, "reason": str(error)}
    rewritten = {}
    if next_text != sources[chosen_path]:
        rewritten[relative_to(root, chosen_path)] = next_text
    if not rewritten:
        return {"ok": False, "reason": "source identifier was not found"}
    return {"ok": True, "files": rewritten}


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

    if declarations > 1:
        return {"ok": False, "reason": "source identifier is ambiguous"}
    if declarations == 0:
        return plan_local_rename(root, sources, source_name, target_name)

    if unlisted_uses_name(root, listed, source_name):
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
    exports = index_python_exports(root)
    rewritten: dict[str, str] = {}
    for path in listed:
        try:
            with open(path, encoding="utf-8") as handle:
                text = handle.read()
        except OSError:
            return {"ok": False, "reason": f"missing file: {relative_to(root, path)}"}
        try:
            next_text = rewrite_unused_imports(text)
            next_text = add_unique_missing_imports(root, path, next_text, exports)
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


def plan_assert_format(root: str, payload: dict[str, Any]) -> dict[str, Any]:
    proposed = payload.get("proposed") or {}
    if not isinstance(proposed, dict) or not proposed:
        return {"ok": False, "reason": "format-only requires files"}
    rewritten: dict[str, str] = {}
    for relative_path, next_text in proposed.items():
        if not isinstance(next_text, str):
            return {"ok": False, "reason": "python format rewrite was not proven"}
        path = os.path.realpath(os.path.join(root, relative_path))
        try:
            with open(path, encoding="utf-8") as handle:
                original = handle.read()
        except OSError:
            return {"ok": False, "reason": f"missing file: {relative_path}"}
        try:
            if python_shape(original) != python_shape(next_text):
                return {
                    "ok": False,
                    "reason": "format rewrite would change non-whitespace structure",
                }
            if significant_tokens(original) != significant_tokens(next_text):
                return {
                    "ok": False,
                    "reason": "format rewrite would change non-whitespace structure",
                }
        except (ValueError, SyntaxError, tokenize.TokenError):
            return {"ok": False, "reason": "python format rewrite was not proven"}
        if next_text != original:
            rewritten[relative_path] = next_text
    return {"ok": True, "files": rewritten}


def plan(root: str, payload: dict[str, Any]) -> dict[str, Any]:
    operation = payload.get("operation") or "rename"
    if operation == "rename":
        return plan_rename(root, payload)
    if operation == "import-only":
        return plan_import_only(root, payload)
    if operation == "format-only":
        return plan_format_only(root, payload)
    if operation == "assert-format":
        return plan_assert_format(root, payload)
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
