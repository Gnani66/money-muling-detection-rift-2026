RIFT 2026 – Money Muling Detection Challenge

🔗 Live Demo:
https://money-muling-detection-techtitans.netlify.app/

🧠 Overview
A web-based financial forensics engine that detects money muling networks using graph theory.

The system analyzes transaction CSV data and detects:
🔁 Circular fund routing (3–5 node cycles)
🔄 Smurfing (fan-in / fan-out within 72 hours)
🕸 Layered shell account chains (3+ hops)

All suspicious accounts and fraud rings are highlighted in an interactive graph and exported in exact JSON format required by RIFT.

🛠 Tech Stack
Frontend: React + TypeScript
Backend: FastAPI (Python)
Graph Engine: NetworkX
Visualization: react-force-graph
Deployment: Netlify

🔎 Detection Approach
Directed graph construction from CSV
Depth-limited cycle detection (≤5)
Temporal window smurfing detection (72h)
BFS-based layered shell analysis
Weighted suspicion scoring (0–100)
Optimized for datasets up to 10K transactions.

📤 Required Outputs

✔ Interactive graph visualization
✔ Fraud ring summary table
✔ Downloadable JSON file (exact required schema)
✔ Suspicion scores sorted descending

🚀 Local Setup
pip install -r requirements.txt
uvicorn main:app --reload

npm install
npm run dev
👥 Team TechTitans
Team Lead - Gnanesh M V
Team Members - Jayanth V
RIFT 2026 Hackathon – Graph Theory Track
