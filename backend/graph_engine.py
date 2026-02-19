import networkx as nx
import pandas as pd
from collections import defaultdict

def build_graph(df: pd.DataFrame):
    graph = nx.DiGraph()

    node_tx_count = defaultdict(int)
    node_amount_total = defaultdict(float)
    node_timestamps = defaultdict(list)

    for _, row in df.iterrows():
        sender = row["sender_id"]
        receiver = row["receiver_id"]
        amount = float(row["amount"])
        timestamp = pd.to_datetime(row["timestamp"])

        # 🔁 Accumulate edge amounts + track latest timestamp
        if graph.has_edge(sender, receiver):
            graph[sender][receiver]["amount"] += amount
            graph[sender][receiver]["latest_timestamp"] = max(
                graph[sender][receiver]["latest_timestamp"],
                timestamp
            )
        else:
            graph.add_edge(
                sender,
                receiver,
                amount=amount,
                latest_timestamp=timestamp
            )

        # Update sender stats
        node_tx_count[sender] += 1
        node_amount_total[sender] += amount
        node_timestamps[sender].append(timestamp)

        # Update receiver stats
        node_tx_count[receiver] += 1
        node_amount_total[receiver] += amount
        node_timestamps[receiver].append(timestamp)

    return {
        "graph": graph,
        "node_tx_count": node_tx_count,
        "node_amount_total": node_amount_total,
        "node_timestamps": node_timestamps
    }
