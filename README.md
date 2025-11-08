# QR-Attendance

An app that marks attendance by scanning QR codes. Made for the IEEE-CS club.

Overview
--------
- Backend: Flask app in `backend/` with endpoints:
  - POST `/mark_attendance` (accepts JSON)
  - POST `/scan` (accepts multipart form file `image`, decodes QR and marks attendance)
  - GET `/check_attendance` and `/export_csv`
- Mobile: Expo React Native app in `mobile/` with `App.js` implementing camera capture, upload, and CSV export.

Backend setup (Windows)
-----------------------
1. cd `backend`
2. python -m venv .venv
3. .\.venv\Scripts\activate
4. pip install -r requirements.txt
5. python app.py

The server binds to `0.0.0.0:5000` by default, so a phone on the same LAN can reach it at `http://<your-pc-ip>:5000`.

Quick DB test (no image libraries needed)
----------------------------------------
1. cd `backend`
2. .\.venv\Scripts\activate
3. .\.venv\Scripts\python test_mark.py

This will create `attendance.db`, insert a sample member, mark attendance, and print a DB snapshot.

Mobile (Expo)
-------------
1. cd `mobile`
2. npm install
3. To run in development: `npx expo start`

Standalone release APK (no Metro required)
----------------------------------------
To produce a release APK (includes bundled JS):

```powershell
# generate native project
npx expo prebuild --platform android
# build release
cd android
.\gradlew assembleRelease
```

APK path: `mobile/android/app/build/outputs/apk/release/app-release.apk`

Notes
-----
- On Android emulators use `http://10.0.2.2:5000` to reach the host machine. On a real device set the Server URL inside the app to `http://<your-pc-lan-ip>:5000`.
- Keep `attendance.db` out of git unless you want pre-seeded data (added `.gitignore` to exclude `*.db`).
- If you want local QR decoding, install Pillow and pyzbar and the zbar native library.


