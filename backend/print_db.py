import sqlite3

def main():
    conn = sqlite3.connect('attendance.db')
    cur = conn.cursor()

    cur.execute('SELECT regno, name, designation, department, year FROM members')
    members = cur.fetchall()
    print('Members:')
    for m in members:
        print('  ', m)

    cur.execute('SELECT id, regno, date, present FROM attendance ORDER BY date DESC, id DESC')
    attendance = cur.fetchall()
    print('\nAttendance:')
    for a in attendance:
        print('  ', a)

    conn.close()

if __name__ == '__main__':
    main()
