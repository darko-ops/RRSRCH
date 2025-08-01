# apps/cli/main.py
print("🧠 main.py is executing")
import typer
import sys
import os

# Ensure we can import from packages/
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..', 'packages')))

from core.run_audit import run_audit

app = typer.Typer()

@app.command()
def audit(path: str = "."):
    print("🚀 Launching audit...")
    run_audit(path)

if __name__ == "__main__":
    app()
