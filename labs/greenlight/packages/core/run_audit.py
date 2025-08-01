# packages/core/run_audit.py
print("👋 CLI started")

import os

def run_audit(path: str):
    print(f"🔍 Scanning: {os.path.abspath(path)}")
    
    if not os.path.exists(path):
        print("❌ Path does not exist.")
        return
    
    files = []
    for root, _, filenames in os.walk(path):
        for f in filenames:
            files.append(os.path.relpath(os.path.join(root, f), path))

    print(f"📦 Found {len(files)} files.")
    for f in files[:10]:
        print(f"  - {f}")
    
    print("✅ Audit complete (stub).")


