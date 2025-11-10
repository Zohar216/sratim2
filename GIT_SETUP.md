# Git Setup Instructions

## Step 1: Install Git (if not already installed)
Download and install Git from: https://git-scm.com/download/win

## Step 2: Initialize Git Repository
```bash
git init
```

## Step 3: Add All Files
```bash
git add .
```

## Step 4: Create Initial Commit
```bash
git commit -m "Initial commit: Movie collection website"
```

## Step 5: Create Repository on GitHub
1. Go to https://github.com/new
2. Create a new repository (don't initialize with README)
3. Copy the repository URL

## Step 6: Connect to Remote Repository
```bash
git remote add origin YOUR_REPOSITORY_URL
```

## Step 7: Push to GitHub
```bash
git branch -M main
git push -u origin main
```

## Alternative: Using GitHub Desktop
If you prefer a GUI, you can use GitHub Desktop:
1. Download from: https://desktop.github.com/
2. Sign in with your GitHub account
3. Click "File" > "Add Local Repository"
4. Select this folder
5. Click "Publish repository"

