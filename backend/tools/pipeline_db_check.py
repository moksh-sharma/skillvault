import asyncio

from sqlalchemy import text

from src.config.database import engine


async def main() -> None:
    async with engine.begin() as conn:
        r = await conn.execute(text("SELECT 1"))
        print("db_select_1:", r.scalar())

        tables = [
            "users",
            "resumes",
            "job_openings",
            "job_applications",
            "token_blacklist",
            "jd_analysis",
            "match_results",
        ]
        for t in tables:
            try:
                await conn.execute(text(f"SELECT 1 FROM {t} LIMIT 1"))
                print("table_ok:", t)
            except Exception as e:  # noqa: BLE001
                print("table_problem:", t, type(e).__name__, str(e)[:200])


if __name__ == "__main__":
    asyncio.run(main())

