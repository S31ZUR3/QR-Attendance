from db_utils import init_db, mark_attendance_data, check_attendance_data


def main():
    init_db()
    sample = {
        'regno': 'REG123',
        'name': 'Alice Example',
        'designation': 'Member',
        'department': 'CSE',
        'year': '3'
    }
    res = mark_attendance_data(sample)
    print('mark result:', res)

    res2 = mark_attendance_data(sample)
    print('mark again result (should indicate already marked):', res2)

    print('Attendance DB snapshot:')
    print(check_attendance_data())


if __name__ == '__main__':
    main()
