import argparse
import os
from openai import OpenAI
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def read_file(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()

def main():
    # Parse company name from CLI
    parser = argparse.ArgumentParser(description="Run RRSRCH company report")
    parser.add_argument("--company", required=True, help="Company name (e.g., varda)")
    args = parser.parse_args()

    company = args.company.lower()
    data_path = f"data/{company}.txt"
    prompt_path = "agents/company_report.md"

    # Validate files
    if not os.path.exists(data_path):
        print(f"❌ File not found: {data_path}")
        return
    if not os.path.exists(prompt_path):
        print(f"❌ Prompt file missing: {prompt_path}")
        return

    # Read content
    prompt = read_file(prompt_path)
    source = read_file(data_path)

    full_prompt = f"""{prompt}

---

### SOURCE MATERIAL:
{source}
"""

    print(f"\n📡 Running GPT-4 on: {company}")

    try:
        response = client.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You are a frontier tech research analyst at RRSRCH."},
                {"role": "user", "content": full_prompt}
            ],
            temperature=0.5,
            max_tokens=3000
        )

        output = response.choices[0].message.content

        # Save output
        os.makedirs("reports", exist_ok=True)
        output_path = f"reports/{company}_report.md"
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(output)

        print(f"\n✅ Report saved to: {output_path}")

    except Exception as e:
        print("\n❌ ERROR:")
        print(e)

if __name__ == "__main__":
    main()
