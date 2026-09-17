"""Initialize only the labelled, disposable E2E container via its real TTY CLI.

This helper never resets a database or bypasses the production CLI's safeguards.
The CLI itself refuses bootstrap if a tenant already exists.
"""

import errno
import json
import os
import pty
import select
import subprocess
import sys
import termios
import time
from urllib.parse import urlparse


def bootstrap(config):
    base_url = urlparse(config["baseURL"])
    if (
        base_url.scheme != "http"
        or base_url.hostname not in ("127.0.0.1", "localhost")
        or not base_url.port
        or base_url.username
        or base_url.password
        or base_url.path not in ("", "/")
        or base_url.query
        or base_url.fragment
    ):
        raise RuntimeError("Refusing a non-loopback E2E URL")

    inspected = subprocess.run(
        ["docker", "inspect", "fider-e2e"],
        check=True,
        capture_output=True,
        text=True,
        timeout=10,
    )
    containers = json.loads(inspected.stdout)
    if len(containers) != 1:
        raise RuntimeError("Expected exactly one disposable E2E container")
    container = containers[0]
    environment = dict(item.split("=", 1) for item in container["Config"]["Env"] if "=" in item)
    database = urlparse(environment.get("DATABASE_URL", ""))
    if (
        container["Name"] != "/fider-e2e"
        or not container["State"]["Running"]
        or (container["Config"].get("Labels") or {}).get("jt.e2e.disposable") != "true"
        or environment.get("HOST_MODE") != "single"
        or environment.get("GO_ENV") != "development"
        or environment.get("BASE_URL", "").rstrip("/") != config["baseURL"]
        or database.scheme not in ("postgres", "postgresql")
        or database.path not in ("/fider_ci", "/fider_e2e")
        or database.username not in ("fider_ci", "fider_e2e")
        or database.hostname not in ("localhost", "127.0.0.1", "postgres", "fider-e2e-db")
    ):
        raise RuntimeError("Refusing to initialize a container without the disposable E2E configuration")

    application_port = environment.get("PORT", "3000")
    if container["HostConfig"]["NetworkMode"] == "host":
        port_matches = str(base_url.port) == application_port
    else:
        bindings = (container["NetworkSettings"].get("Ports") or {}).get(application_port + "/tcp") or []
        port_matches = any(
            binding.get("HostPort") == str(base_url.port)
            and binding.get("HostIp") in ("127.0.0.1", "0.0.0.0", "")
            for binding in bindings
        )
    if not port_matches:
        raise RuntimeError("E2E_BASE_URL does not point to the disposable container's published app port")

    admin = config["admin"]
    master, slave = pty.openpty()
    attrs = termios.tcgetattr(slave)
    attrs[3] &= ~termios.ECHO
    termios.tcsetattr(slave, termios.TCSANOW, attrs)
    process = None
    output = b""
    try:
        process = subprocess.Popen(
            ["docker", "exec", "-it", "fider-e2e", "/app/fider", "account", "bootstrap"],
            stdin=slave,
            stdout=slave,
            stderr=slave,
        )
        os.close(slave)
        slave = None
        deadline = time.monotonic() + 45

        def read_output():
            if time.monotonic() >= deadline:
                raise RuntimeError("Timed out waiting for the interactive account bootstrap")
            ready, _, _ = select.select([master], [], [], 0.2)
            if ready:
                try:
                    return os.read(master, 65536)
                except OSError as error:
                    if error.errno != errno.EIO:
                        raise
            return b""

        for prompt, value in (
            ("Site name: ", "E2E Idea Notes"),
            ("Administrator display name: ", admin["name"]),
            ("Administrator username: ", admin["username"]),
            ("Type YES to change this account: ", "YES"),
            ("Temporary password (hidden): ", admin["temporaryPassword"]),
            ("Confirm temporary password (hidden): ", admin["temporaryPassword"]),
        ):
            while prompt.encode() not in output:
                output += read_output()
                if process.poll() is not None:
                    raise RuntimeError("The account CLI exited before completing its interactive prompts")
            output = output.split(prompt.encode(), 1)[1]
            # Let term.ReadPassword finish changing terminal flags after emitting its prompt.
            time.sleep(0.05)
            os.write(master, (value + "\n").encode())

        while process.poll() is None:
            output += read_output()
        output += read_output()
        if process.returncode != 0 or b"Account update committed." not in output:
            raise RuntimeError("The disposable account bootstrap did not commit")
    finally:
        if process and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
        os.close(master)
        if slave is not None:
            os.close(slave)


if __name__ == "__main__":
    try:
        bootstrap(json.load(sys.stdin))
    except Exception:
        # Never include Docker inspection output, terminal output, or passwords in test logs.
        print("E2E bootstrap failed; check the disposable container configuration and CLI prerequisites.", file=sys.stderr)
        sys.exit(1)
    print("Disposable E2E administrator initialized.")
