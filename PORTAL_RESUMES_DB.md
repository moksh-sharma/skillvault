# Portal Resumes - Database IDs and Dashboard Count

## Which database and table?

- **Table:** `resumes`
- **Primary key:** `id` (auto-increment integer)
- **Dashboard total count** = `SELECT COUNT(id) FROM resumes` (all rows, no filter)

## How portal uploads are stored

| Portal            | `source_type`      | `source_id`                    |
|-------------------|--------------------|---------------------------------|
| Guest / Candidate | `guest`            | `NULL`                          |
| Freelancer        | `freelancer`       | `NULL`                          |
| Company Employee  | `company_employee` | Employee ID from verification   |

- **Endpoint:** `POST /api/resumes/upload/user-profile` (same for all three portals)
- **Backend file:** `backend/src/routes/resumes/user_profile.py`
- **User type in payload:** `userType` = "Guest User", "Freelancer", or "Company Employee"
- **Backend mapping:** `user_type` → `source_type` via `get_source_type_from_user_type()` in `backend/src/utils/user_type_mapper.py`

So every portal submission creates a new row in `resumes` with the right `source_type` (and `source_id` for Company Employee). The dashboard count is the total number of rows in `resumes`.

## Why the dashboard might still show 53

1. **Upload failed**  
   - In the browser: DevTools → Network → find the `user-profile` request.  
   - If status is not 200 or you see a 4xx/5xx, the resume was not saved.  
   - If it’s 200, check the response body for `resume_id`; if present, the row was created.

2. **Dashboard not refreshed**  
   - Do a hard refresh (e.g. Ctrl+F5) or open the Dashboard again so it refetches `/api/admin/stats`.

3. **Different backend or DB**  
   - Portals (3005/3006/3007) must call the same backend (e.g. port 8000) and the same DB.  
   - Check `backend/.env` (and frontend `VITE_API_URL` if used) so all apps point to the same API and DB.

## How to verify in the database

Run against your PostgreSQL DB (replace with your DB name/user):

```sql
-- Total count (should match dashboard)
SELECT COUNT(*) FROM resumes;

-- Count by source (portal vs rest)
SELECT source_type, COUNT(*) FROM resumes GROUP BY source_type ORDER BY source_type;

-- Last 10 resumes (see if your two new ones are there)
SELECT id, source_type, source_id, filename, uploaded_at
FROM resumes
ORDER BY uploaded_at DESC
LIMIT 10;
```

If the two new portal uploads are in `resumes`, the total count will be 55 and they will appear in the last-10 query. If the count is still 53, those two rows were never inserted (upload failed or wrong backend/DB).

## Where LinkedIn and Portfolio are stored

LinkedIn and Portfolio are **not** in separate columns. They are inside the **JSONB** column `source_metadata`:

- **Column:** `resumes.source_metadata`
- **Path in JSON:** `source_metadata -> 'form_data' -> 'linkedIn'` and `'portfolio'`

So you will not see columns named `linkedin` or `portfolio` in the table. You have to look inside the JSON.

### SQL to check LinkedIn and Portfolio in the database

```sql
-- Show id, LinkedIn URL, and Portfolio URL for all resumes
SELECT
  id,
  source_metadata->'form_data'->>'linkedIn' AS linkedin,
  source_metadata->'form_data'->>'portfolio' AS portfolio,
  uploaded_at
FROM resumes
ORDER BY uploaded_at DESC
LIMIT 20;
```

- If `linkedin` or `portfolio` are **null**, either the resume was uploaded before this feature was added, or the form did not send those fields (e.g. user left them blank, or the wrong upload endpoint was used).
- New submissions from the portal application form (with Links section filled) should show values here after you **restart the backend** and submit again.

## Admin Records tab

The admin **Records** tab uses the same `resumes` table and lists all resumes (with optional filters). If your two new resumes appear there, they are in the DB and the dashboard count should include them after a refresh.
