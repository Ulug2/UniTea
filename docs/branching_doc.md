Here's how to work with branches in Git:

## Creating and Working with a Branch

**1. Create a new branch and switch to it:**
```bash
git checkout -b feature/my-new-feature
```
Or using the newer syntax:
```bash
git switch -c feature/my-new-feature
```

**2. Make your changes, then stage and commit them:**
```bash
git add .
git commit -m "Your commit message"
```

**3. Push the branch to remote (GitHub):**
```bash
git push -u origin feature/my-new-feature
```

---

## Merging into Main

Once you're happy with the changes, you have two options:

**Option A: Merge via Pull Request (recommended)**
- Go to GitHub, open a Pull Request from your branch into `main`
- Review the changes, then merge

**Option B: Merge locally**
```bash
git checkout main          # switch to main
git pull origin main       # make sure main is up to date
git merge feature/my-new-feature   # merge your branch in
git push origin main       # push to remote
```

---

## Useful Commands

| Command | Description |
|---|---|
| `git branch` | List all local branches |
| `git branch -a` | List all branches (including remote) |
| `git checkout main` | Switch back to main |
| `git branch -d feature/my-new-feature` | Delete branch after merging |

---

## Typical Workflow

```
main ──────────────────────────────► (stable)
         \                      /
          feature/my-feature ──►  (your work)
```

The Pull Request approach is generally preferred because it gives you a chance to review the diff before merging into `main`.