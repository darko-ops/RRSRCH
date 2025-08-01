# 🧠 Bouncr

**AI-Powered Access Review Engine**  

---

## 📌 Overview

**Bouncr** is a lightweight, auditable, and automatable tool for managing access reviews across your organization. It connects directly to identity providers like **Okta**, evaluates access risk, and produces audit-grade outputs — no spreadsheets required.

Whether you're preparing for SOC 2, ISO 27001, or just need a clean view of your permissions, Bouncr makes it fast, transparent, and scalable.

---

## ✨ Features

- 🔍 **Access Scanning**: Fetch live user and group assignments from Okta
- ⚖️ **Rules-Based Evaluations**: Identify stale accounts, privilege drift, or orphaned users
- ✅ **Audit-Grade Output**: Export reviewer decisions and logs in CSV, JSON, or PDF
- 📆 **Scheduled Reviews**: Automate weekly/monthly audits with CLI or cron
- 🛠️ **Configurable Thresholds**: Tune review logic via `config.yaml`
- 📚 **Immutable Logging**: Maintain a clean, timestamped history for each audit
- 📤 **Reviewer Queue Delivery** (WIP): Notify reviewers with custom assignments

---

## ⚙️ Usage

### 1. Setup
Clone the repo and install dependencies:

```bash
git clone https://github.com/rrsrch/bouncr.git
cd bouncr
pip install -r requirements.txt
