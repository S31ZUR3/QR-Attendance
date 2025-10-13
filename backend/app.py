from flask import Flask, request, jsonify
import os
import io
import json

from db_utils import init_db, mark_attendance_data, check_attendance_data

app = Flask(__name__)

DB_NAME = "attendance.db"

# ---------- DATABASE SETUP ----------
# ---------- API ROUTES ----------

@app.route('/mark_attendance', methods=['POST'])
def mark_attendance():
    try:
        data = request.json
        print("Received JSON:", data)
        # Delegate DB work to helper so it can be reused by tests without Flask
        result = mark_attendance_data(data)
        status_code = 200 if result.get('ok', True) else 400
        return jsonify(result), status_code

    except Exception as e:
        print("🔥 Error while marking attendance:", e)
        return jsonify({"message": "Server error occurred"}), 500


@app.route('/scan', methods=['POST'])
def scan_image_and_mark():
    """Accept an uploaded image (multipart/form-data with field 'image'), decode QR,
    parse register_no/regno data and mark attendance (reuses mark logic).

    QR content formats supported:
      - JSON string with keys regno/register_no, name, designation, department, year
      - CSV: regno,name,designation,department,year
    """
    try:
        if 'image' not in request.files:
            return jsonify({'message': 'No image uploaded'}), 400

        # Lazy imports so app can start even if Pillow/pyzbar aren't installed
        from PIL import Image
        import base64
        import requests
        import sqlite3
        from datetime import date

        try:
            from pyzbar.pyzbar import decode as zbar_decode
        except Exception:
            zbar_decode = None

        file = request.files['image']
        image = Image.open(file.stream).convert('RGB')

        qr_text = None

        # Try local decode with pyzbar if available
        if zbar_decode:
            decoded = zbar_decode(image)
            if decoded:
                qr_text = decoded[0].data.decode('utf-8')

        # Fallback to Google Vision API if no local decoder or no result
        if not qr_text:
            api_key = os.environ.get('GOOGLE_API_KEY')
            if api_key:
                buffered = io.BytesIO()
                image.save(buffered, format="JPEG")
                img_b64 = base64.b64encode(buffered.getvalue()).decode('utf-8')
                body = {
                    'requests': [
                        {
                            'image': {'content': img_b64},
                            'features': [{'type': 'BARCODE_DETECTION', 'maxResults': 5}]
                        }
                    ]
                }
                res = requests.post(f'https://vision.googleapis.com/v1/images:annotate?key={api_key}', json=body)
                resp = res.json()
                try:
                    annotations = resp['responses'][0].get('barcodeAnnotations') or resp['responses'][0].get('barcodeAnnotations', [])
                except Exception:
                    annotations = None
                if annotations:
                    qr_text = annotations[0].get('rawValue')

        if not qr_text:
            return jsonify({'message': 'No QR code detected'}), 400

        # Parse QR text: try JSON, then CSV
        parsed = {}
        try:
            parsed = json.loads(qr_text)
        except Exception:
            # assume CSV
            parts = [p.strip() for p in qr_text.split(',')]
            if len(parts) >= 5:
                parsed = {
                    'regno': parts[0],
                    'name': parts[1],
                    'designation': parts[2],
                    'department': parts[3],
                    'year': parts[4]
                }
            else:
                # try mapping with different key name
                if len(parts) == 1:
                    # single field - return raw
                    parsed = {'raw': qr_text}
                else:
                    parsed = {'raw_parts': parts}

        # Normalize keys
        regno = parsed.get('regno') or parsed.get('register_no') or parsed.get('registerNo') or parsed.get('register_no') or parsed.get('registerno')
        name = parsed.get('name')
        designation = parsed.get('designation')
        dept = parsed.get('department')
        year = parsed.get('year')

        if not regno or not name:
            # If only raw payload found, return it for debugging
            return jsonify({'message': 'QR decoded but missing required fields', 'decoded': parsed}), 400

        # Reuse db_utils to mark attendance
        result = mark_attendance_data({'regno': regno, 'name': name, 'designation': designation, 'department': dept, 'year': year})
        status_code = 200 if result.get('ok', True) else 400
        response = {'message': result.get('message'), 'decoded': parsed, 'attendance_id': result.get('attendance_id'), 'is_new': result.get('is_new'), 'time': result.get('time')}
        return jsonify(response), status_code

    except Exception as e:
        print('Error in /scan:', e)
        return jsonify({'message': 'Server error decoding QR'}), 500


@app.route('/db_dump', methods=['GET'])
def db_dump():
    """Return the members and attendance tables for inspection."""
    import sqlite3
    conn = sqlite3.connect(DB_NAME)
    cur = conn.cursor()
    cur.execute("SELECT regno,name,designation,department,year FROM members")
    members = cur.fetchall()
    cur.execute("SELECT id,regno,date,present FROM attendance ORDER BY date DESC")
    attendance = cur.fetchall()
    conn.close()
    return jsonify({'members': members, 'attendance': attendance})


@app.route('/export_csv', methods=['GET'])
def export_csv():
    """Return attendance for a date as CSV. Query param: date=YYYY-MM-DD (defaults to today)"""
    import sqlite3
    from datetime import date as _date
    import io
    import csv

    qdate = request.args.get('date') or str(_date.today())
    conn = sqlite3.connect(DB_NAME)
    cur = conn.cursor()
    cur.execute("""
        SELECT attendance.id, attendance.regno, members.name, members.designation, members.department, members.year, attendance.date, attendance.time
        FROM attendance
        JOIN members ON attendance.regno = members.regno
        WHERE attendance.date = ?
        ORDER BY attendance.id ASC
    """, (qdate,))
    rows = cur.fetchall()
    conn.close()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['id','regno','name','designation','department','year','date','time'])
    for r in rows:
        writer.writerow(r)

    csv_text = output.getvalue()
    return (csv_text, 200, {'Content-Type': 'text/csv', 'Content-Disposition': f'attachment; filename="attendance_{qdate}.csv"'})



@app.route('/check_attendance', methods=['GET'])
def check_attendance():
    """Return attendance grouped by date"""
    attendance_data = check_attendance_data()
    return jsonify(attendance_data)


if __name__ == '__main__':
    init_db()
    app.run(host='0.0.0.0', debug=True)
