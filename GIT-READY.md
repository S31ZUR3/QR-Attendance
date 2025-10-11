Git push checklist

1. Confirm .gitignore is present and excludes local envs and build artifacts.
2. Make sure you do not commit large files like `attendance.db` unless you want it in git history.
3. If you have sensitive keys, remove them before pushing (e.g., GOOGLE_API_KEY in env files).

Commands (PowerShell):

```powershell
# initialize and push
git init
git add .
git commit -m "Initial commit"
# add remote and push
git remote add origin <remote-url>
git branch -M main
git push -u origin main
```

If using HTTPS and a Personal Access Token (PAT) instead of password, paste the PAT when prompted for password.
