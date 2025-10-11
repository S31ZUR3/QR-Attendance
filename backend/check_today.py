import sqlite3
from datetime import date

def main():
    d = str(date.today())
    conn = sqlite3.connect('attendance.db')
    cur = conn.cursor()
    cur.execute("SELECT members.name,members.regno,attendance.date FROM attendance JOIN members ON attendance.regno=members.regno WHERE attendance.date=? ORDER BY attendance.date DESC", (d,))
    rows = cur.fetchall()
    print(rows)
    conn.close()

if __name__ == '__main__':
    main()
