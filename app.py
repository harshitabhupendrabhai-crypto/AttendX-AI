
"""
AttendX AI - Smart Attendance & Analytics Tracker
Author: Vaidehi Kayasth
Aligned with UN SDG Goal 4 (Quality Education) & SDG Goal 8 (Decent Work & Economic Growth)
"""

from flask import Flask, jsonify, request, render_template, Response
import sqlite3
import csv
import io
import random
import string
import time
import hashlib
from datetime import datetime, timedelta, date

app = Flask(__name__)

# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

DB_PATH = ":memory:"
_db_conn = None  # single in-memory connection kept alive for process lifetime


def get_db():
    global _db_conn
    if _db_conn is None:
        _db_conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        _db_conn.row_factory = sqlite3.Row
        _init_db(_db_conn)
    return _db_conn


def _init_db(conn):
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS members (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT    NOT NULL,
            roll_no     TEXT    NOT NULL UNIQUE,
            department  TEXT    NOT NULL,
            enrolled_on TEXT    NOT NULL
        );

        CREATE TABLE IF NOT EXISTS attendance (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            member_id   INTEGER NOT NULL,
            name        TEXT    NOT NULL,
            roll_no     TEXT    NOT NULL,
            date        TEXT    NOT NULL,
            timestamp   TEXT    NOT NULL,
            mode        TEXT    NOT NULL,   -- 'QR' | 'Face'
            status      TEXT    NOT NULL,   -- 'Present' | 'Late' | 'Excused'
            confidence  REAL    DEFAULT NULL,
            FOREIGN KEY (member_id) REFERENCES members(id)
        );

        CREATE TABLE IF NOT EXISTS qr_tokens (
            token       TEXT    PRIMARY KEY,
            created_at  REAL    NOT NULL,
            expires_at  REAL    NOT NULL
        );
    """)
    conn.commit()
    _seed_data(conn)


def _seed_data(conn):
    """Seed realistic student/employee data and historical attendance."""
    members = [
        ("Aarav Mehta",      "CS-2021-01", "Computer Science"),
        ("Priya Sharma",     "CS-2021-02", "Computer Science"),
        ("Rohan Desai",      "ME-2021-03", "Mechanical Eng."),
        ("Sneha Patil",      "ME-2021-04", "Mechanical Eng."),
        ("Karan Joshi",      "EC-2021-05", "Electronics"),
        ("Ananya Iyer",      "EC-2021-06", "Electronics"),
        ("Vikram Rao",       "CS-2021-07", "Computer Science"),
        ("Divya Nair",       "ME-2021-08", "Mechanical Eng."),
        ("Arjun Singh",      "EC-2021-09", "Electronics"),
        ("Neha Gupta",       "CS-2021-10", "Computer Science"),
        ("Siddharth Verma",  "CS-2021-11", "Computer Science"),
        ("Meera Pillai",     "EC-2021-12", "Electronics"),
        ("Rahul Kaur",       "ME-2021-13", "Mechanical Eng."),
        ("Tanvi Reddy",      "CS-2021-14", "Computer Science"),
        ("Amit Bhatt",       "EC-2021-15", "Electronics"),
    ]
    enrolled_on = (date.today() - timedelta(days=180)).isoformat()
    for name, roll, dept in members:
        conn.execute(
            "INSERT OR IGNORE INTO members (name, roll_no, department, enrolled_on) VALUES (?,?,?,?)",
            (name, roll, dept, enrolled_on)
        )
    conn.commit()

    # Generate 30 days of historical attendance (some absences to make analytics interesting)
    today = date.today()
    rows = conn.execute("SELECT id, name, roll_no FROM members").fetchall()
    absent_bias = {1: 0.3, 3: 0.4, 7: 0.35, 11: 0.45}  # members prone to absence

    for day_offset in range(30, 0, -1):
        day = today - timedelta(days=day_offset)
        if day.weekday() >= 5:  # skip weekends
            continue
        day_str = day.isoformat()
        for row in rows:
            bias = absent_bias.get(row["id"], 0.08)
            if random.random() < bias:
                continue  # absent
            hour = random.randint(8, 10)
            minute = random.randint(0, 59)
            ts = datetime.combine(day, datetime.min.time().replace(
                hour=hour, minute=minute)).isoformat(sep=" ", timespec="seconds")
            status = "Late" if hour >= 9 else "Present"
            mode = random.choice(["QR", "Face"])
            confidence = round(random.uniform(91, 99), 2) if mode == "Face" else None
            conn.execute(
                """INSERT OR IGNORE INTO attendance
                   (member_id, name, roll_no, date, timestamp, mode, status, confidence)
                   VALUES (?,?,?,?,?,?,?,?)""",
                (row["id"], row["name"], row["roll_no"], day_str, ts, mode, status, confidence)
            )
    conn.commit()


# ---------------------------------------------------------------------------
# QR token helpers
# ---------------------------------------------------------------------------

QR_TTL = 15  # seconds


def _current_qr_token():
    """Return the active QR token, generating a new one if expired."""
    db = get_db()
    now = time.time()
    row = db.execute(
        "SELECT token FROM qr_tokens WHERE expires_at > ? ORDER BY expires_at DESC LIMIT 1",
        (now,)
    ).fetchone()
    if row:
        return row["token"]
    # Generate new rolling token
    raw = "".join(random.choices(string.ascii_uppercase + string.digits, k=12))
    token = hashlib.sha256((raw + str(int(now))).encode()).hexdigest()[:20].upper()
    db.execute(
        "INSERT INTO qr_tokens (token, created_at, expires_at) VALUES (?,?,?)",
        (token, now, now + QR_TTL)
    )
    db.commit()
    return token


def _qr_expires_in():
    db = get_db()
    now = time.time()
    row = db.execute(
        "SELECT expires_at FROM qr_tokens WHERE expires_at > ? ORDER BY expires_at DESC LIMIT 1",
        (now,)
    ).fetchone()
    if row:
        return max(0, int(row["expires_at"] - now))
    return 0


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    db = get_db()
    members = db.execute("SELECT * FROM members ORDER BY name").fetchall()
    departments = sorted(set(m["department"] for m in members))
    return render_template(
        "index.html",
        members=[dict(m) for m in members],
        departments=departments,
        author="Vaidehi Kayasth"
    )


@app.route("/api/metrics")
def api_metrics():
    db = get_db()
    today_str = date.today().isoformat()

    total_members = db.execute("SELECT COUNT(*) FROM members").fetchone()[0]
    today_records = db.execute(
        "SELECT status FROM attendance WHERE date = ?", (today_str,)
    ).fetchall()

    present_today = len(today_records)
    late_today = sum(1 for r in today_records if r["status"] == "Late")
    punctual_today = sum(1 for r in today_records if r["status"] == "Present")
    attendance_rate = round((present_today / total_members * 100), 1) if total_members else 0

    # Absenteeism risk: members with <75% attendance over last 30 calendar days
    risk_threshold = 0.75
    risk_members = []
    all_members = db.execute("SELECT id, name, roll_no FROM members").fetchall()
    # count working days (Mon-Fri) in last 30 days
    today = date.today()
    working_days = sum(
        1 for d in (today - timedelta(days=i) for i in range(1, 31))
        if d.weekday() < 5
    )
    for m in all_members:
        attended = db.execute(
            "SELECT COUNT(*) FROM attendance WHERE member_id = ? AND date >= ?",
            (m["id"], (today - timedelta(days=30)).isoformat())
        ).fetchone()[0]
        rate = attended / working_days if working_days else 1
        if rate < risk_threshold:
            risk_members.append({
                "name": m["name"],
                "roll_no": m["roll_no"],
                "rate": round(rate * 100, 1)
            })

    # Weekly trend (last 7 working days)
    trend = []
    for i in range(6, -1, -1):
        day = today - timedelta(days=i)
        if day.weekday() >= 5:
            continue
        count = db.execute(
            "SELECT COUNT(*) FROM attendance WHERE date = ?", (day.isoformat(),)
        ).fetchone()[0]
        trend.append({"date": day.strftime("%a %d"), "count": count, "total": total_members})

    return jsonify({
        "total_members": total_members,
        "present_today": present_today,
        "punctual_today": punctual_today,
        "late_today": late_today,
        "attendance_rate": attendance_rate,
        "at_risk_count": len(risk_members),
        "at_risk_members": risk_members,
        "weekly_trend": trend,
        "qr_token": _current_qr_token(),
        "qr_expires_in": _qr_expires_in()
    })


@app.route("/api/records")
def api_records():
    db = get_db()
    limit = int(request.args.get("limit", 50))
    date_filter = request.args.get("date", "")
    query = "SELECT * FROM attendance"
    params = []
    if date_filter:
        query += " WHERE date = ?"
        params.append(date_filter)
    query += " ORDER BY timestamp DESC LIMIT ?"
    params.append(limit)
    rows = db.execute(query, params).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route("/api/mark-attendance", methods=["POST"])
def api_mark_attendance():
    data = request.get_json(force=True)
    roll_no = data.get("roll_no", "").strip()
    mode = data.get("mode", "QR")  # 'QR' | 'Face'
    qr_token = data.get("qr_token", "")

    db = get_db()

    # Validate QR token if mode is QR
    if mode == "QR":
        now = time.time()
        valid = db.execute(
            "SELECT 1 FROM qr_tokens WHERE token = ? AND expires_at > ?",
            (qr_token, now)
        ).fetchone()
        if not valid:
            return jsonify({"success": False, "error": "QR token expired or invalid. Please scan the latest code."}), 400

    # Simulate face recognition confidence
    confidence = None
    if mode == "Face":
        confidence = round(random.uniform(85, 99), 2)
        if confidence < 90:
            return jsonify({
                "success": False,
                "error": f"Face recognition confidence too low ({confidence}%). Please retry."
            }), 400

    member = db.execute("SELECT * FROM members WHERE roll_no = ?", (roll_no,)).fetchone()
    if not member:
        return jsonify({"success": False, "error": "Member not found in database."}), 404

    today_str = date.today().isoformat()
    existing = db.execute(
        "SELECT id FROM attendance WHERE member_id = ? AND date = ?",
        (member["id"], today_str)
    ).fetchone()
    if existing:
        return jsonify({"success": False, "error": "Attendance already marked for today."}), 409

    now_dt = datetime.now()
    ts = now_dt.isoformat(sep=" ", timespec="seconds")
    status = "Late" if now_dt.hour >= 9 else "Present"

    db.execute(
        """INSERT INTO attendance (member_id, name, roll_no, date, timestamp, mode, status, confidence)
           VALUES (?,?,?,?,?,?,?,?)""",
        (member["id"], member["name"], roll_no, today_str, ts, mode, status, confidence)
    )
    db.commit()

    return jsonify({
        "success": True,
        "name": member["name"],
        "roll_no": roll_no,
        "status": status,
        "mode": mode,
        "confidence": confidence,
        "timestamp": ts
    })


@app.route("/api/qr-token")
def api_qr_token():
    return jsonify({
        "token": _current_qr_token(),
        "expires_in": _qr_expires_in()
    })


@app.route("/api/absenteeism-risk")
def api_absenteeism_risk():
    db = get_db()
    today = date.today()
    working_days = sum(
        1 for d in (today - timedelta(days=i) for i in range(1, 31))
        if d.weekday() < 5
    )
    members = db.execute("SELECT id, name, roll_no, department FROM members").fetchall()
    risk_data = []
    for m in members:
        attended = db.execute(
            "SELECT COUNT(*) FROM attendance WHERE member_id = ? AND date >= ?",
            (m["id"], (today - timedelta(days=30)).isoformat())
        ).fetchone()[0]
        rate = round((attended / working_days * 100), 1) if working_days else 100
        last_seen_row = db.execute(
            "SELECT date FROM attendance WHERE member_id = ? ORDER BY date DESC LIMIT 1",
            (m["id"],)
        ).fetchone()
        last_seen = last_seen_row["date"] if last_seen_row else "Never"
        consecutive_absent = 0
        for i in range(1, 8):
            d = (today - timedelta(days=i))
            if d.weekday() >= 5:
                continue
            row = db.execute(
                "SELECT 1 FROM attendance WHERE member_id = ? AND date = ?",
                (m["id"], d.isoformat())
            ).fetchone()
            if not row:
                consecutive_absent += 1
            else:
                break
        risk_data.append({
            "id": m["id"],
            "name": m["name"],
            "roll_no": m["roll_no"],
            "department": m["department"],
            "attendance_rate": rate,
            "at_risk": rate < 75,
            "consecutive_absent_days": consecutive_absent,
            "last_seen": last_seen
        })
    risk_data.sort(key=lambda x: x["attendance_rate"])
    return jsonify(risk_data)


@app.route("/api/export-report")
def api_export_report():
    db = get_db()
    today = date.today()
    rows = db.execute(
        "SELECT * FROM attendance ORDER BY date DESC, timestamp DESC"
    ).fetchall()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Record ID", "Member ID", "Name", "Roll No / ID",
        "Date", "Timestamp", "Mode", "Status", "Confidence Score"
    ])
    for r in rows:
        writer.writerow([
            r["id"], r["member_id"], r["name"], r["roll_no"],
            r["date"], r["timestamp"], r["mode"], r["status"],
            r["confidence"] if r["confidence"] else "N/A"
        ])

    output.seek(0)
    filename = f"AttendX_Report_{today.isoformat()}.csv"
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    get_db()  # warm up DB + seed
    print("\n  AttendX AI  |  Author: Vaidehi Kayasth")
    print("  SDG Goal 4 (Quality Education) | SDG Goal 8 (Decent Work & Economic Growth)")
    print("  Running at  http://127.0.0.1:5000\n")
    app.run(debug=True, port=5000)
