"""Dump the database this shell's env points at into ~/projects/survivor/backups.

Weekly ritual after scoring (docs/operations.md). Staging by default; prod with
``uv run --env-file .env.prod python scripts/backup_db.py prod``. Runs pg_dump via the
Supabase CLI (Docker) against the session-mode pooler, since the transaction
pooler on 6543 can't serve pg_dump. Writes schema.sql (public) and data.sql
(public + auth, minus session churn) so a restore needs nothing else.
"""

import datetime as dt
import os
import subprocess
import sys
from pathlib import Path
from urllib.parse import quote

from dotenv import load_dotenv

# .env is staging; ``uv run --env-file .env.prod`` wins because load_dotenv
# never overrides variables already set.
load_dotenv()

BACKUP_ROOT = Path.home() / "projects" / "survivor" / "backups"
# ponytail: everything in auth except these is needed to restore logins
# (users, identities). These are churn that pg_dump would bloat the file with.
AUTH_CHURN = ",".join(
    f"auth.{t}"
    for t in (
        "sessions",
        "refresh_tokens",
        "audit_log_entries",
        "flow_state",
        "one_time_tokens",
        "mfa_amr_claims",
    )
)


def main() -> None:
    host = os.environ["DB_HOST"]
    user = os.environ.get("DB_USER", "postgres")
    password = quote(os.environ["DB_PASSWORD"], safe="")
    dbname = os.environ.get("DB_NAME", "postgres")
    url = f"postgresql://{user}:{password}@{host}:5432/{dbname}"

    # The env file picks the database; the label only names the folder.
    label = sys.argv[1] if len(sys.argv) > 1 else "staging"
    out = BACKUP_ROOT / f"{label}-{dt.date.today():%Y-%m-%d}"
    out.mkdir(parents=True, exist_ok=True)

    dump = ["supabase", "db", "dump", "--db-url", url]
    subprocess.run([*dump, "-s", "public", "-f", str(out / "schema.sql")], check=True)
    subprocess.run(
        [
            *dump,
            "--data-only",
            "--use-copy",
            "-s",
            "public,auth",
            "-x",
            AUTH_CHURN,
            "-f",
            str(out / "data.sql"),
        ],
        check=True,
    )
    for f in sorted(out.iterdir()):
        print(f"{f}  {f.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
