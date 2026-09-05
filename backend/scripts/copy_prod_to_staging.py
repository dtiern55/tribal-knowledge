"""Refresh staging with a copy of prod's public data, so previews have real
castaways, teams and ballots to look at.

Every public table is truncated on staging and reloaded from prod with COPY,
in foreign-key order, inside one transaction. User ids are remapped by email
so an account that exists in both projects (yours, the producer) keeps its
staging login and lands on its prod profile. Prod auth users are not copied:
everyone else gets a placeholder auth user with no password, so they show up
in standings and on team pages but cannot sign in to staging.

Dry-runs by default (row counts and the id map); --apply writes.

Usage (from backend/):
    uv run python scripts/copy_prod_to_staging.py [--apply]
Reads .env (staging, the target) and .env.prod (prod, the source) directly.
"""

import argparse
import io
import sys

import psycopg2
from dotenv import dotenv_values


def connect(env: dict[str, str | None]):
    return psycopg2.connect(
        host=env["DB_HOST"],
        port=env.get("DB_PORT") or "5432",
        dbname=env.get("DB_NAME") or "postgres",
        user=env.get("DB_USER") or "postgres",
        password=env["DB_PASSWORD"],
    )


def fk_order(cur) -> list[str]:
    """Public base tables, parents before children (Kahn's algorithm)."""
    cur.execute(
        "select table_name from information_schema.tables"
        " where table_schema='public' and table_type='BASE TABLE'"
    )
    tables = sorted(r[0] for r in cur.fetchall())
    cur.execute("""select tc.table_name, ccu.table_name
           from information_schema.table_constraints tc
           join information_schema.constraint_column_usage ccu
             on tc.constraint_name = ccu.constraint_name
           where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
             and ccu.table_schema = 'public' and tc.table_name <> ccu.table_name""")
    parents: dict[str, set[str]] = {t: set() for t in tables}
    for child, parent in cur.fetchall():
        parents[child].add(parent)
    ordered: list[str] = []
    while parents:
        ready = sorted(t for t, ps in parents.items() if not ps)
        if not ready:
            sys.exit(f"FK cycle among {sorted(parents)}")
        ordered.extend(ready)
        for t in ready:
            del parents[t]
        for ps in parents.values():
            ps.difference_update(ready)
    return ordered


def columns(cur, table: str) -> list[str]:
    cur.execute(
        "select column_name from information_schema.columns"
        " where table_schema='public' and table_name=%s order by ordinal_position",
        (table,),
    )
    return [r[0] for r in cur.fetchall()]


def user_map(src, dst) -> dict[str, str]:
    """prod user id -> staging user id, for emails present in both."""
    src.execute("select id::text, lower(email) from auth.users where email is not null")
    prod = {email: uid for uid, email in src.fetchall()}
    dst.execute("select id::text, lower(email) from auth.users where email is not null")
    return {prod[email]: uid for uid, email in dst.fetchall() if email in prod}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write (default: dry run)")
    args = parser.parse_args()

    staging, prod = dotenv_values(".env"), dotenv_values(".env.prod")
    if staging["DB_HOST"] == prod["DB_HOST"]:
        sys.exit(".env and .env.prod point at the same database; refusing")
    print(
        f"source (prod):    {prod['DB_HOST']}\ntarget (staging): {staging['DB_HOST']}"
    )

    with connect(prod) as src_conn, connect(staging) as dst_conn:
        src, dst = src_conn.cursor(), dst_conn.cursor()
        src_conn.set_session(readonly=True)
        ids = user_map(src, dst)
        src.execute(
            "select id::text, email from auth.users where id::text = any(%s)",
            (list(ids),),
        )
        for uid, email in src.fetchall():
            print(f"  remap {email}: {uid[:8]} -> {ids[uid][:8]}")

        tables = fk_order(dst)
        cols = {
            t: [c for c in columns(dst, t) if c in set(columns(src, t))] for t in tables
        }
        src.execute(
            "select event_object_table from information_schema.triggers"
            " where trigger_schema='public' group by 1"
        )
        triggered = [r[0] for r in src.fetchall() if r[0] in tables]

        # profiles.id references auth.users. Players without a staging account
        # get a placeholder auth user with no password, so their teams show
        # but nobody can sign in as them.
        src.execute("select id::text from profiles")
        wanted = {ids.get(r[0], r[0]) for r in src.fetchall()}
        dst.execute("select id::text from auth.users")
        placeholders = sorted(wanted - {r[0] for r in dst.fetchall()})
        print(f"  {len(placeholders)} placeholder auth users (no password)")

        if not args.apply:
            for t in tables:
                src.execute(f"select count(*) from {t}")
                print(f"  {t:<32} {src.fetchone()[0]:>6} rows")
            print("\ndry run — re-run with --apply to load staging")
            return

        for uid in placeholders:
            dst.execute(
                """insert into auth.users (instance_id, id, aud, role, email,
                       email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                       created_at, updated_at)
                   values ('00000000-0000-0000-0000-000000000000', %s,
                       'authenticated', 'authenticated', %s, now(),
                       '{"provider": "email", "providers": ["email"]}', '{}',
                       now(), now())""",
                (uid, f"{uid[:8]}@staging.invalid"),
            )

        # Placement-sync triggers would rewrite scoring_events mid-load; the
        # rows they maintain are copied verbatim from prod anyway.
        for t in triggered:
            dst.execute(f"alter table {t} disable trigger user")
        dst.execute("truncate " + ", ".join(tables) + " cascade")
        for t in tables:
            col_list = ", ".join(cols[t])
            buf = io.StringIO()
            src.copy_expert(f"copy (select {col_list} from {t}) to stdout", buf)
            text = buf.getvalue()
            for old, new in ids.items():
                text = text.replace(old, new)
            dst.copy_expert(f"copy {t} ({col_list}) from stdin", io.StringIO(text))
            print(f"  {t:<32} {text.count(chr(10)):>6} rows")
        for t in triggered:
            dst.execute(f"alter table {t} enable trigger user")
        dst_conn.commit()
        print("done")


if __name__ == "__main__":
    main()
