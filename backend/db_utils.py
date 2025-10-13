import sqlite3
from datetime import date
from datetime import datetime

DB_NAME = 'attendance.db'


def init_db():
    conn = sqlite3.connect(DB_NAME)
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS members (
            regno TEXT PRIMARY KEY,
            name TEXT,
            designation TEXT,
            department TEXT,
            year TEXT
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            regno TEXT,
            date TEXT,
            time TEXT,
            present INTEGER DEFAULT 1,
            FOREIGN KEY(regno) REFERENCES members(regno)
        )
    """)
    # Ensure older databases get the 'time' column
    cur.execute("PRAGMA table_info(attendance)")
    cols = [r[1] for r in cur.fetchall()]
    if 'time' not in cols:
        try:
            cur.execute("ALTER TABLE attendance ADD COLUMN time TEXT")
        except Exception:
            pass
    conn.commit()
    conn.close()


def mark_attendance_data(data: dict):
    """Given a dict with keys regno (or register_no), name, designation, department, year,
    insert member if needed and mark attendance for today. Returns a result dict.
    """
    regno = data.get('regno') or data.get('register_no')
    name = data.get('name')
    designation = data.get('designation')
    department = data.get('department')
    year = data.get('year')

    if not regno or not name:
        return {'ok': False, 'message': 'Invalid data: regno and name required', 'data': data}

    conn = sqlite3.connect(DB_NAME)
    cur = conn.cursor()

    cur.execute("""
        INSERT OR IGNORE INTO members (regno, name, designation, department, year)
        VALUES (?, ?, ?, ?, ?)
    """, (regno, name, designation, department, year))

    today = str(date.today())
    # Store/display time in 12-hour format with AM/PM, e.g. '3:45:12 PM'
    now_time = datetime.now().strftime('%I:%M:%S %p').lstrip('0')
    cur.execute("SELECT * FROM attendance WHERE regno = ? AND date = ?", (regno, today))
    already = cur.fetchone()

    if already:
        attendance_id = already[0]
        is_new = False
        msg = f"{name} has already marked attendance for {today}!"
    else:
        cur.execute("INSERT INTO attendance (regno, date, time, present) VALUES (?, ?, ?, 1)", (regno, today, now_time))
        attendance_id = cur.lastrowid
        is_new = True
        msg = f"Attendance marked for {name} on {today} at {now_time}."

    conn.commit()
    conn.close()
    return {'ok': True, 'message': msg, 'regno': regno, 'name': name, 'attendance_id': attendance_id, 'is_new': is_new, 'time': now_time}


def check_attendance_data():
    conn = sqlite3.connect(DB_NAME)
    cur = conn.cursor()
    cur.execute("""
        SELECT members.name, members.regno, attendance.date, attendance.time
        FROM attendance
        JOIN members ON attendance.regno = members.regno
        ORDER BY attendance.date DESC
    """)
    rows = cur.fetchall()
    conn.close()

    attendance_data = {}
    for name, regno, day, atime in rows:
        if day not in attendance_data:
            attendance_data[day] = []
        attendance_data[day].append({'name': name, 'regno': regno, 'time': atime})

    return attendance_data
