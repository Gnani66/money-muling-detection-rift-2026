from detectors import (
    detect_cycles,
    detect_smurfing,
    detect_layered_shell
)
from scoring import merge_and_score_accounts
from graph_engine import build_graph
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import time

app = FastAPI()

# Allow frontend connection
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"message": "Money Muling Detection API Running"}


@app.post("/upload")
async def upload_csv(file: UploadFile = File(...)):
    start_time = time.time()

    # -------------------------------------------------
    # Parse CSV
    # -------------------------------------------------
    try:
        contents = await file.read()
        if not contents:
            return {"error": "Uploaded file is empty"}

        from io import StringIO
        df = pd.read_csv(StringIO(contents.decode("utf-8")))

        required_cols = [
            "transaction_id",
            "sender_id",
            "receiver_id",
            "amount",
            "timestamp"
        ]

        for col in required_cols:
            if col not in df.columns:
                return {"error": f"Missing required column: {col}"}

        df = df[~df["transaction_id"].astype(str).str.startswith("#")]
        df = df.dropna(subset=["sender_id", "receiver_id", "amount", "timestamp"])

        df["amount"] = pd.to_numeric(df["amount"], errors="coerce")
        df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")

        df = df.dropna(subset=["amount", "timestamp"])

    except Exception as e:
        return {"error": f"Invalid CSV file: {str(e)}"}

    print("CSV parsed")

    # -------------------------------------------------
    # Build Graph
    # -------------------------------------------------
    graph_data = build_graph(df)
    graph = graph_data["graph"]

    total_accounts = len(graph.nodes())
    total_edges = len(graph.edges())

    print(f"Nodes: {total_accounts}, Edges: {total_edges}")

    # -------------------------------------------------
    # Pattern Detection (Performance Safe)
    # -------------------------------------------------

    # Enable cycles only for reasonable graph sizes
    if total_edges < 15000:
        cycle_rings, cycle_accounts = detect_cycles(graph)
    else:
        cycle_rings, cycle_accounts = [], []

    # Smurfing (fast dataframe-based)
    smurf_rings, smurf_accounts = detect_smurfing(df)

    # Layered detection (safe cutoff)
    if total_edges < 15000:
        layered_rings, layered_accounts = detect_layered_shell(
            graph,
            graph_data["node_tx_count"]
        )
    else:
        layered_rings, layered_accounts = [], []

    fraud_rings = cycle_rings + smurf_rings + layered_rings
    raw_suspicious = cycle_accounts + smurf_accounts + layered_accounts

    print("Detection done")

    # -------------------------------------------------
    # Scoring (Safe Fallback Logic)
    # -------------------------------------------------
    if raw_suspicious:
        try:
            scored_accounts = merge_and_score_accounts(
                raw_suspicious,
                graph_data["node_tx_count"],
                graph_data["node_timestamps"]
            )

            if scored_accounts:
                suspicious_accounts = scored_accounts
            else:
                suspicious_accounts = raw_suspicious

        except Exception:
            suspicious_accounts = raw_suspicious
    else:
        suspicious_accounts = []

    suspicious_lookup = {
        acc["account_id"]: acc for acc in suspicious_accounts
    }

    print("Scoring done")

    # -------------------------------------------------
    # Build Nodes (CRITICAL FIX)
    # -------------------------------------------------
    nodes = []

    for node in graph.nodes():
        suspicious_data = suspicious_lookup.get(node)

        if suspicious_data:
            nodes.append({
                "id": node,
                "is_suspicious": True,
                "suspicion_score": suspicious_data.get("suspicion_score", 0),
                "patterns": suspicious_data.get("detected_patterns", []),
                "ring_id": suspicious_data.get("ring_id"),
                "community": 0
            })
        else:
            nodes.append({
                "id": node,
                "is_suspicious": False,
                "suspicion_score": 0,
                "patterns": [],
                "ring_id": None,
                "community": 0
            })

    print("Nodes formatted")

    # -------------------------------------------------
    # Build Links
    # -------------------------------------------------
    from datetime import datetime
    now = datetime.now()

    links = []
    for u, v, data in graph.edges(data=True):
        latest_ts = data.get("latest_timestamp")
        age_days = (now - latest_ts).days if latest_ts else 999

        links.append({
            "source": u,
            "target": v,
            "amount": data.get("amount", 0),
            "age_days": age_days
        })

    print("Links formatted")

    end_time = time.time()

    return {
        "graph": {
            "nodes": nodes,
            "links": links
        },
        "suspicious_accounts": suspicious_accounts,
        "fraud_rings": fraud_rings,
        "summary": {
            "total_accounts_analyzed": total_accounts,
            "suspicious_accounts_flagged": len(suspicious_accounts),
            "fraud_rings_detected": len(fraud_rings),
            "processing_time_seconds": round(end_time - start_time, 2)
        }
    }