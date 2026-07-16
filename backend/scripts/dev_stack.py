"""Bring the dev stacks up and down from any git worktree.

Both Compose projects are pinned by name in their compose file (``nanny-development`` and
``nanny-tests``), so a stack is the same containers, image, and volume wherever it is
launched from. Pinning is what makes that true, but it also means every worktree competes
for one set of containers and host ports. Resolving that competition is this script's job:
it hands the pinned stack over to the calling worktree and clears stale stacks left behind
by the older, directory-named projects.

No path through this script removes a volume, so the database always survives.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]

# Compose file per stack, relative to the repo root.
STACK_FILES = {
    "development": "docker-compose.yml",
    "tests": "docker-compose.tests.yml",
}

PROJECT_LABEL = "com.docker.compose.project"
WORKING_DIR_LABEL = "com.docker.compose.project.working_dir"


class StackError(RuntimeError):
    """A conflict the script must not resolve on its own."""


def _say(message: str) -> None:
    # Unbuffered: docker writes progress straight to the terminal, so buffered notes here
    # would surface out of order under tox, where stdout is a pipe.
    print(message, flush=True)


def _docker(*args: str, capture: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(["docker", *args], text=True, capture_output=capture, check=False)


def _compose(stack: str, *args: str, capture: bool = False) -> subprocess.CompletedProcess[str]:
    compose_file = REPO_ROOT / STACK_FILES[stack]
    return _docker("compose", "-f", str(compose_file), *args, capture=capture)


def _require_docker() -> None:
    if _docker("info").returncode != 0:
        raise StackError("Docker is not running. Start Docker (OrbStack) and try again.")


def _config(stack: str) -> dict[str, Any]:
    """The fully resolved compose file — the authority on project name and host ports."""
    proc = _compose(stack, "config", "--format", "json", capture=True)
    if proc.returncode != 0:
        raise StackError(f"Could not read {STACK_FILES[stack]}:\n{proc.stderr.strip()}")
    config: dict[str, Any] = json.loads(proc.stdout)
    return config


def _published_ports(config: dict[str, Any]) -> set[int]:
    ports: set[int] = set()
    for service in (config.get("services") or {}).values():
        for mapping in service.get("ports") or []:
            published = mapping.get("published")
            if published:
                ports.add(int(published))
    return ports


def _containers() -> list[dict[str, Any]]:
    ids = _docker("ps", "-aq").stdout.split()
    if not ids:
        return []
    containers: list[dict[str, Any]] = json.loads(_docker("inspect", *ids).stdout)
    return containers


def _label(container: dict[str, Any], key: str) -> str:
    labels = (container.get("Config") or {}).get("Labels") or {}
    return labels.get(key) or ""


def _host_ports(container: dict[str, Any]) -> set[int]:
    bindings = (container.get("HostConfig") or {}).get("PortBindings") or {}
    ports: set[int] = set()
    for binds in bindings.values():
        for bind in binds or []:
            host_port = bind.get("HostPort")
            if host_port:
                ports.add(int(host_port))
    return ports


def _worktree_paths() -> list[Path]:
    proc = subprocess.run(
        ["git", "worktree", "list", "--porcelain"],
        cwd=REPO_ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    paths = [
        Path(line.split(" ", 1)[1]).resolve()
        for line in proc.stdout.splitlines()
        if line.startswith("worktree ")
    ]
    return paths or [REPO_ROOT]


def _belongs_to_repo(container: dict[str, Any], worktrees: list[Path]) -> bool:
    """Whether a container came from this repo — including from a since-deleted worktree.

    Deleted worktrees no longer show up in `git worktree list`, but their containers still
    carry the directory they were created from, and that path sits under a live worktree
    root. This covers our own stacks too: their compose files live in a worktree.
    """
    working_dir = _label(container, WORKING_DIR_LABEL)
    if not working_dir:
        return False
    path = Path(working_dir)
    return any(path == root or path.is_relative_to(root) for root in worktrees)


def _preflight(stack: str, project: str, wanted_ports: set[int], pinned_names: set[str]) -> None:
    """Free the stack's host ports, or explain why we can't."""
    worktrees = _worktree_paths()
    for container in _containers():
        if not (container.get("State") or {}).get("Running"):
            continue  # A stopped container holds no port; compose reuses it by name.
        if _label(container, PROJECT_LABEL) == project:
            continue  # Ours already — compose recreates it in place if the config moved.
        clash = _host_ports(container) & wanted_ports
        if not clash:
            continue

        name = (container.get("Name") or "").lstrip("/")
        ports = ", ".join(str(port) for port in sorted(clash))
        # A container carrying one of our pinned names is ours by definition, even with no
        # compose labels to prove it — that is exactly what a leftover looks like.
        if not (name in pinned_names or _belongs_to_repo(container, worktrees)):
            raise StackError(
                f"Port {ports} is held by '{name}', which is not part of this repo.\n"
                f"Stop it yourself, or move this stack to a free port with the NANNY_*_PORT\n"
                f"variables in {STACK_FILES[stack]}."
            )
        _say(f"-> stopping stale container '{name}' (holds port {ports})")
        _docker("stop", name)


def _pinned_names(config: dict[str, Any]) -> set[str]:
    """The container_name each service pins in the compose file."""
    return {
        service["container_name"]
        for service in (config.get("services") or {}).values()
        if service.get("container_name")
    }


def up(stack: str, follow_logs: bool) -> None:
    _require_docker()
    config = _config(stack)
    project = config.get("name") or ""
    pinned_names = _pinned_names(config)
    _say(f"==> starting '{project}' stack from {REPO_ROOT}")

    _preflight(stack, project, _published_ports(config), pinned_names)

    if _compose(stack, "up", "-d", "--build", "--wait", "--remove-orphans").returncode != 0:
        # Compose reconciles containers it owns, and --remove-orphans above covers orphans.
        # What it can't do is take over a container holding a pinned name without being part
        # of the project — it fails hard instead. Clear those by name and retry once.
        _say("==> stack failed to start; clearing leftovers and retrying")
        if pinned_names:
            _docker("rm", "-f", *sorted(pinned_names))
        if _compose(stack, "up", "-d", "--build", "--wait", "--remove-orphans").returncode != 0:
            raise StackError(f"'{project}' still fails to start. See the compose output above.")

    _say(f"==> '{project}' is up")
    if follow_logs:
        _say("==> following logs (Ctrl-C detaches; the stack keeps running)")
        try:
            _compose(stack, "logs", "-f", "--tail", "20")
        except KeyboardInterrupt:
            pass


def down(stack: str) -> None:
    _require_docker()
    project = _config(stack).get("name") or ""
    # No -v: stopping the stack must never cost you the database.
    _compose(stack, "down", "--remove-orphans")
    _say(f"==> '{project}' is down (volume kept)")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["up", "down"])
    parser.add_argument("--stack", choices=sorted(STACK_FILES), default="development")
    parser.add_argument("--logs", action="store_true", help="follow logs after the stack is up")
    args = parser.parse_args()

    try:
        if args.action == "up":
            up(args.stack, args.logs)
        else:
            down(args.stack)
    except StackError as error:
        print(f"\nerror: {error}", file=sys.stderr, flush=True)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
