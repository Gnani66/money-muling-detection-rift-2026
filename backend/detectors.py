import networkx as nx
import pandas as pd
from networkx.algorithms import community


# ============================================================
# CYCLE DETECTION (Balanced & Efficient)
# ============================================================

def detect_cycles(graph, max_cycles=50):
    fraud_rings = []
    suspicious_accounts = []
    seen = set()
    ring_counter = 1
    cycle_count = 0

    if graph.number_of_edges() < 3:
        return fraud_rings, suspicious_accounts

    try:
        for cycle in nx.simple_cycles(graph):

            if len(cycle) < 3:
                continue

            # prevent excessive runtime on dense graphs
            cycle_count += 1
            if cycle_count > max_cycles:
                break

            normalized = tuple(sorted(cycle))
            if normalized in seen:
                continue
            seen.add(normalized)

            ring_id = f"RING_{ring_counter:03d}"
            ring_counter += 1

            fraud_rings.append({
                "ring_id": ring_id,
                "member_accounts": cycle,
                "pattern_type": "cycle",
                "risk_score": 0.92
            })

            for acc in cycle:
                suspicious_accounts.append({
                    "account_id": acc,
                    "suspicion_score": 0.9,
                    "detected_patterns": ["cycle"],
                    "ring_id": ring_id
                })

    except Exception:
        pass

    return fraud_rings, suspicious_accounts


# ============================================================
# SMURFING DETECTION (Realistic Banking Thresholds)
# ============================================================

def detect_smurfing(df):
    fraud_rings = []
    suspicious_accounts = []
    ring_counter = 100

    df = df.copy()
    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")

    inbound_counts = df.groupby("receiver_id").size().to_dict()

    # ------------------------------
    # FAN-IN (Aggregation Mule)
    # ------------------------------
    for receiver, group in df.groupby("receiver_id"):

        unique_senders = group["sender_id"].nunique()
        time_span = (
            group["timestamp"].max() - group["timestamp"].min()
        ).total_seconds() / 3600 if len(group) > 1 else 0

        avg_amount = group["amount"].mean()

        if (
            unique_senders >= 3
            and time_span <= 120
            and avg_amount < 5000
        ):

            ring_id = f"RING_{ring_counter:03d}"
            ring_counter += 1

            members = list(group["sender_id"].unique()) + [receiver]

            fraud_rings.append({
                "ring_id": ring_id,
                "member_accounts": members,
                "pattern_type": "fan_in",
                "risk_score": 0.85
            })

            suspicious_accounts.append({
                "account_id": receiver,
                "suspicion_score": 0.85,
                "detected_patterns": ["fan_in"],
                "ring_id": ring_id
            })

    # ------------------------------
    # FAN-OUT (Dispersal Mule)
    # ------------------------------
    for sender, group in df.groupby("sender_id"):

        unique_receivers = group["receiver_id"].nunique()
        time_span = (
            group["timestamp"].max() - group["timestamp"].min()
        ).total_seconds() / 3600 if len(group) > 1 else 0

        avg_amount = group["amount"].mean()
        received_before = inbound_counts.get(sender, 0) >= 1

        if (
            unique_receivers >= 3
            and time_span <= 120
            and avg_amount < 5000
            and received_before
        ):

            ring_id = f"RING_{ring_counter:03d}"
            ring_counter += 1

            members = [sender] + list(group["receiver_id"].unique())

            fraud_rings.append({
                "ring_id": ring_id,
                "member_accounts": members,
                "pattern_type": "fan_out",
                "risk_score": 0.88
            })

            suspicious_accounts.append({
                "account_id": sender,
                "suspicion_score": 0.88,
                "detected_patterns": ["fan_out"],
                "ring_id": ring_id
            })

    return fraud_rings, suspicious_accounts


# ============================================================
# LAYERED SHELL DETECTION (Chain-Based Mule Flow)
# ============================================================

def detect_layered_shell(graph, node_tx_count, max_paths=50):
    fraud_rings = []
    suspicious_accounts = []
    visited = set()
    ring_counter = 200
    path_count = 0

    if graph.number_of_edges() < 4:
        return fraud_rings, suspicious_accounts

    for source in graph.nodes():

        if graph.out_degree(source) < 1:
            continue

        for target in graph.nodes():

            if source == target:
                continue

            try:
                paths = nx.all_simple_paths(graph, source, target, cutoff=4)
            except Exception:
                continue

            for path in paths:

                if len(path) < 4:
                    continue

                path_count += 1
                if path_count > max_paths:
                    break

                path_tuple = tuple(path)
                if path_tuple in visited:
                    continue

                visited.add(path_tuple)

                intermediate = path[1:-1]

                # intermediate accounts lightly active
                if not any(node_tx_count.get(n, 0) <= 5 for n in intermediate):
                    continue

                ring_id = f"RING_{ring_counter:03d}"
                ring_counter += 1

                fraud_rings.append({
                    "ring_id": ring_id,
                    "member_accounts": path,
                    "pattern_type": "layered_shell",
                    "risk_score": 0.89
                })

                for node in intermediate:
                    suspicious_accounts.append({
                        "account_id": node,
                        "suspicion_score": 0.85,
                        "detected_patterns": ["layered_shell"],
                        "ring_id": ring_id
                    })

    return fraud_rings, suspicious_accounts


# ============================================================
# COMMUNITY DETECTION
# ============================================================

def detect_communities(graph):
    node_community = {}

    try:
        undirected = graph.to_undirected()

        if undirected.number_of_nodes() < 3:
            for node in undirected.nodes():
                node_community[node] = 0
            return node_community

        communities_generator = community.greedy_modularity_communities(
            undirected
        )

        for i, comm in enumerate(communities_generator):
            for node in comm:
                node_community[node] = i

    except Exception:
        for node in graph.nodes():
            node_community[node] = 0

    return node_community


# ============================================================
# MASTER FUNCTION
# ============================================================

def run_fraud_detection(graph, df, node_tx_count):

    fraud_rings = []
    suspicious_accounts = []

    c_rings, c_susp = detect_cycles(graph)
    s_rings, s_susp = detect_smurfing(df)
    l_rings, l_susp = detect_layered_shell(graph, node_tx_count)

    fraud_rings.extend(c_rings)
    fraud_rings.extend(s_rings)
    fraud_rings.extend(l_rings)

    suspicious_accounts.extend(c_susp)
    suspicious_accounts.extend(s_susp)
    suspicious_accounts.extend(l_susp)

    # Remove duplicate suspicious accounts (merge patterns)
    merged = {}
    for acc in suspicious_accounts:
        acc_id = acc["account_id"]

        if acc_id not in merged:
            merged[acc_id] = acc
        else:
            merged[acc_id]["detected_patterns"] = list(
                set(merged[acc_id]["detected_patterns"] + acc["detected_patterns"])
            )
            merged[acc_id]["suspicion_score"] = max(
                merged[acc_id]["suspicion_score"],
                acc["suspicion_score"]
            )

    return fraud_rings, list(merged.values())